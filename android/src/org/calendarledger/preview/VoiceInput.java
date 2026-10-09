package org.calendarledger.preview;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.*;
import android.webkit.WebView;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Foreground Mandarin dictation. Audio is decoded locally and never uploaded. */
final class VoiceInput {
    static final int PERMISSION_CODE=43;
    private final Activity activity;
    private final WebView web;
    private final Handler ui=new Handler(Looper.getMainLooper());
    private final ExecutorService decoder=Executors.newSingleThreadExecutor();
    private String session="";
    private boolean foreground,permissionInFlight,awaitingForeground,closed;
    private Job job;
    // Model is owned exclusively by the decoder's single worker.
    private Model model;
    private static final class Job {
        final String token;
        volatile boolean cancelled,stop;
        Job(String token){this.token=token;}
    }
    VoiceInput(Activity activity,WebView web){this.activity=activity;this.web=web;}
    private void event(String token,String state,String text){
        if(!token.equals(session))return;
        try{
            JSONObject value=new JSONObject().put("session",token).put("state",state).put(state.equals("error")?"error":"text",text);
            web.evaluateJavascript("window.__calendarVoiceEvent && window.__calendarVoiceEvent("+value.toString()+")",null);
        }catch(Exception ignored){}
    }
    void start(String token){
        if(closed||token==null||!token.matches("[A-Za-z0-9_-]{1,100}"))return;
        cancel(session);session=token;
        if(activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
            permissionInFlight=true;awaitingForeground=true;
            event(token,"permission","请在权限窗口允许使用麦克风，允许后会自动继续。");
            activity.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},PERMISSION_CODE);return;
        }
        awaitingForeground=true;startWhenForeground();
    }
    void permissionResult(int[] grants){
        permissionInFlight=false;if(session.isEmpty())return;
        if(grants.length==0||grants[0]!=PackageManager.PERMISSION_GRANTED){finish(session,"error","麦克风权限未开启。点“打开权限设置”，允许麦克风后再点重试。");return;}
        awaitingForeground=true;event(session,"preparing","麦克风已允许，正在准备中文语音…");
        // Samsung can return a grant before the app resumes and regains focus.
        ui.post(this::startWhenForeground);
    }
    void resumed(){foreground=true;startWhenForeground();}
    void windowFocusChanged(boolean focused){if(focused)startWhenForeground();}
    void paused(){foreground=false;if(!permissionInFlight)cancel(session);}
    private void startWhenForeground(){
        if(closed||!awaitingForeground||permissionInFlight||session.isEmpty()||job!=null||!foreground||!activity.hasWindowFocus())return;
        awaitingForeground=false;
        if(activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){finish(session,"error","麦克风权限已关闭，请允许后重试。");return;}
        AudioManager privacy=(AudioManager)activity.getSystemService(Context.AUDIO_SERVICE);
        if(privacy!=null&&privacy.isMicrophoneMute()){finish(session,"error","手机的“麦克风访问”总开关已关闭。请在快捷设置打开后重试。");return;}
        Job current=new Job(session);job=current;
        event(current.token,"preparing","正在准备内置中文语音，首次使用需要几秒…");decoder.execute(()->recognize(current));
    }
    private void post(Job current,String state,String text){ui.post(()->{if(!current.cancelled)event(current.token,state,text);});}
    static String cleanTranscript(String text){return text.trim().replaceAll("(?<=[\\u4e00-\\u9fff0-9])\\s+(?=[\\u4e00-\\u9fff0-9])","");}
    private static String text(String json,String key)throws Exception{return cleanTranscript(new JSONObject(json).optString(key,""));}
    private void recognize(Job current){
        AudioRecord audio=null;Recognizer recognizer=null;StringBuilder committed=new StringBuilder();String result="",error="";
        try{
            if(model==null)model=new Model(SpeechModelStore.ensure(activity).getAbsolutePath());
            if(current.cancelled)return;
            if(current.stop){error="语音准备已停止，可以点麦克风重新开始。";return;}
            recognizer=new Recognizer(model,16000f);
            int minimum=AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT);
            if(minimum<=0)throw new IllegalStateException("麦克风不支持当前录音格式。");
            audio=new AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION).setAudioFormat(new AudioFormat.Builder().setSampleRate(16000).setChannelMask(AudioFormat.CHANNEL_IN_MONO).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build()).setBufferSizeInBytes(Math.max(8192,minimum*2)).build();
            if(audio.getState()!=AudioRecord.STATE_INITIALIZED)throw new IllegalStateException("麦克风初始化失败，请关闭其他录音应用后重试。");
            if(current.cancelled)return;
            if(current.stop){error="语音已停止，可以点麦克风重新开始。";return;}
            audio.startRecording();if(audio.getRecordingState()!=AudioRecord.RECORDSTATE_RECORDING)throw new IllegalStateException("麦克风没有开始录音，请检查权限。");
            post(current,"listening","正在听，请说话。停顿后会回填文字，也可以点完成。");
            short[] samples=new short[1600];long started=SystemClock.elapsedRealtime(),lastVoice=started;String lastPartial="";boolean heard=false;
            while(!current.cancelled&&!current.stop){
                int count=audio.read(samples,0,samples.length);if(count<0)throw new IllegalStateException("录音中断，请关闭其他使用麦克风的应用后重试。");if(count==0)continue;
                long now=SystemClock.elapsedRealtime();double energy=0;for(int i=0;i<count;i++)energy+=(double)samples[i]*samples[i];if(Math.sqrt(energy/count)>160){lastVoice=now;heard=true;}
                String partial;
                if(recognizer.acceptWaveForm(samples,count)){
                    String segment=text(recognizer.getResult(),"text");if(!segment.isEmpty()){if(committed.length()>0)committed.append('，');committed.append(segment);}partial=committed.toString();
                }else{
                    String segment=text(recognizer.getPartialResult(),"partial");partial=committed+(committed.length()>0&&!segment.isEmpty()?"，":"")+segment;
                }
                if(!partial.equals(lastPartial)){lastPartial=partial;post(current,"partial",partial.isEmpty()?"正在听，请说话…":partial);}
                if(now-started>60000||(!lastPartial.isEmpty()&&now-lastVoice>1900))break;
                if(!heard&&now-started>10000){error="麦克风没有收到声音。请检查手机的麦克风访问开关，或靠近麦克风后重试。";break;}
            }
            if(!current.cancelled){
                post(current,"processing","正在整理识别文字…");String tail=text(recognizer.getFinalResult(),"text");result=committed+(committed.length()>0&&!tail.isEmpty()?"，":"")+tail;
                if(result.trim().isEmpty()&&error.isEmpty())error="没有识别到文字，请靠近麦克风再说一次。";
            }
        }catch(SecurityException exception){error="麦克风权限未生效，请在应用权限中允许麦克风后重试。";}
        catch(Throwable exception){error=exception.getMessage()==null?"中文语音启动失败，请重试或使用键盘语音输入。":"中文语音未完成："+exception.getMessage();}
        finally{
            if(audio!=null){try{audio.stop();}catch(Exception ignored){}audio.release();}
            if(recognizer!=null)try{recognizer.close();}catch(Exception ignored){}
            final String transcript=result,message=error;
            ui.post(()->{if(current.cancelled||job!=current||!current.token.equals(session))return;finish(current.token,message.isEmpty()?"result":"error",message.isEmpty()?transcript:message);});
        }
    }
    void stop(String token){if(!token.equals(session))return;if(job==null){cancel(token);return;}job.stop=true;event(token,"processing","正在整理识别文字…");}
    void cancel(String token){if(session.isEmpty()||!token.equals(session))return;finish(token,"cancelled","");}
    private void finish(String token,String state,String text){if(!token.equals(session))return;event(token,state,text);session="";awaitingForeground=false;if(job!=null){job.cancelled=true;job=null;}}
    void close(){if(closed)return;closed=true;permissionInFlight=false;cancel(session);decoder.execute(()->{if(model!=null){try{model.close();}catch(Exception ignored){}model=null;}});decoder.shutdown();}
}
