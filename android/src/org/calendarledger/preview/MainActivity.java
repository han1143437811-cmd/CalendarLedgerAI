package org.calendarledger.preview;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.provider.MediaStore;
import android.provider.Settings;
import android.security.keystore.*;
import android.util.Base64;
import android.view.*;
import android.webkit.*;
import android.widget.FrameLayout;
import org.json.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
    private WebView web;
    private final ExecutorService pool=Executors.newFixedThreadPool(3);
    private final Handler ui=new Handler(Looper.getMainLooper());
    private ValueCallback<Uri[]> fileCallback;
    private SharedPreferences preferences;
    private ApiConnections apiConnections;
    private VoiceInput voice;
    private WeatherController weather;
    private JSONObject pendingWidgetNavigation;
    private boolean widgetPageReady;
    private static final String ORIGIN="https://calendar-ledger.local/",KEY_ALIAS="calendar-ledger-api-v1";
    @Override public void onCreate(Bundle savedInstanceState){
        super.onCreate(savedInstanceState);preferences=getSharedPreferences("api-config",MODE_PRIVATE);apiConnections=new ApiConnections(preferences,this::secretKey);acceptWidgetIntent(getIntent());
        weather=new WeatherController(this,pool,()->{
            CalendarWidgetProvider.weatherChanged(MainActivity.this);
            ui.post(()->{if(web!=null&&!isFinishing())web.evaluateJavascript("globalThis.dispatchEvent(new Event('calendar-weather-changed'))",null);});
        });
        FrameLayout frame=new FrameLayout(this);frame.setBackgroundColor(Color.rgb(252,251,248));web=new WebView(this);frame.addView(web,new FrameLayout.LayoutParams(-1,-1));setContentView(frame);voice=new VoiceInput(this,web);
        if(Build.VERSION.SDK_INT>=30){getWindow().setDecorFitsSystemWindows(false);getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);frame.setOnApplyWindowInsetsListener((v,insets)->{android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());android.graphics.Insets ime=insets.getInsets(WindowInsets.Type.ime());v.setPadding(bars.left,bars.top,bars.right,Math.max(bars.bottom,ime.bottom));return insets;});}
        else{frame.setFitsSystemWindows(true);getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);}
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSupportZoom(false);settings.setTextZoom(100);if(Build.VERSION.SDK_INT>=29)settings.setForceDark(WebSettings.FORCE_DARK_OFF);
        web.addJavascriptInterface(new Bridge(),"CalendarAndroid");
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){if("calendar-ledger.local".equals(request.getUrl().getHost()))return false;String scheme=request.getUrl().getScheme();if("https".equals(scheme)||"http".equals(scheme)){try{startActivity(new Intent(Intent.ACTION_VIEW,request.getUrl()));}catch(Exception ignored){}}return true;}
        });
        web.setWebChromeClient(new WebChromeClient(){@Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;boolean images=false;for(String accept:params.getAcceptTypes())if(accept.startsWith("image/"))images=true;Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.setType(images?"image/*":"application/json");intent.addCategory(Intent.CATEGORY_OPENABLE);intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,images&&params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);try{startActivityForResult(intent,41);}catch(Exception ex){fileCallback.onReceiveValue(null);fileCallback=null;}return true;}});
        if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,()->handleBack());
        loadLocalUI();
    }
    private void acceptWidgetIntent(Intent intent){
        if(intent==null||!CalendarWidgetProvider.OPEN.equals(intent.getAction()))return;
        String target=intent.getStringExtra("widgetTarget"),date=intent.getStringExtra("widgetDate");
        try{
            if(!"ai".equals(target)&&!"date".equals(target))return;
            if("date".equals(target)){
                if(date==null||!date.matches("\\d{4}-\\d{2}-\\d{2}"))return;
                java.time.LocalDate parsed=java.time.LocalDate.parse(date);
                if(parsed.getYear()<2020||parsed.getYear()>2100)return;
            }
            pendingWidgetNavigation=new JSONObject().put("target",target).put("date","date".equals(target)?date:"");
        }catch(Exception ignored){}
    }
    private void deliverWidgetNavigation(){
        if(!widgetPageReady||web==null||isFinishing()||pendingWidgetNavigation==null)return;
        JSONObject navigation=pendingWidgetNavigation;pendingWidgetNavigation=null;
        web.evaluateJavascript("globalThis.__calendarWidgetNavigate && globalThis.__calendarWidgetNavigate("+navigation.toString()+")",null);
    }
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);acceptWidgetIntent(intent);deliverWidgetNavigation();}
    private void loadLocalUI(){
        try(InputStream input=getResources().openRawResource(R.raw.mobile_shell)){
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int count;
            while((count=input.read(buffer))!=-1)bytes.write(buffer,0,count);
            // The base URL only defines storage/same-origin behavior. No URL is
            // navigated to: CSS, JS, icons and holiday seeds are in this document.
            web.loadDataWithBaseURL(ORIGIN,new String(bytes.toByteArray(),StandardCharsets.UTF_8),"text/html","utf-8",ORIGIN);
        }catch(IOException|android.content.res.Resources.NotFoundException error){
            android.util.Log.e("CalendarLedger","Cannot read packaged startup document",error);
            android.widget.TextView failure=new android.widget.TextView(this);failure.setText("应用资源无法读取，请安装完整的日历账本安装包。");failure.setTextSize(18);failure.setPadding(32,64,32,32);setContentView(failure);
        }
    }
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==41&&fileCallback!=null){ArrayList<Uri> uris=new ArrayList<>();if(result==RESULT_OK&&data!=null){if(data.getClipData()!=null){for(int index=0;index<data.getClipData().getItemCount();index++)uris.add(data.getClipData().getItemAt(index).getUri());}else if(data.getData()!=null)uris.add(data.getData());}fileCallback.onReceiveValue(uris.isEmpty()?null:uris.toArray(new Uri[0]));fileCallback=null;}}
    @Override public void onBackPressed(){handleBack();}
    private void handleBack(){web.evaluateJavascript("(() => {if(document.querySelector('.modal')){document.querySelector('[data-action=close-modal]').click();return true;}if(document.querySelector('.ai-panel.open')){document.querySelector('[data-action=close-ai]').click();return true;}return false;})()",value->{if(!"true".equals(value))finish();});}
    @Override protected void onStart(){super.onStart();if(weather!=null)weather.opened();}
    @Override protected void onStop(){if(weather!=null)weather.stopped();if(voice!=null)voice.paused();super.onStop();}
    @Override protected void onDestroy(){chatTransport.close();if(voice!=null)voice.close();if(isFinishing()){web.removeJavascriptInterface("CalendarAndroid");web.destroy();pool.shutdown();}super.onDestroy();}
    @Override protected void onResume(){super.onResume();if(voice!=null)voice.resumed();if(web!=null)web.evaluateJavascript("window.__calendarResync && window.__calendarResync()",null);}
    @Override public void onWindowFocusChanged(boolean focused){super.onWindowFocusChanged(focused);if(voice!=null)voice.windowFocusChanged(focused);}
    @Override public void onRequestPermissionsResult(int code,String[] names,int[] grants){super.onRequestPermissionsResult(code,names,grants);if(code==VoiceInput.PERMISSION_CODE&&voice!=null)voice.permissionResult(grants);if(web!=null)web.evaluateJavascript("window.__calendarResync && window.__calendarResync()",null);}
    private JSONObject publicConfig()throws Exception{return apiConnections.publicConfig();}
    private javax.crypto.SecretKey secretKey()throws Exception{KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);if(!store.containsAlias(KEY_ALIAS)){KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());return generator.generateKey();}return(javax.crypto.SecretKey)store.getKey(KEY_ALIAS,null);}

    private String readKey()throws Exception{return apiConnections.readActiveKey();}
    private JSONObject httpJSON(String address,JSONObject payload,String key,int timeout)throws Exception{URL url=new URL(address);if(!"https".equals(url.getProtocol()))throw new IOException("手机端远程接口需要 HTTPS。");HttpURLConnection connection=(HttpURLConnection)url.openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(Math.min(timeout,20000));connection.setReadTimeout(timeout);connection.setRequestProperty("Accept","application/json");if(key!=null&&!key.isEmpty())connection.setRequestProperty("Authorization","Bearer "+key);if(payload!=null){connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json; charset=utf-8");if(key!=null&&!key.isEmpty())connection.setRequestProperty("Authorization","Bearer "+key);try(OutputStream stream=connection.getOutputStream()){stream.write(payload.toString().getBytes(StandardCharsets.UTF_8));}}
        try{int code=connection.getResponseCode();InputStream input=code>=400?connection.getErrorStream():connection.getInputStream();if(input==null)throw new IOException("接口没有返回内容（"+code+"）。");ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[8192];try(InputStream stream=input){int count;while((count=stream.read(buffer))>=0){bytes.write(buffer,0,count);if(bytes.size()>8_000_000)throw new IOException("接口返回内容过大。");}}JSONObject response=new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8));if(code>=400){String detail=response.optJSONObject("error")!=null?response.optJSONObject("error").optString("message"):response.optString("message","请求失败");if(key!=null&&!key.isEmpty())detail=detail.replace(key,"[已隐藏]");throw new IOException("API 错误 "+code+"："+detail.substring(0,Math.min(detail.length(),250)));}return response;}finally{connection.disconnect();}}
    private final ChatTransport chatTransport=new ChatTransport();
    private JSONObject streamCompletion(String id,JSONObject body)throws Exception{
        String key=readKey();if(key.isEmpty())throw new IOException("请先连接 API。");
        JSONArray messages=body.optJSONArray("messages"),tools=body.optJSONArray("tools");
        if(messages==null||messages.length()<1||messages.length()>300||body.toString().length()>12_000_000)throw new IOException("会话格式不正确或过长。");
        if(tools!=null&&tools.length()>96)throw new IOException("工具数量过多。");
        String base=preferences.getString("baseURL","https://api.deepseek.com");
        JSONObject payload=new JSONObject().put("model",preferences.getString("model","deepseek-flash")).put("messages",messages).put("stream",body.optBoolean("stream"));
        if(tools!=null&&tools.length()>0)payload.put("tools",tools).put("tool_choice","auto");
        AiRequestOptions.apply(payload,new JSONObject(body.toString()).put("thinkingFormat",preferences.getString("thinkingFormat","auto")),base);
        return chatTransport.post(id,ApiEndpoints.endpoint(base,"chat/completions"),payload,key,text->{String callback="window.__calendarNativeProgress && window.__calendarNativeProgress("+JSONObject.quote(id)+","+JSONObject.quote(text)+")";ui.post(()->{if(!isFinishing())web.evaluateJavascript(callback,null);});});
    }
    private JSONObject completion(JSONObject body)throws Exception{String key=readKey();if(key.isEmpty())throw new IOException("请先在设置中填写 API Key。");String base=preferences.getString("baseURL","https://api.deepseek.com");JSONArray messages=body.optJSONArray("messages");if(messages==null||messages.length()>300||body.toString().length()>12_000_000)throw new IOException("会话格式不正确或过长。");JSONObject payload=new JSONObject().put("model",preferences.getString("model","deepseek-flash")).put("messages",messages).put("stream",false).put("max_tokens",2048);JSONArray tools=body.optJSONArray("tools");if(tools!=null){if(tools.length()>96)throw new IOException("工具数量过多。");payload.put("tools",tools).put("tool_choice","auto");}AiRequestOptions.apply(payload,new JSONObject(body.toString()).put("thinkingFormat",preferences.getString("thinkingFormat","auto")),base);JSONObject result=httpJSON(ApiEndpoints.endpoint(base,"chat/completions"),payload,key,"none".equals(body.optString("effort","none"))?110000:300000);if("length".equals(result.getJSONArray("choices").getJSONObject(0).optString("finish_reason")))throw new IOException("模型输出达到长度上限，尚未收到完整回复；已完成的本地操作保留。");JSONObject message=result.getJSONArray("choices").getJSONObject(0).getJSONObject("message");return new JSONObject().put("message",message).put("model",result.optString("model",payload.getString("model")));}
    private JSONObject holidays(int year)throws Exception{if(year<2020||year>2100)throw new IOException("节假日年份不正确。");String[] sources={"https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/"+year+".json","https://fastly.jsdelivr.net/gh/NateScarlet/holiday-cn@master/"+year+".json","https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/"+year+".json"};Exception last=null;for(String source:sources){try{JSONObject result=httpJSON(source,null,null,12000);if(result.optInt("year")!=year||result.optJSONArray("days")==null||result.optJSONArray("papers")==null)throw new IOException("节假日数据格式不正确。");return result.put("dataURL",source);}catch(Exception ex){last=ex;}}throw new IOException("节假日联网更新失败，仍可使用缓存。"+(last==null?"":last.getMessage()));}
    private JSONObject saveDownload(JSONObject body)throws Exception{String name=body.getString("filename").replaceAll("[\\\\/:*?\"<>|\\r\\n]","_");if(name.length()>100)name=name.substring(0,100);String data=body.getString("data");if(data.length()>8_000_000)throw new IOException("导出文件过大。");Uri uri;if(Build.VERSION.SDK_INT>=29){ContentValues values=new ContentValues();values.put(MediaStore.Downloads.DISPLAY_NAME,name);values.put(MediaStore.Downloads.MIME_TYPE,"csv".equals(body.optString("format"))?"text/csv":"application/json");values.put(MediaStore.Downloads.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS+"/日历账本");uri=getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);if(uri==null)throw new IOException("无法创建下载文件。");try(OutputStream output=getContentResolver().openOutputStream(uri)){output.write(data.getBytes(StandardCharsets.UTF_8));}}else{File directory=new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),"日历账本");directory.mkdirs();File file=new File(directory,name);try(OutputStream output=new FileOutputStream(file)){output.write(data.getBytes(StandardCharsets.UTF_8));}uri=Uri.fromFile(file);}return new JSONObject().put("ok",true).put("filename",name).put("location","下载/日历账本").put("uri",uri.toString());}
    private void theme(String name){ui.post(()->{boolean dark="dark".equals(name);int background=dark?Color.rgb(48,54,50):Color.rgb(252,251,248);getWindow().setStatusBarColor(background);getWindow().setNavigationBarColor(background);web.setBackgroundColor(background);if(web.getParent() instanceof View)((View)web.getParent()).setBackgroundColor(background);if(Build.VERSION.SDK_INT>=30){WindowInsetsController controller=getWindow().getInsetsController();if(controller!=null)controller.setSystemBarsAppearance(dark?0:WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);}else getWindow().getDecorView().setSystemUiVisibility(dark?0:View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);});}
    public final class Bridge{
        @JavascriptInterface public void widgetReady(){ui.post(()->{widgetPageReady=true;deliverWidgetNavigation();});}
        @JavascriptInterface public void addCalendarWidget(){ui.post(()->{
            android.appwidget.AppWidgetManager manager=android.appwidget.AppWidgetManager.getInstance(MainActivity.this);
            boolean requested=false;
            try{if(manager.isRequestPinAppWidgetSupported())requested=manager.requestPinAppWidget(new ComponentName(MainActivity.this,CalendarWidgetProvider.class),null,null);}catch(Exception ignored){}
            android.widget.Toast.makeText(MainActivity.this,requested?"请在桌面弹出的系统窗口中添加月历。":"请长按桌面空白处 → 小组件 → 日历账本 AI → 月历与 AI。",android.widget.Toast.LENGTH_LONG).show();
        });}
        @JavascriptInterface public void startVoice(String session){ui.post(()->{if(!isFinishing())voice.start(session);});}
        @JavascriptInterface public void stopVoice(String session){ui.post(()->{if(!isFinishing())voice.stop(session);});}
        @JavascriptInterface public void cancelVoice(String session){ui.post(()->{if(!isFinishing())voice.cancel(session);});}
        @JavascriptInterface public void openMicrophoneSettings(){ui.post(()->{try{startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName())));}catch(Exception ignored){}});}
        @JavascriptInterface public void showKeyboard(){ui.post(()->{web.requestFocus();android.view.inputmethod.InputMethodManager keyboard=(android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE);if(keyboard!=null)keyboard.showSoftInput(web,android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT);});}
        @JavascriptInterface public String loadSnapshot(){return SnapshotStore.read(MainActivity.this);}
        @JavascriptInterface public boolean saveSnapshot(String json){JSONObject state=SnapshotStore.save(MainActivity.this,json);if(state==null)return false;try{CalendarWidgetProvider.snapshotChanged(MainActivity.this,state);}catch(Exception error){android.util.Log.e("CalendarWidget","Cannot queue widget refresh",error);}return true;}
        @JavascriptInterface public void cancelRequest(String id){chatTransport.cancel(id);}
        @JavascriptInterface public void request(String id,String route,String json){if(route.equals("/api/chat"))chatTransport.begin(id);pool.execute(()->{int status=200;JSONObject result;try{JSONObject body=new JSONObject(json);if(route.equals("/api/config")){result=body.length()>0?apiConnections.configure(body):publicConfig();}
                    else if(route.equals("/api/weather"))result=weather.status();
                    else if(route.equals("/api/weather-search"))result=weather.search(body.optString("name"));
                    else if(route.equals("/api/weather-city"))result=weather.configure(body.optJSONObject("city"));
                    else if(route.equals("/api/models")){JSONObject connection=apiConnections.queryConnection(body);JSONObject list=httpJSON(ApiEndpoints.endpoint(connection.getString("baseURL"),"models"),null,connection.getString("apiKey"),20000);JSONArray rows=list.optJSONArray("data"),ids=new JSONArray();if(rows!=null)for(int i=0;i<Math.min(rows.length(),80);i++){String model=rows.getJSONObject(i).optString("id");if(!model.isEmpty()&&model.length()<=128)ids.put(model);}result=new JSONObject().put("items",ids);}
                    else if(route.equals("/api/web-search"))result=PublicWebReader.search(body.optString("query"));
                    else if(route.equals("/api/web-read"))result=PublicWebReader.read(body.optString("url"));
                    else if(route.equals("/api/chat"))result=streamCompletion(id,body);
                    else if(route.equals("/api/test")){JSONObject completed=completion(new JSONObject().put("messages",new JSONArray().put(new JSONObject().put("role","user").put("content","请只回复 OK，用于测试 API 连接。"))));result=new JSONObject().put("ok",true).put("model",completed.getString("model"));}
                    else if(route.startsWith("/api/holidays?year="))result=holidays(Integer.parseInt(route.substring(route.indexOf('=')+1)));
                    else if(route.equals("/api/download"))result=saveDownload(body);
                    else if(route.equals("/api/device-sync")){theme(body.optString("theme","light"));JSONArray events=body.optJSONArray("events");if(events!=null){getSharedPreferences("reminders",MODE_PRIVATE).edit().putString("events",events.toString()).putBoolean("demo",body.optString("dataMode").equals("demo")).apply();}result=ReminderScheduler.sync(MainActivity.this,events,body.optString("dataMode").equals("demo"));}
                    else if(route.equals("/api/enable-reminders")){ui.post(()->{if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},42);else if(Build.VERSION.SDK_INT>=31&&!((AlarmManager)getSystemService(ALARM_SERVICE)).canScheduleExactAlarms())startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName())));});result=new JSONObject().put("ok",true).put("opened",true);}
                    else throw new IOException("手机端没有这个操作接口。");
                }catch(Exception ex){status=400;result=new JSONObject();try{result.put("error",ex.getMessage()==null?"操作失败，请重试。":ex.getMessage());}catch(JSONException ignored){}}
                chatTransport.end(id);JSONObject reply=new JSONObject();try{reply.put("status",status).put("data",result);}catch(JSONException ignored){}String callback="window.__calendarNativeReply("+JSONObject.quote(id)+","+reply.toString()+")";ui.post(()->{if(!isFinishing())web.evaluateJavascript(callback,null);});});}
    }
}
