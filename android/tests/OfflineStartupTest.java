package org.calendarledger.preview.test;

import android.Manifest;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.ContentValues;
import android.net.Uri;
import android.provider.MediaStore;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.SystemClock;
import android.graphics.Bitmap;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.io.File;
import java.io.FileOutputStream;

/** Exercises the signed delivery APK with an actual Android WebView. */
public class OfflineStartupTest extends Instrumentation {
    private Bundle arguments;
    private Activity activity;
    private WebView web;
    private final JSONArray findings=new JSONArray();

    @Override public void onCreate(Bundle arguments){super.onCreate(arguments);this.arguments=arguments;start();}
    @Override public void onStart(){
        JSONObject report=new JSONObject();int resultCode=0;
        try{
            Intent intent=new Intent().setClassName("org.calendarledger.preview","org.calendarledger.preview.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity=startActivitySync(intent);
            runOnMainSync(()->web=findWebView(activity.getWindow().getDecorView()));
            if(web==null){
                android.content.pm.ApplicationInfo info=activity.getApplicationInfo();
                report.put("targetAssets",new JSONArray(getTargetContext().getAssets().list("web"))).put("activityAssets",new JSONArray(activity.getAssets().list("web")));
                report.put("sourceDir",info.sourceDir).put("publicSourceDir",info.publicSourceDir).put("icon",info.icon).put("theme",info.theme).put("label",info.nonLocalizedLabel).put("flags",info.flags).put("appStyleId",activity.getResources().getIdentifier("AppTheme","style","org.calendarledger.preview"));
                throw new AssertionError("Activity has no WebView");
            }
            String phase=arguments==null?"offline":arguments.getString("phase","offline");
            report.put("phase",phase).put("androidApi",android.os.Build.VERSION.SDK_INT);
            report.put("webview",WebView.getCurrentWebViewPackage().versionName);
            if("upgrade-baseline".equals(phase)){
                waitFor("!!globalThis.calendarLedgerPreview",15000);
                getTargetContext().getSharedPreferences("qa-upgrade",0).edit().putString("marker","baseline-data").commit();
                sendChat("今天午饭35，地铁6，明天下午2点开会1小时，提前30分钟提醒");
                getTargetContext().getSharedPreferences("qa-chat",0).edit().putString("business",businessSnapshot()).commit();
                report.put("passed",true).put("version",getTargetContext().getPackageManager().getPackageInfo("org.calendarledger.preview",0).versionName);
            }else if("calendar-baseline".equals(phase)){
                waitFor("!!globalThis.calendarLedgerPreview",15000);
                evaluate("document.querySelector('[data-action=close-ai]').click();document.querySelector('.mobile-nav [data-page=calendar]').click()");
                calendarMonth("2026-10");
                evaluate("document.querySelector('.calendar-day[data-date=\"2026-10-05\"]').click();document.querySelector('.main').scrollTop=0");
                SystemClock.sleep(200);
                String size=evaluate("String(document.querySelector('.calendar-grid').offsetHeight)");
                getTargetContext().getSharedPreferences("qa-calendar",0).edit().putInt("monthHeight",Integer.parseInt(size)).commit();
                report.put("passed",true).put("monthHeight",Integer.parseInt(size)).put("version",getTargetContext().getPackageManager().getPackageInfo("org.calendarledger.preview",0).versionName);
            }else if("calendar-layout".equals(phase)){
                waitFor("!!globalThis.calendarLedgerPreview",15000);
                calendarLayoutAcceptance(report);report.put("passed",true).put("findings",findings);
            }else if("multimodal".equals(phase)){
                waitFor("!!globalThis.calendarLedgerPreview",15000);
                multimodalAcceptance(report);report.put("passed",true).put("findings",findings);
            }else if("festivals".equals(phase)){
                waitFor("!!globalThis.calendarLedgerPreview",15000);
                festivalAcceptance(report);report.put("passed",true).put("findings",findings);
            }else if("chat-baseline".equals(phase)){
                waitFor("!!globalThis.calendarLedgerPreview",15000);
                chatBaseline(report);
            }else if("chat".equals(phase)){
                waitFor("!!globalThis.calendarLedgerPreview",15000);
                chatAcceptance(report);
                report.put("passed",true).put("findings",findings);
            }else if("baseline".equals(phase)){
                getTargetContext().getSharedPreferences("qa-upgrade",0).edit().putString("marker","baseline-data").commit();
                SystemClock.sleep(6000);
                report.put("page",new JSONObject(evaluate("JSON.stringify({url:location.href,title:document.title,ready:!!globalThis.calendarLedgerPreview,text:document.body?.innerText.slice(0,800)})")));
            }else{
                waitFor("!!globalThis.calendarLedgerPreview",15000);
                check("offline Android startup",truth("document.title==='日历账本 AI' && !document.body.innerText.includes('ERR_HTTP_RESPONSE_CODE_FAILURE')"));
                check("INTERNET permission granted",getTargetContext().checkSelfPermission(Manifest.permission.INTERNET)==PackageManager.PERMISSION_GRANTED);
                check("existing app data survives upgrade","baseline-data".equals(getTargetContext().getSharedPreferences("qa-upgrade",0).getString("marker","")));
                check("inline scripts styles and icon",truth("[...document.scripts].every(x=>!x.src) && !document.querySelector('link[rel=stylesheet]') && document.querySelector('link[rel=icon]').href.startsWith('data:')"));
                waitFor("!!calendarLedgerPreview.getState().holidayDays['2026-10-10']",6000);
                check("offline 2026 holidays and adjusted workday",truth("calendarLedgerPreview.getState().holidayDays['2026-10-01'].isOffDay===true && calendarLedgerPreview.getState().holidayDays['2026-10-10'].isOffDay===false"));
                evaluate("(() => {const previous=globalThis.__calendarNativeReply;globalThis.__calendarNativeReply=(id,value)=>{if(id==='qa-config'){globalThis.__qaConfig=value;globalThis.__calendarNativeReply=previous;}else previous(id,value);};CalendarAndroid.request('qa-config','/api/config','{}');})()");
                waitFor("!!globalThis.__qaConfig",6000);
                check("native bridge responds offline",truth("__qaConfig.status===200 && typeof __qaConfig.data.configured==='boolean'"));
                SystemClock.sleep(500);
                JSONObject layout=new JSONObject(evaluate("JSON.stringify({width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,calendarBottom:document.querySelector('.calendar-foot').getBoundingClientRect().bottom,navTop:document.querySelector('.mobile-nav').getBoundingClientRect().top})"));
                check("month fits actual Android viewport",layout.getDouble("documentWidth")<=layout.getDouble("width")+1 && layout.getDouble("calendarBottom")<layout.getDouble("navTop"));
                report.put("layout",layout);
                evaluate("document.querySelector('[data-action=next-month]').click()");SystemClock.sleep(300);
                report.put("sixWeekLayout",new JSONObject(evaluate("JSON.stringify({rows:document.querySelector('.calendar-grid').style.getPropertyValue('--calendar-rows'),gridHeight:document.querySelector('.calendar-grid').style.height,calendarBottom:document.querySelector('.calendar-foot').getBoundingClientRect().bottom,navTop:document.querySelector('.mobile-nav').getBoundingClientRect().top})")));
                check("six-week month fits actual Android viewport",truth("document.querySelector('.calendar-grid').style.getPropertyValue('--calendar-rows')==='6' && document.querySelector('.calendar-foot').getBoundingClientRect().bottom<document.querySelector('.mobile-nav').getBoundingClientRect().top"));
                evaluate("document.querySelector('[data-action=prev-month]').click()");SystemClock.sleep(200);
                if("persistence".equals(phase)){
                    check("transactions survive process restart",truth("calendarLedgerPreview.getState().transactions.some(t=>t.note==='离线启动测试聚餐' && t.amount===3800)"));
                    JSONObject expected=new JSONObject(getTargetContext().getSharedPreferences("qa-upgrade",0).getString("expectedEvent","{}"));
                    check("schedule survives process restart",truth("calendarLedgerPreview.getState().events.some(e=>e.id==="+JSONObject.quote(expected.getString("id"))+" && e.date==="+JSONObject.quote(expected.getString("date"))+" && e.time==='15:00')"));
                }else{
                    evaluate("globalThis.__qaBefore={transactions:calendarLedgerPreview.getState().transactions.length,events:calendarLedgerPreview.getState().events.length}");
                    sendChat("今天午饭35，地铁6，明天下午2点开会1小时，提前30分钟提醒");
                    check("offline UI creates expenses and schedule",truth("calendarLedgerPreview.getState().transactions.length===__qaBefore.transactions+2 && calendarLedgerPreview.getState().events.length===__qaBefore.events+1"));
                    sendChat("午饭改成38，备注离线启动测试聚餐，会议推迟1小时");
                    check("offline UI edits expense",truth("calendarLedgerPreview.getState().transactions.some(t=>t.note==='离线启动测试聚餐' && t.amount===3800)"));
                    check("offline UI moves meeting",truth("calendarLedgerPreview.getState().events.at(-1).time==='15:00'"));
                    String expectedEvent=evaluate("JSON.stringify(calendarLedgerPreview.getState().events.at(-1))");
                    getTargetContext().getSharedPreferences("qa-upgrade",0).edit().putString("expectedEvent",expectedEvent).commit();
                    sendChat("分析本月餐饮支出，与上月同期对比");
                    check("offline UI analyzes recorded expenses",truth("calendarLedgerPreview.getState().chat.at(-1).results.some(r=>r.result.ok && ['analysis','comparison'].includes(r.result.type))"));
                    evaluate("document.querySelector('[data-action=close-ai]').click()");
                }
                report.put("passed",true).put("findings",findings);
            }
        }catch(Throwable error){
            resultCode=1;
            try{report.put("passed",false).put("error",error.toString()).put("findings",findings);if(web!=null){report.put("page",evaluate("document.body?.innerText.slice(-1800)"));report.put("voiceDebug",evaluate("JSON.stringify({draft:document.querySelector(\'#chat-input\')?.value,toast:document.querySelector(\'#toast\')?.textContent,status:document.querySelector(\'#voice-status\')?.textContent,config:globalThis.calendarLedgerPreview?.getConfig()})"));}}catch(Exception ignored){}
        }
        Bundle result=new Bundle();result.putString("result",report.toString());finish(resultCode,result);
    }
    private void calendarMonth(String target)throws Exception{
        for(int i=0;i<30;i++){
            String current=evaluate("calendarLedgerPreview.getState().viewMonth");
            if(target.equals(current)){SystemClock.sleep(200);return;}
            evaluate("document.querySelector('[data-action="+(current.compareTo(target)<0?"next-month":"prev-month")+"]').click()");
        }
        throw new AssertionError("Month not reached: "+target);
    }
    private boolean festivalLabel(String date,String text)throws Exception{
        return truth("document.querySelector('.calendar-day[data-date=\""+date+"\"] .festival-name')?.textContent==="+JSONObject.quote(text));
    }
    private void calendarLayoutAcceptance(JSONObject report)throws Exception{
        check("delivery version 0.2.3","0.2.3".equals(getTargetContext().getPackageManager().getPackageInfo("org.calendarledger.preview",0).versionName));
        check("existing transactions schedules and tasks survive signed upgrade",businessSnapshot().equals(getTargetContext().getSharedPreferences("qa-chat",0).getString("business","")));
        check("embedded application opens offline",truth("document.title==='日历账本 AI' && !document.body.innerText.includes('ERR_HTTP_RESPONSE_CODE_FAILURE')"));
        evaluate("document.querySelector('[data-action=close-ai]').click();document.querySelector('.mobile-nav [data-page=calendar]').click()");
        calendarMonth("2026-10");
        evaluate("document.querySelector('.calendar-day[data-date=\"2026-10-05\"]').click();document.querySelector('.main').scrollTop=0");
        SystemClock.sleep(250);
        int baseline=getTargetContext().getSharedPreferences("qa-calendar",0).getInt("monthHeight",0);
        int enlarged=Integer.parseInt(evaluate("String(document.querySelector('.calendar-grid').offsetHeight)"));
        check("month calendar is substantially taller than installed v0.2.2",baseline>0&&enlarged>=baseline+40);
        check("daily details start below first screen",truth("document.querySelector('.day-detail').getBoundingClientRect().top>=document.querySelector('.main').getBoundingClientRect().bottom"));
        check("month footer fits above navigation and scroll hint is visible",truth("document.querySelector('.calendar-foot').getBoundingClientRect().bottom<=document.querySelector('.main').getBoundingClientRect().bottom && document.querySelector('.agenda-scroll-hint').getBoundingClientRect().width>0"));
        check("header add accessible and floating add cannot cover dates",truth("getComputedStyle(document.querySelector('.floating-add')).display==='none' && document.querySelector('.header-actions [data-action=new]').getBoundingClientRect().width>=40"));
        check("holiday names remain visible in larger month",festivalLabel("2026-10-01","国庆节")&&festivalLabel("2026-10-10","国庆补班"));
        SystemClock.sleep(700);saveScreenshot("qa-calendar-v0.2.3.png");
        swipeCalendarUp();waitFor("document.querySelector('.main').scrollTop>100",5000);SystemClock.sleep(650);
        check("real Android touch scroll reveals selected daily details",truth("(() => {const main=document.querySelector('.main').getBoundingClientRect(),detail=document.querySelector('.day-detail-header').getBoundingClientRect();return detail.top>=main.top && detail.bottom<main.bottom && document.querySelector('.day-detail-header').innerText.includes('10月5日') && !!document.querySelector('.day-detail .record-row');})()"));
        check("scrolling keeps month height stable",enlarged==Integer.parseInt(evaluate("String(document.querySelector('.calendar-grid').offsetHeight)")));
        saveScreenshot("qa-daily-details-v0.2.3.png");
        int scroll=Integer.parseInt(evaluate("String(Math.round(document.querySelector('.main').scrollTop))"));
        evaluate("document.querySelector('[data-action=content-filter][data-filter=transactions]').click()");SystemClock.sleep(180);
        check("same-month refresh preserves daily reading position",Math.abs(Integer.parseInt(evaluate("String(Math.round(document.querySelector('.main').scrollTop))"))-scroll)<=2);
        evaluate("document.querySelector('[data-action=content-filter][data-filter=all]').click()");
        calendarMonth("2026-08");evaluate("document.querySelector('.main').scrollTop=0");SystemClock.sleep(200);
        check("six-row month fits with daily details below first screen",truth("Number(document.querySelector('.calendar-grid').style.getPropertyValue('--calendar-rows'))===6 && document.querySelector('.calendar-foot').getBoundingClientRect().bottom<=document.querySelector('.main').getBoundingClientRect().bottom && document.querySelector('.day-detail').getBoundingClientRect().top>=document.querySelector('.main').getBoundingClientRect().bottom && document.documentElement.scrollWidth<=innerWidth"));
        evaluate("document.querySelector('#view-select').value='week';document.querySelector('#view-select').dispatchEvent(new Event('change',{bubbles:true}))");
        check("week view remains reachable without month scroll hint",truth("!!document.querySelector('.week-view')&&!document.querySelector('.agenda-scroll-hint')"));
        evaluate("document.querySelector('#view-select').value='day';document.querySelector('#view-select').dispatchEvent(new Event('change',{bubbles:true}))");
        check("day view remains reachable",truth("!!document.querySelector('.day-view')"));
        evaluate("document.querySelector('#view-select').value='month';document.querySelector('#view-select').dispatchEvent(new Event('change',{bubbles:true}))");
        calendarMonth("2026-10");evaluate("document.querySelector('.calendar-day[data-date=\"2026-10-05\"]').click();document.querySelector('.main').scrollTop=0");
        check("layout and scrolling never modify business records",businessSnapshot().equals(getTargetContext().getSharedPreferences("qa-chat",0).getString("business","")));
        report.put("baselineMonthHeight",baseline).put("monthHeight",enlarged).put("viewport",new JSONObject(evaluate("JSON.stringify({width:innerWidth,height:innerHeight})")));
    }
    private void swipeCalendarUp(){
        int[] origin=new int[2];runOnMainSync(()->web.getLocationOnScreen(origin));
        float x=origin[0]+web.getWidth()*.5f,startY=origin[1]+web.getHeight()*.68f,endY=origin[1]+web.getHeight()*.46f;
        long down=SystemClock.uptimeMillis();
        MotionEvent first=MotionEvent.obtain(down,down,MotionEvent.ACTION_DOWN,x,startY,0);first.setSource(InputDevice.SOURCE_TOUCHSCREEN);sendPointerSync(first);first.recycle();
        for(int step=1;step<=16;step++){SystemClock.sleep(25);MotionEvent move=MotionEvent.obtain(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_MOVE,x,startY+(endY-startY)*step/16f,0);move.setSource(InputDevice.SOURCE_TOUCHSCREEN);sendPointerSync(move);move.recycle();}
        MotionEvent last=MotionEvent.obtain(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,x,endY,0);last.setSource(InputDevice.SOURCE_TOUCHSCREEN);sendPointerSync(last);last.recycle();
    }
    private void festivalAcceptance(JSONObject report)throws Exception{
        check("final APK version 0.2.1", "0.2.1".equals(getTargetContext().getPackageManager().getPackageInfo("org.calendarledger.preview",0).versionName));
        check("v0.2.0 business records survive signed upgrade",businessSnapshot().equals(getTargetContext().getSharedPreferences("qa-chat",0).getString("business","")));
        check("offline embedded application opens",truth("!document.body.innerText.includes('ERR_HTTP_RESPONSE_CODE_FAILURE') && document.title==='日历账本 AI'"));
        evaluate("document.querySelector('[data-action=close-ai]').click();document.querySelector('.mobile-nav [data-page=calendar]').click()");
        calendarMonth("2026-10");waitFor("!!calendarLedgerPreview.getState().holidayDays['2026-10-01']",6000);
        check("offline month directly displays National Day name",festivalLabel("2026-10-01","国庆节"));
        check("vacation dates display a readable holiday name",festivalLabel("2026-10-05","国庆假期"));
        check("adjusted workday has name and work badge",festivalLabel("2026-10-10","国庆补班")&&truth("document.querySelector('.calendar-day[data-date=\"2026-10-10\"] .holiday-badge').textContent==='班'"));
        evaluate("document.querySelector('.calendar-day[data-date=\"2026-10-05\"]').click();document.querySelector('.main').scrollTop=0");
        saveScreenshot("qa-festivals-v0.2.1.png");
        calendarMonth("2026-02");
        check("Chinese New Year and its eve display offline",festivalLabel("2026-02-17","春节")&&festivalLabel("2026-02-16","除夕"));
        calendarMonth("2026-03");
        check("Lantern Festival displays without false leave badge",festivalLabel("2026-03-03","元宵节")&&truth("!document.querySelector('.calendar-day[data-date=\"2026-03-03\"] .holiday-badge')"));
        calendarMonth("2026-09");check("Mid-Autumn Festival on its actual lunar date",festivalLabel("2026-09-25","中秋节"));
        calendarMonth("2027-02");
        check("2027 lunar date independent of WebView ICU",festivalLabel("2027-02-06","春节")&&festivalLabel("2027-02-05","除夕"));
        check("unannounced 2027 leave schedule is not fabricated",truth("!document.querySelector('.calendar-day[data-date=\"2027-02-06\"] .holiday-badge')"));
        calendarMonth("2026-08");
        check("six-week month and labels fit native mobile viewport",truth("Number(document.querySelector('.calendar-grid').style.getPropertyValue('--calendar-rows'))===6 && document.querySelector('.calendar-foot').getBoundingClientRect().bottom<document.querySelector('.mobile-nav').getBoundingClientRect().top && document.documentElement.scrollWidth<=innerWidth+1"));
        calendarMonth("2026-10");evaluate("document.querySelector('.calendar-day[data-date=\"2026-10-05\"]').click()");
        check("festival labels do not alter transactions or schedules",businessSnapshot().equals(getTargetContext().getSharedPreferences("qa-chat",0).getString("business","")));
        report.put("viewport",new JSONObject(evaluate("JSON.stringify({width:innerWidth,height:innerHeight})")));
    }
    private WebView findWebView(View view){if(view instanceof WebView)return (WebView)view;if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++){WebView found=findWebView(group.getChildAt(i));if(found!=null)return found;}}return null;}
    private String evaluate(String expression)throws Exception{
        CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();
        runOnMainSync(()->web.evaluateJavascript(expression,result->{value.set(result);latch.countDown();}));
        if(!latch.await(8,TimeUnit.SECONDS))throw new AssertionError("WebView evaluateJavascript timed out");
        Object decoded=new org.json.JSONTokener(value.get()).nextValue();return String.valueOf(decoded);
    }
    private boolean truth(String expression)throws Exception{return "true".equals(evaluate(expression));}
    private void waitFor(String expression,long timeout)throws Exception{long end=SystemClock.elapsedRealtime()+timeout;while(SystemClock.elapsedRealtime()<end){if(truth(expression))return;SystemClock.sleep(120);}throw new AssertionError("Condition not reached: "+expression);}
    private void sendChat(String text)throws Exception{
        evaluate("(() => {const input=document.querySelector('#chat-input');input.value="+JSONObject.quote(text)+";input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#chat-form').requestSubmit();})()");
        waitFor("!document.querySelector('#chat-form button[type=submit]').disabled",15000);
    }
    private String businessSnapshot()throws Exception{
        // Restoring records normalizes object property order. Compare values,
        // including every ID, rather than incidental JSON key ordering.
        return evaluate("(() => {const s=calendarLedgerPreview.getState();function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}return JSON.stringify(canonical({transactions:s.transactions,events:s.events,tasks:s.tasks}));})()");
    }
    private void openChat()throws Exception{
        evaluate("document.querySelector('.mobile-nav [data-action=open-ai]').click()");
        SystemClock.sleep(700);
    }
    private void chatBaseline(JSONObject report)throws Exception{
        getTargetContext().getSharedPreferences("qa-upgrade",0).edit().putString("marker","baseline-data").commit();
        getTargetContext().getSharedPreferences("qa-chat",0).edit().putString("business",businessSnapshot()).commit();
        openChat();
        sendChat("分析本月收支");SystemClock.sleep(300);
        evaluate("globalThis.__oldChat={panel:document.querySelector('.ai-panel'),scroll:document.querySelector('#chat-scroll'),input:document.querySelector('#chat-input'),message:document.querySelector('#chat-scroll .chat-message')};");
        evaluate("(() => {const input=document.querySelector('#chat-input');input.value='分析本月收支';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#chat-form').requestSubmit();})()");
        report.put("whileWaiting",new JSONObject(evaluate("JSON.stringify({panelSame:document.querySelector('.ai-panel')===__oldChat.panel,scrollSame:document.querySelector('#chat-scroll')===__oldChat.scroll,inputSame:document.querySelector('#chat-input')===__oldChat.input,inputDisabled:document.querySelector('#chat-input').disabled,historyConnected:__oldChat.message.isConnected})")));
        waitFor("!document.querySelector('#chat-form button[type=submit]').disabled",15000);
        SystemClock.sleep(600);
        report.put("afterReply",new JSONObject(evaluate("JSON.stringify({panelSame:document.querySelector('.ai-panel')===__oldChat.panel,scrollSame:document.querySelector('#chat-scroll')===__oldChat.scroll,inputSame:document.querySelector('#chat-input')===__oldChat.input,historyConnected:__oldChat.message.isConnected})")));
        report.put("reproduced",truth("!__oldChat.panel.isConnected && !__oldChat.input.isConnected && !__oldChat.message.isConnected"));
        evaluate("document.querySelector('[data-action=close-ai]').click()");
    }
    private void chatAcceptance(JSONObject report)throws Exception{
        check("upgrade preserves existing transactions schedules and tasks",businessSnapshot().equals(getTargetContext().getSharedPreferences("qa-chat",0).getString("business","")));
        check("native chat test uses demo without a real API key",truth("calendarLedgerPreview.getConfig().mode==='demo'"));
        // Connect screenshot automation before opening IME; establishing the
        // accessibility connection later can dismiss an already-open keyboard.
        getUiAutomation();SystemClock.sleep(400);
        double fullHeight=Double.parseDouble(evaluate("innerHeight"));
        openChat();
        // Build enough actual conversational history to exercise overflow.
        for(int i=0;i<4;i++)sendChat("分析本月收支");
        SystemClock.sleep(500);
        tapElement("#chat-input");
        waitForIme(true,6000);SystemClock.sleep(600);
        report.put("keyboardViewport",new JSONObject(evaluate("JSON.stringify({width:innerWidth,height:innerHeight,composerBottom:document.querySelector('.chat-bottom').getBoundingClientRect().bottom})")));
        check("real Android soft keyboard opens and reduces viewport",imeVisible()&&Double.parseDouble(evaluate("innerHeight"))<fullHeight-100);
        evaluate("globalThis.__chatRefs={panel:document.querySelector('.ai-panel'),scroll:document.querySelector('#chat-scroll'),input:document.querySelector('#chat-input'),first:document.querySelector('#chat-messages .chat-message')};globalThis.__removed=0;new MutationObserver(records=>{for(const record of records)for(const node of record.removedNodes)if(node===__chatRefs.first||node.contains?.(__chatRefs.first))__removed++;}).observe(__chatRefs.scroll,{childList:true,subtree:true});globalThis.__startTop=__chatRefs.scroll.scrollTop;globalThis.__trace=[];function recordChat(now){__trace.push({time:now,top:__chatRefs.scroll.scrollTop,opacity:getComputedStyle(__chatRefs.first).opacity});if(__trace.length<65)requestAnimationFrame(recordChat);}requestAnimationFrame(recordChat);__chatRefs.input.value='今天午饭35，地铁6，明天下午2点开会1小时，提前30分钟提醒';__chatRefs.input.dispatchEvent(new Event('input',{bubbles:true}));");
        // Tap the real send button while the native keyboard is displayed.
        tapElement("#chat-form button[type=submit]");
        check("sending keeps original enabled focused input",truth("document.querySelector('#chat-input')===__chatRefs.input && !__chatRefs.input.disabled && document.activeElement===__chatRefs.input"));
        check("sending does not dismiss the Android keyboard",imeVisible());
        evaluate("__chatRefs.input.value='下一条未发送的草稿';__chatRefs.input.dispatchEvent(new Event('input',{bubbles:true}));");
        waitFor("!document.querySelector('#chat-form button[type=submit]').disabled",15000);
        waitFor("__trace.length===65",6000);
        waitFor("__chatRefs.scroll.scrollHeight-__chatRefs.scroll.clientHeight-__chatRefs.scroll.scrollTop<2",6000);
        check("native tool updates retain chat and historical message nodes",truth("document.querySelector('.ai-panel')===__chatRefs.panel && document.querySelector('#chat-scroll')===__chatRefs.scroll && document.querySelector('#chat-messages .chat-message')===__chatRefs.first && __removed===0"));
        check("completed reply preserves native keyboard focus and next draft",imeVisible()&&truth("document.activeElement===__chatRefs.input && __chatRefs.input.value==='下一条未发送的草稿'"));
        JSONObject trajectory=new JSONObject(evaluate("JSON.stringify({start:__startTop,end:__chatRefs.scroll.scrollTop,samples:__trace,intermediatePositions:new Set(__trace.filter(x=>x.top>__startTop+2&&x.top<__chatRefs.scroll.scrollTop-2).map(x=>Math.round(x.top))).size})"));
        report.put("trajectory",trajectory);
        check("native message scrolling has intermediate frames without reset or fading",truth("__startTop>100 && __trace.every(x=>x.top>=__startTop-1 && Number(x.opacity)>.99) && new Set(__trace.filter(x=>x.top>__startTop+2&&x.top<__chatRefs.scroll.scrollTop-2).map(x=>Math.round(x.top))).size>=3"));
        evaluate("(() => {const input=__chatRefs.input;input.value='分析本月收支';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#chat-form').requestSubmit();setTimeout(()=>{__chatRefs.scroll.dispatchEvent(new WheelEvent('wheel',{deltaY:-700}));__chatRefs.scroll.scrollTop=Math.max(0,__chatRefs.scroll.scrollTop-700);globalThis.__readingTop=__chatRefs.scroll.scrollTop;},80);})()");
        waitFor("typeof __readingTop==='number'",6000);
        waitFor("!document.querySelector('#chat-form button[type=submit]').disabled",15000);
        SystemClock.sleep(500);
        check("Android reply arrival preserves historical reading position",truth("Math.abs(__chatRefs.scroll.scrollTop-__readingTop)<2 && !document.querySelector('[data-action=latest-messages]').hidden"));
        evaluate("document.querySelector('.mobile-nav [data-page=ledger]').click()");SystemClock.sleep(250);
        check("tab changes retain input and history nodes",truth("document.querySelector('#chat-input')===__chatRefs.input && __removed===0"));
        openChat();
        check("returning to chat restores historical reading position",truth("Math.abs(__chatRefs.scroll.scrollTop-__readingTop)<2"));
        evaluate("document.querySelector('[data-action=latest-messages]').click()");
        waitFor("__chatRefs.scroll.scrollHeight-__chatRefs.scroll.clientHeight-__chatRefs.scroll.scrollTop<2",6000);
        check("return to latest messages and keyboard viewport fit",truth("document.querySelector('[data-action=latest-messages]').hidden && document.querySelector('.chat-bottom').getBoundingClientRect().bottom<=innerHeight+1 && document.querySelector('.chat-bottom').getBoundingClientRect().top>0"));
        saveScreenshot("qa-chat-keyboard-v0.2.0.png");
        runOnMainSync(()->((android.view.inputmethod.InputMethodManager)activity.getSystemService(Activity.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(web.getWindowToken(),0));
        waitForIme(false,6000);SystemClock.sleep(500);
        check("closing the keyboard preserves composer and latest message",truth("document.querySelector('#chat-input')===__chatRefs.input && __chatRefs.scroll.scrollHeight-__chatRefs.scroll.clientHeight-__chatRefs.scroll.scrollTop<2"));
        evaluate("document.querySelector('[data-action=close-ai]').click();document.querySelector('.mobile-nav [data-page=calendar]').click()");
    }
    private void multimodalAcceptance(JSONObject report)throws Exception{
        openChat();getUiAutomation();
        check("signed upgrade is version 0.2.0","0.2.0".equals(getTargetContext().getPackageManager().getPackageInfo("org.calendarledger.preview",0).versionName));
        check("image picker does not request broad photo access",getTargetContext().checkSelfPermission("android.permission.READ_MEDIA_IMAGES")!=PackageManager.PERMISSION_GRANTED);
        Bitmap bitmap=Bitmap.createBitmap(1200,1800,Bitmap.Config.ARGB_8888);bitmap.eraseColor(android.graphics.Color.WHITE);
        android.graphics.Canvas canvas=new android.graphics.Canvas(bitmap);android.graphics.Paint paint=new android.graphics.Paint();paint.setColor(android.graphics.Color.rgb(32,53,45));paint.setTextSize(60);canvas.drawText("QA RECEIPT 38.25",80,180,paint);canvas.drawText("2026-10-05  WECHAT",80,330,paint);
        ContentValues values=new ContentValues();values.put(MediaStore.Images.Media.DISPLAY_NAME,"CalendarLedger-QA-v020.png");values.put(MediaStore.Images.Media.MIME_TYPE,"image/png");values.put(MediaStore.Images.Media.RELATIVE_PATH,"Pictures/CalendarLedgerQA");
        final Uri uri=getTargetContext().getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values);
        if(uri==null)throw new AssertionError("Could not create fixture image");
        try(java.io.OutputStream stream=getTargetContext().getContentResolver().openOutputStream(uri)){bitmap.compress(Bitmap.CompressFormat.PNG,100,stream);}finally{bitmap.recycle();}
        final AtomicReference<Intent> chooser=new AtomicReference<>();
        Instrumentation.ActivityMonitor monitor=new Instrumentation.ActivityMonitor(){
            @Override public Instrumentation.ActivityResult onStartActivity(Intent intent){if(Intent.ACTION_OPEN_DOCUMENT.equals(intent.getAction())){chooser.set(intent);return new Instrumentation.ActivityResult(Activity.RESULT_OK,new Intent().setData(uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));}return null;}
        };
        addMonitor(monitor);
        evaluate("globalThis.__photoBefore=calendarLedgerPreview.getState();globalThis.__photoInput=document.querySelector('#chat-input');");
        try{tapElement(".composer [data-action=attach-image]");waitFor("document.querySelectorAll('.attachment-thumb img').length===1 && !document.querySelector('#chat-form button[type=submit]').disabled",10000);}
        finally{removeMonitor(monitor);getTargetContext().getContentResolver().delete(uri,null,null);}
        check("actual native image chooser requests only images with multiple selection",chooser.get()!=null&&"image/*".equals(chooser.get().getType())&&chooser.get().getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE,false));
        check("Android WebView decodes selected content URI and retains composer",truth("document.querySelector('.attachment-thumb img').naturalWidth>0 && document.querySelector('#chat-input')===__photoInput"));
        evaluate("globalThis.__nativeBridge=CalendarAndroid;globalThis.__imageRequests=[];globalThis.CalendarAndroid={loadSnapshot:()=>__nativeBridge.loadSnapshot(),saveSnapshot:(data)=>__nativeBridge.saveSnapshot(data),startVoice:(id)=>__nativeBridge.startVoice(id),stopVoice:(id)=>__nativeBridge.stopVoice(id),cancelVoice:(id)=>__nativeBridge.cancelVoice(id),request:(id,route,data)=>{if(route!=='/api/chat'){__nativeBridge.request(id,route,data);return;}const request=JSON.parse(data);__imageRequests.push(request);const message=__imageRequests.length===1?{role:'assistant',content:null,tool_calls:[{id:'android-image-draft',type:'function',function:{name:'prepare_records',arguments:JSON.stringify({records:[{type:'transaction',date:'2026-10-05',amount:38.25,note:'Android截图记账验证',category:'餐饮',account:'微信'}]})}}]}:{role:'assistant',content:'请核对金额和日期后保存。'};setTimeout(()=>__calendarNativeReply(id,{status:200,data:{message}}),60);}};");
        evaluate("document.querySelector('[data-action=settings]').click();var f=document.querySelector('form[data-form=settings]');f.elements.aiMode.value='deepseek';f.elements.model.value='deepseek-flash';f.elements.apiKey.value='emulator-only-not-real-key';f.requestSubmit();");
        waitFor("!document.querySelector('.modal') && calendarLedgerPreview.getConfig().configured",8000);
        sendChat("识别这张截图，先生成核对卡片");
        check("native bridge sends real image parts and restricts recognition tools",truth("__imageRequests.length===2 && __imageRequests[0].messages.at(-1).content[1].image_url.url.startsWith('data:image/jpeg;base64,') && !__imageRequests[0].tools.some(t=>t.function.name==='create_transactions')"));
        check("image recognition does not write until save",truth("calendarLedgerPreview.getState().transactions.length===__photoBefore.transactions.length && document.querySelectorAll('.prepared-row').length===1"));
        evaluate("document.querySelector('[data-action=save-prepared]').click()");
        check("actual saved transaction contains exact cents",truth("calendarLedgerPreview.getState().transactions.some(t=>t.note==='Android截图记账验证'&&t.amount===3825) && document.querySelector('.saved-note').textContent==='已保存'"));
        check("full image and key are absent from native snapshot",truth("!CalendarAndroid.loadSnapshot().includes('emulator-only-not-real-key') && !CalendarAndroid.loadSnapshot().includes('data:image/jpeg;base64,'+__imageRequests[0].messages.at(-1).content[1].image_url.url.split(',')[1])"));
        saveScreenshot("qa-image-v0.2.0.png");
        evaluate("globalThis.CalendarAndroid=__nativeBridge;document.querySelector('[data-action=settings]').click();var f=document.querySelector('form[data-form=settings]');f.elements.aiMode.value='demo';f.requestSubmit();");waitFor("!document.querySelector('.modal')",8000);
        evaluate("globalThis.__voiceBusiness=calendarLedgerPreview.getState().transactions.length;document.querySelector('.mic-button').click()");
        waitFor("document.querySelector('#chat-input').value.includes('今天午饭38元')",10000);
        check("actual native speech service callback fills editable Chinese transcript",truth("document.querySelector('#chat-input').value==='今天午饭38元，地铁6元' && document.querySelector('#voice-status').hidden && !document.querySelector('#chat-form button[type=submit]').disabled"));
        check("speech results never write or send automatically",truth("calendarLedgerPreview.getState().transactions.length===__voiceBusiness"));
        saveScreenshot("qa-voice-v0.2.0.png");
        sendChat("今天午饭38元，地铁6元");
        check("sending transcript uses the actual existing business tools",truth("calendarLedgerPreview.getState().transactions.length===__voiceBusiness+2"));
        evaluate("document.querySelector('.mic-button').click();document.querySelector('[data-action=voice-cancel]').click()");SystemClock.sleep(1600);
        check("late recognition results after cancellation do not fill the draft",truth("document.querySelector('#chat-input').value==='' && document.querySelector('#voice-status').hidden"));
        check("new business data stored synchronously",truth("JSON.parse(CalendarAndroid.loadSnapshot()).state.transactions.some(t=>t.note==='Android截图记账验证'&&t.amount===3825)"));
        report.put("speechEngine","test RecognitionService fixture, not a real acoustic engine").put("realDeepSeekKeyUsed",false);
        evaluate("document.querySelector('[data-action=close-ai]').click();document.querySelector('.mobile-nav [data-page=calendar]').click()");
    }
    private boolean imeVisible(){
        AtomicReference<Boolean> visible=new AtomicReference<>(false);
        runOnMainSync(()->{WindowInsets insets=activity.getWindow().getDecorView().getRootWindowInsets();visible.set(insets!=null&&insets.isVisible(WindowInsets.Type.ime()));});
        return visible.get();
    }
    private void waitForIme(boolean expected,long timeout){
        long end=SystemClock.elapsedRealtime()+timeout;
        while(SystemClock.elapsedRealtime()<end){if(imeVisible()==expected)return;SystemClock.sleep(120);}
        throw new AssertionError("Android keyboard visibility did not reach "+expected);
    }
    private void tapElement(String selector)throws Exception{
        JSONObject point=new JSONObject(evaluate("(() => {const r=document.querySelector("+JSONObject.quote(selector)+").getBoundingClientRect();return JSON.stringify({x:(r.left+r.width/2)*devicePixelRatio,y:(r.top+r.height/2)*devicePixelRatio});})()"));
        int[] location=new int[2];runOnMainSync(()->web.getLocationOnScreen(location));
        float x=(float)point.getDouble("x")+location[0],y=(float)point.getDouble("y")+location[1];
        long down=SystemClock.uptimeMillis();
        MotionEvent press=MotionEvent.obtain(down,down,MotionEvent.ACTION_DOWN,x,y,0);press.setSource(InputDevice.SOURCE_TOUCHSCREEN);sendPointerSync(press);press.recycle();
        MotionEvent release=MotionEvent.obtain(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,x,y,0);release.setSource(InputDevice.SOURCE_TOUCHSCREEN);sendPointerSync(release);release.recycle();
    }
    private void saveScreenshot(String name)throws Exception{
        Bitmap bitmap=getUiAutomation().takeScreenshot();
        if(bitmap==null)throw new AssertionError("Android screenshot unavailable");
        try(FileOutputStream stream=new FileOutputStream(new File(activity.getExternalFilesDir(null),name))){bitmap.compress(Bitmap.CompressFormat.PNG,100,stream);}finally{bitmap.recycle();}
    }
    private void check(String name,boolean passed)throws Exception{findings.put(new JSONObject().put("check",name).put("passed",passed));if(!passed)throw new AssertionError(name);}
}
