package org.calendarledger.preview.test;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.*;
import android.view.*;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import org.json.*;
import java.io.*;
import java.lang.reflect.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

/** Checks the real permission window, local native engine, and known PCM audio. */
public class VoiceRuntimeTest extends Instrumentation {
    private Bundle args;private Activity activity;private WebView web;private final JSONArray findings=new JSONArray();
    @Override public void onCreate(Bundle args){super.onCreate(args);this.args=args;start();}
    @Override public void onStart(){
        JSONObject report=new JSONObject();int code=0;
        try{
            getUiAutomation();
            activity=startActivitySync(new Intent().setClassName("org.calendarledger.preview","org.calendarledger.preview.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            runOnMainSync(()->web=findWeb(activity.getWindow().getDecorView()));
            waitFor("!!globalThis.calendarLedgerPreview",15000);SystemClock.sleep(900);
            String phase=args.getString("phase","grant");report.put("phase",phase).put("androidApi",Build.VERSION.SDK_INT).put("webview",WebView.getCurrentWebViewPackage().versionName);
            report.put("applicationSource",activity.getApplicationInfo().sourceDir).put("packageSource",getTargetContext().getPackageManager().getApplicationInfo("org.calendarledger.preview",0).sourceDir);
            try(java.util.zip.ZipFile apk=new java.util.zip.ZipFile(activity.getApplicationInfo().sourceDir)){JSONArray names=new JSONArray();java.util.Enumeration<? extends java.util.zip.ZipEntry> list=apk.entries();while(list.hasMoreElements()){java.util.zip.ZipEntry e=list.nextElement();if(e.getName().startsWith("assets/speech"))names.put(new JSONObject().put("name",e.getName()).put("size",e.getSize()));}report.put("speechArchiveEntries",names);}
            if("pcm".equals(phase))decodeAudio(report);
            else if("baseline".equals(phase))baseline(report);
            else permission(phase,report);
            report.put("passed",true).put("findings",findings);
        }catch(Throwable error){code=1;try{report.put("passed",false).put("error",error.toString()).put("findings",findings);if(web!=null)report.put("page",eval("document.body.innerText.slice(-2000)"));}catch(Exception ignored){}}
        Bundle result=new Bundle();result.putString("result",report.toString());finish(code,result);
    }
    private WebView findWeb(View view){if(view instanceof WebView)return(WebView)view;if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++){WebView found=findWeb(group.getChildAt(i));if(found!=null)return found;}}return null;}
    private String eval(String expression)throws Exception{
        CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();runOnMainSync(()->web.evaluateJavascript(expression,result->{value.set(result);latch.countDown();}));
        if(!latch.await(10,TimeUnit.SECONDS))throw new AssertionError("WebView evaluation timeout");return String.valueOf(new JSONTokener(value.get()).nextValue());
    }
    private boolean truth(String expression)throws Exception{return "true".equals(eval(expression));}
    private void waitFor(String expression,long timeout)throws Exception{long end=SystemClock.elapsedRealtime()+timeout;while(SystemClock.elapsedRealtime()<end){if(truth(expression))return;SystemClock.sleep(100);}throw new AssertionError("Not reached: "+expression);}
    private void check(String name,boolean passed)throws Exception{android.util.Log.i("CalendarVoiceQA",name+"="+passed);findings.put(new JSONObject().put("check",name).put("passed",passed));if(!passed)throw new AssertionError(name);}
    private Object voice()throws Exception{Field field=activity.getClass().getDeclaredField("voice");field.setAccessible(true);return field.get(activity);}
    private String voiceSession()throws Exception{Object value=voice();Field field=value.getClass().getDeclaredField("session");field.setAccessible(true);return(String)field.get(value);}
    private void lifecycle(String name){runOnMainSync(()->{try{Object value=voice();String hook="onStop".equals(name)?"paused":"resumed";Method method;try{method=value.getClass().getDeclaredMethod(hook);}catch(NoSuchMethodException oldVersion){if("onResume".equals(name))return;method=value.getClass().getDeclaredMethod("destroy");}method.setAccessible(true);method.invoke(value);}catch(Exception error){throw new RuntimeException(error);}});}
    private void permissionButton(boolean allow)throws Exception{
        long end=SystemClock.elapsedRealtime()+6000;String[] ids=allow?new String[]{"permission_allow_foreground_only_button","permission_allow_one_time_button","permission_allow_button"}:new String[]{"permission_deny_button"};
        while(SystemClock.elapsedRealtime()<end){AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();if(root!=null){for(String id:ids)for(AccessibilityNodeInfo node:root.findAccessibilityNodeInfosByViewId("com.android.permissioncontroller:id/"+id))if(node.performAction(AccessibilityNodeInfo.ACTION_CLICK))return;}SystemClock.sleep(150);}
        throw new AssertionError("Permission button missing");
    }
    private void openVoice()throws Exception{
        eval("document.querySelector('.mobile-nav [data-action=open-ai]').click();document.querySelector('#chat-input').value='保留这条未发送的文字';document.querySelector('#chat-input').dispatchEvent(new Event('input',{bubbles:true}));globalThis.__voiceInputBefore=document.querySelector('#chat-input');globalThis.__voiceBusinessBefore=JSON.stringify({transactions:calendarLedgerPreview.getState().transactions,events:calendarLedgerPreview.getState().events});document.querySelector('.mic-button').click()");
        waitFor("!document.querySelector('#voice-status').hidden && document.querySelector('#voice-caption').textContent.includes('允许')",8000);
    }
    private void baseline(JSONObject report)throws Exception{
        openVoice();check("old APK requests microphone permission",!voiceSession().isEmpty());
        lifecycle("onStop");permissionButton(true);SystemClock.sleep(500);lifecycle("onResume");
        check("reproduced old session lost during permission-window stop",voiceSession().isEmpty()&&truth("document.querySelector('#voice-status').hidden"));
        report.put("reproduction","real permission request; native voice hooks called by onStop/onResume explicitly simulated, without manually stopping Android's Window");
    }
    private void permission(String phase,JSONObject report)throws Exception{
        check("delivery version is 0.2.2","0.2.2".equals(getTargetContext().getPackageManager().getPackageInfo("org.calendarledger.preview",0).versionName));
        String business=eval("(() => {const s=calendarLedgerPreview.getState();function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}return JSON.stringify(canonical({transactions:s.transactions,events:s.events,tasks:s.tasks}));})()");
        check("signed upgrade preserves old transactions schedules and tasks",business.equals(getTargetContext().getSharedPreferences("qa-chat",0).getString("business","")));
        check("system SpeechRecognizer service is unavailable in repaired tests",!android.speech.SpeechRecognizer.isRecognitionAvailable(getTargetContext()));
        check("permission absent before tapping microphone",getTargetContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED);
        openVoice();check("real permission window keeps composer and shows pending state",truth("document.querySelector('#chat-input')===__voiceInputBefore && document.querySelector('#voice-caption').textContent.includes('允许')"));
        if("deny".equals(phase)){
            permissionButton(false);waitFor("!document.querySelector('#voice-error').hidden",6000);
            check("denial produces useful persistent permission message",truth("document.querySelector('#voice-error-message').textContent.includes('权限') && !document.querySelector('#chat-form button[type=submit]').disabled"));
            SystemClock.sleep(3800);check("error remains visible after toast duration",truth("!document.querySelector('#voice-error').hidden && document.querySelector('#chat-input').value==='保留这条未发送的文字'"));
            screenshot("qa-voice-permission-v0.2.2.png");
            eval("document.querySelector('[data-action=voice-keyboard]').click()");SystemClock.sleep(650);
            check("keyboard fallback focuses the same draft without sending",truth("document.activeElement===__voiceInputBefore && __voiceInputBefore.value==='保留这条未发送的文字' && document.querySelector('#voice-error').hidden"));
        }else{
            lifecycle("onStop");check("pending voice session survives simulated permission-window onStop",!voiceSession().isEmpty());
            permissionButton(true);SystemClock.sleep(500);
            check("permission grant preserves the session until recording starts",getTargetContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED&&!voiceSession().isEmpty());
            lifecycle("onResume");waitFor("document.querySelector('#voice-status').dataset.state==='listening'",25000);
            check("grant continues to actual AudioRecord listening with no system speech service",truth("!document.querySelector('#voice-status').hidden && document.querySelector('.mic-button').classList.contains('recording') && document.querySelector('#voice-caption').textContent.includes('正在听')"));
            check("bundled Mandarin model prepared privately",new File(getTargetContext().getNoBackupFilesDir(),"speech/vosk-model-small-cn-0.22/.complete").isFile());
            SystemClock.sleep(500);screenshot("qa-voice-listening-v0.2.2.png");
            eval("document.querySelector('[data-action=voice-cancel]').click()");waitFor("document.querySelector('#voice-status').hidden",5000);SystemClock.sleep(300);
            check("cancel releases session and leaves text unchanged",voiceSession().isEmpty()&&truth("document.querySelector('#chat-input')===__voiceInputBefore && __voiceInputBefore.value==='保留这条未发送的文字'"));
            eval("document.querySelector('.mic-button').click()");waitFor("document.querySelector('#voice-status').dataset.state==='listening'",5000);
            check("already granted retry starts without another permission request",truth("document.querySelector('#voice-status').dataset.state==='listening'"));
            eval("document.querySelector('[data-action=voice-stop]').click()");waitFor("document.querySelector('#voice-status').hidden",10000);
            check("silent input completes with an actionable error instead of a stuck state",truth("!document.querySelector('#voice-error').hidden && !document.querySelector('#chat-form button[type=submit]').disabled"));
            eval("document.querySelector('.mic-button').click()");waitFor("document.querySelector('#voice-status').dataset.state==='listening'",5000);
            lifecycle("onStop");waitFor("document.querySelector('#voice-status').hidden",5000);
            check("background transition cancels recording",voiceSession().isEmpty());lifecycle("onResume");
        }
        check("permission and recording never modify business records",truth("JSON.stringify({transactions:calendarLedgerPreview.getState().transactions,events:calendarLedgerPreview.getState().events})===__voiceBusinessBefore"));
    }
    private static int le32(byte[] data,int offset){return(data[offset]&255)|((data[offset+1]&255)<<8)|((data[offset+2]&255)<<16)|((data[offset+3]&255)<<24);}
    private void decodeAudio(JSONObject report)throws Exception{
        ClassLoader loader=activity.getClassLoader();Class<?> store=Class.forName("org.calendarledger.preview.SpeechModelStore",true,loader);
        Method ensure=store.getDeclaredMethod("ensure",Context.class);ensure.setAccessible(true);File directory=(File)ensure.invoke(null,getTargetContext());
        Class<?> modelType=Class.forName("org.vosk.Model",true,loader),recognizerType=Class.forName("org.vosk.Recognizer",true,loader);
        Object model=modelType.getConstructor(String.class).newInstance(directory.getAbsolutePath());Object recognizer=recognizerType.getConstructor(modelType,float.class).newInstance(model,16000f);
        try{
            File sample=new File(activity.getExternalFilesDir(null),"mandarin-ledger.wav");byte[] wav=new byte[(int)sample.length()];try(DataInputStream input=new DataInputStream(new FileInputStream(sample))){input.readFully(wav);}
            check("known Chinese PCM fixture is RIFF WAV",new String(wav,0,4,"US-ASCII").equals("RIFF"));int offset=12,length=0;
            while(offset+8<=wav.length){int size=le32(wav,offset+4);if(new String(wav,offset,4,"US-ASCII").equals("data")){offset+=8;length=size;break;}offset+=8+size+(size&1);}
            if(length<=0||offset+length>wav.length)throw new AssertionError("WAV data missing");
            Method accept=recognizerType.getMethod("acceptWaveForm",byte[].class,int.class),get=recognizerType.getMethod("getResult");StringBuilder combined=new StringBuilder();
            for(int p=offset;p<offset+length;){int count=Math.min(6400,offset+length-p);byte[] chunk=Arrays.copyOfRange(wav,p,p+count);if((Boolean)accept.invoke(recognizer,chunk,count))combined.append(new JSONObject((String)get.invoke(recognizer)).optString("text"));p+=count;}
            combined.append(new JSONObject((String)recognizerType.getMethod("getFinalResult").invoke(recognizer)).optString("text"));
            Method clean=Class.forName("org.calendarledger.preview.VoiceInput",true,loader).getDeclaredMethod("cleanTranscript",String.class);clean.setAccessible(true);String transcript=(String)clean.invoke(null,combined.toString());
            report.put("reference","今天午饭三十八元，地铁六元。明天下午两点开会。").put("transcript",transcript).put("syntheticAudio","Microsoft Huihui Desktop zh-CN, 16 kHz mono PCM; actual Vosk decoder, no mocked transcript");
            check("real offline native decoder recognizes Mandarin keywords",transcript.contains("午饭")&&transcript.contains("地铁")&&transcript.contains("明天"));
            eval("document.querySelector('.mobile-nav [data-action=open-ai]').click();globalThis.__pcmInput=document.querySelector('#chat-input');__pcmInput.value='';__pcmInput.dispatchEvent(new Event('input',{bubbles:true}));globalThis.__pcmTxBefore=calendarLedgerPreview.getState().transactions.length;globalThis.__nativeStart=CalendarAndroid.startVoice;CalendarAndroid={...CalendarAndroid,startVoice:id=>{globalThis.__pcmSession=id;}};document.querySelector('.mic-button').click();");
            eval("__calendarVoiceEvent({session:__pcmSession,state:'result',text:"+JSONObject.quote(transcript)+"})");
            check("actual recognized transcript fills an editable draft without auto-send",truth("document.querySelector('#chat-input')===__pcmInput && __pcmInput.value==="+JSONObject.quote(transcript)+" && calendarLedgerPreview.getState().transactions.length===__pcmTxBefore && document.querySelector('#voice-status').hidden"));
            SystemClock.sleep(700);screenshot("qa-voice-transcript-v0.2.2.png");
        }finally{recognizerType.getMethod("close").invoke(recognizer);modelType.getMethod("close").invoke(model);}
    }
    private void screenshot(String name)throws Exception{android.graphics.Bitmap image=getUiAutomation().takeScreenshot();if(image==null)throw new AssertionError("Screenshot unavailable");try(OutputStream out=new FileOutputStream(new File(activity.getExternalFilesDir(null),name))){image.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}finally{image.recycle();}}
}
