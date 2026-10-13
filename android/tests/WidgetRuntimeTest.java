package org.calendarledger.preview.test;

import android.app.*;
import android.appwidget.*;
import android.content.*;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.os.*;
import android.util.SizeF;
import android.view.*;
import android.webkit.WebView;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

/** Installs real RemoteViews into Android's AppWidgetHost and taps real PendingIntents.
 * The host overlay is test code only; it is not included in the delivery APK.
 */
public class WidgetRuntimeTest extends Instrumentation {
    private static final String PACKAGE="org.calendarledger.preview";
    private static final ComponentName PROVIDER=new ComponentName(PACKAGE,PACKAGE+".CalendarWidgetProvider");
    private Activity activity;
    private WebView web;
    private AppWidgetHost host;
    private CountingHostView widget;
    private CountingHostView second;
    private FrameLayout overlay;
    private Bundle arguments;
    private final JSONArray findings=new JSONArray();
    private final List<Integer> allocated=new ArrayList<>();
    private boolean keepBindings;
    private final JSONArray fitErrors=new JSONArray();

    @Override public void onCreate(Bundle arguments){super.onCreate(arguments);this.arguments=arguments;start();}
    @Override public void onStart(){
        JSONObject report=new JSONObject();int resultCode=0;
        try {
            String phase=arguments==null?"widget":arguments.getString("phase","widget");
            report.put("phase",phase).put("androidApi",Build.VERSION.SDK_INT)
                    .put("actualSamsungPhone",false).put("host","Android AppWidgetHost in instrumentation overlay")
                    .put("version",getTargetContext().getPackageManager().getPackageInfo(PACKAGE,0).versionName);
            Intent intent=entryIntent();
            if("cold-ai".equals(phase))intent.setAction(PACKAGE+".WIDGET_OPEN").putExtra("widgetTarget","ai");
            if("cold-date".equals(phase))intent.setAction(PACKAGE+".WIDGET_OPEN").putExtra("widgetTarget","date").putExtra("widgetDate","2026-10-10");
            if(phase.startsWith("weather"))FakeWeatherConnection.install();
            if("web-tools".equals(phase))FakeWebConnection.install();
            if("chat-api".equals(phase)||"conversation".equals(phase))FakeGatewayConnection.install();
            startApp(intent);
            if("baseline".equals(phase)) {
                if(getTargetContext().getSharedPreferences("api-config",0).getString("keyCipher","").isEmpty()) {
                    evaluate("document.querySelector('[data-action=settings]').click();document.querySelector('[name=aiMode]').value='demo';document.querySelector('[name=apiKey]').value='qa-only-not-a-real-provider-key';document.querySelector('form[data-form=settings]').requestSubmit()");
                    waitFor("!document.querySelector('.modal')",5000);
                }
                check("baseline has encrypted test-only API configuration",!getTargetContext().getSharedPreferences("api-config",0).getString("keyCipher","").isEmpty());
                preferences().edit().putString("businessBefore",business())
                        .putString("keyCipherBefore",getTargetContext().getSharedPreferences("api-config",0).getString("keyCipher",""))
                        .putString("marker","v033-to-v034").commit();
                check("old release has saved business data",truth("calendarLedgerPreview.getState().transactions.length>0&&calendarLedgerPreview.getState().events.length>0"));
            } else if("cold-ai".equals(phase)) {
                check("cold start consumes AI entry after JavaScript is ready",truth("document.body.classList.contains('ai-visible')"));
                check("AI entry does not start microphone",truth("document.querySelector('#voice-status').hidden"));
            } else if("cold-date".equals(phase)) {
                waitFor("calendarLedgerPreview.getState().selectedDate==='2026-10-10'&&document.querySelector('.main').scrollTop>20",5000);
                check("cold start opens requested daily details",truth("calendarLedgerPreview.getState().page==='calendar'&&!document.body.classList.contains('ai-visible')"));
            } else if("compact".equals(phase)) {
                int id=preferences().getInt("keptId",-1);startHost();widget=restore(id);setMonth(id,"2026-10");attach(widget,250,460);waitText(widget,"widget_month","10月");SystemClock.sleep(500);screenshot("widget-compact",widget);check("compact accounting text stays within cell",fits(widget));keepBindings=true;
            } else if("appearance".equals(phase)) {
                settings("light","normal",1);SystemClock.sleep(2600);
                evaluate("__calendarWidgetNavigate({target:'date',date:'2026-10-10'})");SystemClock.sleep(300);
                // Date entry scrolls to daily details after the next animation frame.
                // Let that navigation finish before capturing the month at the top.
                evaluate("document.querySelector('.main').scrollTop=0");SystemClock.sleep(200);
                check("native phone month fits above navigation; agenda remains below",truth("document.querySelector('.calendar-foot').getBoundingClientRect().bottom<document.querySelector('.mobile-nav').getBoundingClientRect().top&&document.querySelector('#day-detail').getBoundingClientRect().top>document.querySelector('.main').getBoundingClientRect().bottom-50"));
                screenshot("app-calendar",null);
                for(String page:new String[]{"ledger","reports","more"}){
                    evaluate("document.querySelector('[data-action=page][data-page="+page+"]').click();document.querySelector('.main').scrollTop=0");SystemClock.sleep(200);
                    check("native phone "+page+" has no horizontal overflow",truth("document.documentElement.scrollWidth<=innerWidth+1"));screenshot("app-"+page,null);
                }
                evaluate("document.querySelector('[data-action=open-ai]').click()");SystemClock.sleep(300);
                check("native Morandi chat retains image, microphone and send controls",truth("document.querySelector('.composer .mic-button')!==null&&document.querySelector('#chat-form button[type=submit]')!==null&&document.querySelector('.composer').getBoundingClientRect().bottom<=innerHeight&&!!document.querySelector('.composer [data-action=attach-image]')"));
                screenshot("app-chat",null);
                evaluate("document.querySelector('.mobile-nav [data-page=more]').click();document.querySelector('.main [data-action=settings]').click()");SystemClock.sleep(400);
                check("native phone settings modal fits the screen",truth("!document.body.classList.contains('ai-visible')&&document.querySelector('.modal').getBoundingClientRect().width>200&&document.querySelector('.modal').getBoundingClientRect().height>200&&document.querySelector('.modal').getBoundingClientRect().right<=innerWidth+1&&document.querySelector('.modal').getBoundingClientRect().bottom<=innerHeight+1"));
                screenshot("app-settings",null);
            } else if("ai-operations".equals(phase)) {
                aiOperationsAcceptance(report);
            } else if("web-tools".equals(phase)||"live-web".equals(phase)) {
                webAcceptance(report,"live-web".equals(phase));
            } else if("conversation".equals(phase)){conversationAcceptance(report);
            } else if("chat-api".equals(phase)) {
                chatAPIAcceptance(report);
            } else if(phase.startsWith("weather")) {
                weatherAcceptance(report);
            } else if("live-weather".equals(phase)) {
                liveWeatherAcceptance(report);
            } else if("sparse-grid".equals(phase)) {
                sparseGridAcceptance(report);
            } else if("data-projection".equals(phase)) {
                projectionAcceptance(report);
            } else if("reopened".equals(phase)||"system-font".equals(phase)) {
                check("saved fixture survives process restart",truth("calendarLedgerPreview.getState().events.some(e=>e.id==='qa-widget-discussion')"));
                int id=preferences().getInt("keptId",-1);
                check("system retains widget binding across app restart",AppWidgetManager.getInstance(getTargetContext()).getAppWidgetInfo(id)!=null);
                startHost();widget=restore(id);attach(widget,350,540);refresh(id);waitText(widget,"widget_month","11月");
                check("independent widget month survives restart",weekCount(widget)==6);
                check("saved accounting totals survive process restart",moneyMatches(widget,"2026-11-01"));
                if("system-font".equals(phase)){
                    settings("light","large",1);attach(widget,250,460);waitText(widget,"widget_month","11月");
                    SystemClock.sleep(500);check("six-week widget fits at system font scale 1.3",fits(widget));
                    check("compact six-week money stays visible at font scale 1.3",moneyMatches(widget,"2026-11-01")&&moneyMatches(widget,"2026-11-09"));
                    setMonth(id,"2027-05");attach(widget,230,460);waitText(widget,"widget_month","5月");SystemClock.sleep(500);
                    check("minimum-size six-week holiday keeps both accounting lines",weekCount(widget)==6&&moneyMatches(widget,"2027-05-01")&&visible(dayCell(widget,"2027-05-01"),"widget_observance")&&fits(widget));
                    check("minimum-size holiday schedule is not displaced by accounting",visible(dayCell(widget,"2027-05-01"),"widget_event")&&text(dayCell(widget,"2027-05-01"),"widget_event").contains("出门买菜"));
                    report.put("fontScale",getTargetContext().getResources().getConfiguration().fontScale);
                    screenshot("widget-system-font",widget);
                    setMonth(id,"2026-11");
                } else screenshot("widget-reopened",widget);
                keepBindings=true;
            } else {
                acceptance(report);
            }
            report.put("passed",true).put("findings",findings);
        } catch(Throwable error) {
            resultCode=1;
            try {report.put("passed",false).put("error",error.toString()).put("findings",findings);
                if(widget!=null)report.put("widgetText",allText(widget)).put("fitErrors",fitErrors);
                if(web!=null)report.put("page",evaluate("document.body?.innerText.slice(-1200)"));
            }catch(Exception ignored){}
        } finally {
            if(host!=null){
                if(!keepBindings)for(int id:allocated)host.deleteAppWidgetId(id);
                onUi(()->host.stopListening());
            }
            try{getUiAutomation().dropShellPermissionIdentity();}catch(Exception ignored){}
        }
        Bundle result=new Bundle();result.putString("result",report.toString());finish(resultCode,result);
    }
    private void aiOperationsAcceptance(JSONObject report)throws Exception {
        String before=evaluate("JSON.stringify({version:1,state:calendarLedgerPreview.getState(),aiConfig:calendarLedgerPreview.getConfig()})");
        try {
            JSONObject snapshot=new JSONObject(before), state=snapshot.getJSONObject("state");
            for(String key:new String[]{"transactions","events","tasks","undo","chat","lastCreated","expenseAllocations","aiMemory","correctionHistory"})state.put(key,new JSONArray());
            state.put("viewMonth","2026-10").put("selectedDate","2026-10-13");snapshot.getJSONObject("aiConfig").put("mode","demo");
            evaluate("CalendarAndroid.saveSnapshot("+JSONObject.quote(snapshot.toString())+")");restartApp();
            sendChat("2026-10-01 月订阅30元");
            check("native conversation records a single subscription payment",truth("calendarLedgerPreview.getState().transactions.length===1&&calendarLedgerPreview.getState().transactions[0].amount===3000"));
            sendChat("把刚才月订阅的钱均摊到每一天");
            check("native conversation allocates without creating daily payments",truth("calendarLedgerPreview.getState().expenseAllocations.length===1&&calendarLedgerPreview.getState().transactions.length===1"));
            check("monthly period defaults to actual payment month",truth("calendarLedgerPreview.getState().expenseAllocations[0].start==='2026-10-01'&&calendarLedgerPreview.getState().expenseAllocations[0].end==='2026-10-31'"));
            startHost();widget=create();int id=widget.getAppWidgetId();setMonth(id,"2026-10");attach(widget,370,540);waitText(widget,"widget_month","10月");
            check("native widget displays first-day integer-cent share",text(dayCell(widget,"2026-10-01"),"widget_expense").equals("−0.97"));
            check("native widget preserves exact remainder on the final day",text(dayCell(widget,"2026-10-31"),"widget_expense").equals("−0.96"));
            check("native widget identifies daily-cost accounting",text(widget,"widget_year").contains("费用按日")&&description(widget,"2026-10-13").contains("按天分摊"));
            check("native allocation stays within date cells",fits(widget));screenshot("widget-allocation",widget);detach();
            sendChat("记住，我的月订阅默认保留付款，按天分摊");
            check("native chat saves explicit persistent preference",truth("calendarLedgerPreview.getState().aiMemory.length===1"));
            String source=evaluate("calendarLedgerPreview.getState().transactions[0].id");
            restartApp();
            check("cold restart retains preference and previous dialogue",truth("calendarLedgerPreview.getState().aiMemory.length===1&&calendarLedgerPreview.getState().chat.length>=6"));
            check("cold restart retains source reference and allocation",truth("calendarLedgerPreview.getState().lastCreated[0].id==="+JSONObject.quote(source)+"&&calendarLedgerPreview.getState().expenseAllocations.length===1"));
            sendChat("刚才那笔改成62");
            check("follow-up after restart modifies the same real payment",truth("calendarLedgerPreview.getState().transactions.length===1&&calendarLedgerPreview.getState().transactions[0].amount===6200&&calendarLedgerPreview.getState().transactions[0].id==="+JSONObject.quote(source)));
            startHost();widget=restore(id);attach(widget,370,540);refresh(id);waitText(widget,"widget_month","10月");
            check("native shares immediately follow source amount update",text(dayCell(widget,"2026-10-13"),"widget_expense").equals("−2"));detach();
            sendChat("撤销操作");
            check("undo restores source amount while keeping its allocation",truth("calendarLedgerPreview.getState().transactions[0].amount===3000&&calendarLedgerPreview.getState().expenseAllocations.length===1"));
            evaluate("document.querySelector('.mobile-nav [data-page=more]').click();document.querySelector('.main [data-action=ai-memory]').click()");SystemClock.sleep(300);
            check("memory settings exposes saved preferences and controls",truth("document.querySelector('#ai-memory-list').textContent.includes('订阅分摊规则')&&document.querySelector('[data-memory-clear-chat]')!==null"));
            check("memory settings fits native phone width",truth("document.querySelector('.modal').getBoundingClientRect().right<=innerWidth+1&&document.documentElement.scrollWidth<=innerWidth+1"));screenshot("app-ai-memory",null);
            evaluate("document.querySelector('[data-memory-delete]').click()");
            check("forget preference does not remove payment or allocation",truth("calendarLedgerPreview.getState().aiMemory.length===0&&calendarLedgerPreview.getState().transactions.length===1&&calendarLedgerPreview.getState().expenseAllocations.length===1"));
            evaluate("document.querySelector('[data-action=close-modal]').click()");sendChat("撤销操作");
            check("forget preference can be undone",truth("calendarLedgerPreview.getState().aiMemory.length===1"));
            evaluate("document.querySelector('#chat-model-button').click()");
            check("native model sheet and slider fit phone",truth("document.querySelector('[data-ai-controls] input[name=effort]').getBoundingClientRect().height>=44&&document.documentElement.scrollWidth<=innerWidth+1"));
            evaluate("var c=document.querySelector('[data-ai-controls]');c.elements.model.value='deepseek-v4-pro';c.elements.effort.value='3';c.elements.effort.dispatchEvent(new Event('input',{bubbles:true}));c.requestSubmit()");
            waitFor("calendarLedgerPreview.getConfig().model==='deepseek-v4-pro'",10000);
            check("native model and max thinking setting reach saved configuration",truth("calendarLedgerPreview.getConfig().effort==='max'&&JSON.parse(CalendarAndroid.loadSnapshot()).aiConfig.effort==='max'"));
            screenshot("app-model-controls",null);evaluate("document.querySelector('[data-action=close-modal]').click()");
            Class<?> optionsClass=Class.forName("org.calendarledger.preview.AiRequestOptions",true,getTargetContext().getClassLoader());
            java.lang.reflect.Method apply=optionsClass.getDeclaredMethod("apply",JSONObject.class,JSONObject.class,String.class);apply.setAccessible(true);
            for(String effort:new String[]{"none","low","high","max"}){JSONObject payload=new JSONObject();apply.invoke(null,payload,new JSONObject().put("effort",effort),"https://api.deepseek.com");check("native official thinking wire mapping "+effort,payload.getString("reasoning_effort").equals(effort)&&payload.getJSONObject("thinking").getString("type").equals("none".equals(effort)?"disabled":"enabled"));}
            JSONObject summaryPayload=new JSONObject();apply.invoke(null,summaryPayload,new JSONObject().put("effort","max").put("purpose","summary"),"https://api.deepseek.com");
            check("native summary wire is bounded JSON without thinking",summaryPayload.getInt("max_tokens")==1600&&summaryPayload.getString("reasoning_effort").equals("none")&&summaryPayload.getJSONObject("response_format").getString("type").equals("json_object"));
            JSONObject learningSnapshot=new JSONObject(evaluate("CalendarAndroid.loadSnapshot()"));
            learningSnapshot.getJSONObject("state").put("aiMemorySuggestions",new JSONArray().put(new JSONObject().put("id","mem_qa_account").put("key","默认账户").put("value","支付宝").put("evidence","我习惯用支付宝支付")));
            evaluate("CalendarAndroid.saveSnapshot("+JSONObject.quote(learningSnapshot.toString())+")");restartApp();
            evaluate("document.querySelector('.mobile-nav [data-page=more]').click();document.querySelector('.main [data-action=ai-memory]').click()");
            check("native suggestion shows original quote and confirmation",truth("document.querySelector('.memory-suggestion').textContent.includes('我习惯用支付宝支付')&&document.querySelector('[data-memory-accept]').getBoundingClientRect().height>=44"));
            evaluate("document.querySelector('[data-memory-accept]').click()");
            check("native confirmed preference preserves provenance",truth("calendarLedgerPreview.getState().aiMemory.some(m=>m.key==='默认账户'&&m.value==='支付宝'&&m.evidence==='我习惯用支付宝支付')&&calendarLedgerPreview.getState().aiMemorySuggestions.length===0"));
            restartApp();check("native cold restart retains model effort and confirmed preference",truth("calendarLedgerPreview.getConfig().effort==='max'&&calendarLedgerPreview.getState().aiMemory.some(m=>m.key==='默认账户')"));
            evaluate("document.querySelector('.mobile-nav [data-page=more]').click();document.querySelector('.main [data-action=ai-memory]').click();document.querySelector('[data-memory-edit=\"1\"]').click();var f=document.querySelector('[data-memory-form]');f.elements.value.value='银行卡';f.elements.value.dispatchEvent(new Event('input',{bubbles:true}))");
            check("native preference correction previews the previous and new value",truth("document.querySelector('[data-memory-change-preview]').textContent.includes('支付宝 → 银行卡')&&document.querySelector('[name=key]').readOnly"));
            evaluate("document.querySelector('[data-memory-form]').requestSubmit()");
            check("native correction keeps the same preference key",truth("calendarLedgerPreview.getState().aiMemory.length===2&&calendarLedgerPreview.getState().aiMemory[1].value==='银行卡'"));
            evaluate("document.querySelector('[data-memory-corrections]').click()");
            check("native journal shows exact old and new preference values",truth("document.querySelector('.correction-card').textContent.includes('支付宝 → 银行卡')&&document.documentElement.scrollWidth<=innerWidth+1"));screenshot("app-corrections",null);
            restartApp();
            check("native cold storage preserves correction snapshots",truth("calendarLedgerPreview.getState().correctionHistory.at(-1).changes[0].before.value==='支付宝'&&calendarLedgerPreview.getState().aiMemory[1].value==='银行卡'"));
            evaluate("document.querySelector('.mobile-nav [data-page=more]').click();document.querySelector('.main [data-action=corrections]').click();document.querySelector('[data-revert-correction]').click()");
            check("native granular restore keeps the payment and allocation",truth("calendarLedgerPreview.getState().aiMemory[1].value==='支付宝'&&calendarLedgerPreview.getState().transactions[0].amount===3000&&calendarLedgerPreview.getState().expenseAllocations.length===1"));
            evaluate("document.querySelector('[data-action=close-modal]').click()");restartApp();
            check("native correction restoration persists across process restart",truth("calendarLedgerPreview.getState().correctionHistory.some(r=>r.revertedBy)&&calendarLedgerPreview.getState().aiMemory[1].value==='支付宝'"));
            evaluate("document.querySelector('[data-action=open-ai]').click();document.querySelector('#chat-web-button').click()");restartApp();
            check("native networking switch persists independently of actual records",truth("calendarLedgerPreview.getConfig().webEnabled===false&&calendarLedgerPreview.getState().transactions.length===1"));
            screenshot("app-ai-context",null);
            report.put("apiKeyUsed",false).put("actualProvider",false).put("mode","installed delivery APK, native bridge, local operation parser");
        } finally { JSONObject priorConfig=new JSONObject(before).getJSONObject("aiConfig");getTargetContext().getSharedPreferences("api-config",0).edit().putString("model",priorConfig.optString("model","deepseek-flash")).apply();evaluate("CalendarAndroid.saveSnapshot("+JSONObject.quote(before)+")");restartApp(); }
    }
    private void webAcceptance(JSONObject report,boolean live)throws Exception {
        try(InputStream input=getContext().getAssets().open("qa-web-tools.js")){ByteArrayOutputStream script=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int size;while((size=input.read(buffer))!=-1)script.write(buffer,0,size);evaluate("(()=>{"+new String(script.toByteArray(),java.nio.charset.StandardCharsets.UTF_8)+";globalThis.__qaExecuteWeb=executeWebTool;})()");}
        evaluate("globalThis.__qaWebPending={};var prior=globalThis.__calendarNativeReply;globalThis.__calendarNativeReply=(id,response)=>{if(__qaWebPending[id]){__qaWebPending[id](response);delete __qaWebPending[id];}else prior(id,response);};globalThis.__qaWeb=(route,body)=>new Promise(resolve=>{var id='qaweb'+Math.random();__qaWebPending[id]=resolve;CalendarAndroid.request(id,route,JSON.stringify(body));});globalThis.__qaResponse=null;");
        Class<?> reader=Class.forName("org.calendarledger.preview.PublicWebReader",true,getTargetContext().getClassLoader());
        java.lang.reflect.Method publicAddress=reader.getDeclaredMethod("publicAddress",java.net.InetAddress.class);publicAddress.setAccessible(true);
        for(String address:new String[]{"127.0.0.1","10.1.2.3","192.168.1.1","100.64.0.1","::1","fd00::1"})check("native public page guard rejects "+address,Boolean.FALSE.equals(publicAddress.invoke(null,java.net.InetAddress.getByName(address))));
        evaluate("__qaWeb('/api/web-read',{url:'https://127.0.0.1/private'}).then(r=>__qaResponse=r)");waitFor("__qaResponse!==null",10000);
        check("real native web route rejects private addresses",truth("__qaResponse.status!==200&&!!__qaResponse.data.error"));
        String url=live?"https://api-docs.deepseek.com/guides/thinking_mode/":"https://8.8.8.8/calendar";
        evaluate("__qaResponse=null;__qaWeb('/api/web-read',{url:"+JSONObject.quote(url)+"}).then(r=>__qaResponse=r)");waitFor("__qaResponse!==null",65000);
        check("native public page route returns actual HTTP content",truth("__qaResponse.status===200&&__qaResponse.data.content.length>30&&!!__qaResponse.data.retrievedAt"));
        evaluate("globalThis.__qaParsed=null;__qaExecuteWeb('read_webpage',{url:"+JSONObject.quote(url)+"},{request:async()=>__qaResponse.data}).then(r=>__qaParsed=r).catch(e=>__qaParsed={error:e.message})");waitFor("__qaParsed!==null",10000);
        check("native public page is parsed into bounded source text",truth("__qaParsed.ok===true&&__qaParsed.text.length<=10000&&__qaParsed.url==="+JSONObject.quote(url)));
        if(!live){
            check("native public reader never attaches the saved model key",!FakeWebConnection.credentialsAttached);
            evaluate("__qaResponse=null;__qaWeb('/api/web-read',{url:'https://8.8.8.8/redirect-private'}).then(r=>__qaResponse=r)");waitFor("__qaResponse!==null",10000);
            check("native redirects cannot reach a private URL",truth("__qaResponse.status!==200&&!!__qaResponse.data.error"));
        } else {
            evaluate("__qaResponse=null;__qaWeb('/api/web-search',{query:'DeepSeek reasoning_effort'}).then(r=>__qaResponse=r)");waitFor("__qaResponse!==null",65000);
            check("native live search returns actual search-provider content",truth("__qaResponse.status===200&&!!__qaResponse.data.provider"));
            evaluate("__qaParsed=null;__qaExecuteWeb('web_search',{query:'DeepSeek reasoning_effort'},{request:async()=>__qaResponse.data}).then(r=>__qaParsed=r).catch(e=>__qaParsed={error:e.message})");waitFor("__qaParsed!==null",10000);
            check("native live search yields real clickable HTTPS results",truth("__qaParsed.ok===true&&__qaParsed.items.length>0&&__qaParsed.items.every(r=>r.url.startsWith('https://'))"));
            report.put("provider",evaluate("__qaParsed.provider")).put("sources",new JSONArray(evaluate("JSON.stringify(__qaParsed.items.map(r=>({title:r.title,url:r.url})))")));
        }
        report.put("actualPublicNetwork",live).put("apiKeyUsed",false);
    }
    private void conversationAcceptance(JSONObject report)throws Exception{
        String before=evaluate("CalendarAndroid.loadSnapshot()");android.content.SharedPreferences apiPrefs=getTargetContext().getSharedPreferences("api-config",0);Map<String,?> oldPrefs=new HashMap<>(apiPrefs.getAll());
        try{
            JSONObject sample=new JSONObject(before),s=sample.getJSONObject("state");s.put("chat",new JSONArray()).put("chatBranches",new JSONArray()).put("aiSummary",JSONObject.NULL);s.remove("activeChatBranchId");sample.getJSONObject("aiConfig").put("autoSummary",false).put("effort","none");evaluate("CalendarAndroid.saveSnapshot("+JSONObject.quote(sample.toString())+")");restartApp();
            evaluate("document.querySelector('[data-action=open-ai]').click();document.querySelector('[data-action=ai-connection]').click()");
            check("native chat opens API connections directly",truth("!!document.querySelector('form[data-form=ai-connection]')"));
            evaluate("var f=document.querySelector('form[data-form=ai-connection]');f.elements.provider.value='newapi';f.elements.provider.dispatchEvent(new Event('change',{bubbles:true}));f.elements.baseURL.value='https://8.8.8.8/v1';f.elements.apiKey.value='conversation-fixture-key';f.elements.model.value='tenant-model';f.elements.thinkingFormat.value='deepseek';f.requestSubmit()");waitFor("!document.querySelector('.modal')&&calendarLedgerPreview.getConfig().configured",10000);
            String businessBefore=business();FakeGatewayConnection.chatMode="conversation";
            evaluate("globalThis.nativeLongTask=calendarLedgerPreview.sendChat('我想学习编程，帮我详细分析学习路线，先聊方案，不改日历。');globalThis.originalComposer=document.querySelector('#chat-input')");
            waitFor("document.querySelector('#chat-messages').textContent.includes('从一个小项目开始')&&!document.querySelector('.stop-button').hidden",10000);
            check("Android receives incremental text before request completes",truth("document.querySelector('#chat-form button[type=submit]').disabled&&calendarLedgerPreview.getState().chat.at(-1).role==='user'"));
            check("native streaming request uses selected model and long answer budget",FakeGatewayConnection.lastPayload.optBoolean("stream")&&FakeGatewayConnection.lastPayload.getInt("max_tokens")==8192);
            check("native user can inspect model-returned reasoning",truth("!document.querySelector('.reasoning-block').hidden&&document.querySelector('[data-reasoning-body]').textContent.includes('理解目标')"));
            evaluate("document.querySelector('.reasoning-block').open=true");
            waitFor("!document.querySelector('#chat-form button[type=submit]').disabled",15000);
            check("long answer retains prose and Markdown table and code",truth("!!document.querySelector('.markdown-body h2')&&!!document.querySelector('.markdown-body table')&&!!document.querySelector('.markdown-body pre')&&calendarLedgerPreview.getState().chat.at(-1).text.length>400"));
            check("streaming preserves composer identity and expanded reasoning",truth("originalComposer===document.querySelector('#chat-input')&&document.querySelector('.reasoning-block').open"));
            check("discussion leaves actual business data unchanged",businessBefore.equals(business()));
            evaluate("document.querySelector('.reasoning-block').open=false;var sc=document.querySelector('#chat-scroll');sc.dispatchEvent(new WheelEvent('wheel',{deltaY:-1000}));sc.scrollTop=0");screenshot("app-conversation",null);
            evaluate("document.querySelector('#chat-model-button').click()");waitFor("document.querySelectorAll('[data-model-choice]').length>0",10000);screenshot("app-chat-model-picker",null);
            check("native model menu offers search and response length",truth("!!document.querySelector('[data-model-search]')&&!!document.querySelector('[name=maxTokens]')"));
            evaluate("document.querySelector('[data-model-choice]').click()");waitFor("!document.querySelector('.modal')",10000);
            FakeGatewayConnection.chatMode="stop";FakeGatewayConnection.cancelled=false;
            evaluate("globalThis.stopTask=calendarLedgerPreview.sendChat('继续详细讨论')");waitFor("!document.querySelector('.stop-button').hidden&&document.querySelector('#chat-messages').lastElementChild.textContent.includes('从一个小项目开始')",10000);
            evaluate("document.querySelector('[data-action=stop-chat]').click()");waitFor("!document.querySelector('#chat-form button[type=submit]').disabled",5000);
            check("stop preserves partial answer and explicit stopped status",truth("calendarLedgerPreview.getState().chat.at(-1).status.includes('已停止')&&calendarLedgerPreview.getState().chat.at(-1).text.includes('从一个小项目开始')"));
            SystemClock.sleep(250);check("stop disconnects native upstream request",FakeGatewayConnection.cancelled);
            check("stop causes no business changes",businessBefore.equals(business()));
            restartApp();check("cold start retains long answers and stopped status",truth("calendarLedgerPreview.getState().chat.some(r=>r.text.includes('三个阶段'))&&calendarLedgerPreview.getState().chat.at(-1).status.includes('已停止')"));
            check("API keys remain absent from conversation snapshots",!evaluate("CalendarAndroid.loadSnapshot()").contains("conversation-fixture-key"));
            report.put("actualModel",false).put("apiKeyUsed",false).put("transport","SSE fixture through actual Android native HTTP and WebView bridge");
        }finally{
            FakeGatewayConnection.chatMode="";android.content.SharedPreferences.Editor edit=apiPrefs.edit().clear();for(Map.Entry<String,?> entry:oldPrefs.entrySet()){Object value=entry.getValue();if(value instanceof String)edit.putString(entry.getKey(),(String)value);else if(value instanceof Boolean)edit.putBoolean(entry.getKey(),(Boolean)value);}edit.commit();evaluate("CalendarAndroid.saveSnapshot("+JSONObject.quote(before)+")");restartApp();
        }
    }
    private void chatAPIAcceptance(JSONObject report)throws Exception {
        String before=evaluate("CalendarAndroid.loadSnapshot()");android.content.SharedPreferences apiPrefs=getTargetContext().getSharedPreferences("api-config",0);Map<String,?> oldPrefs=new HashMap<>(apiPrefs.getAll());
        try {
            JSONObject sample=new JSONObject(before),s=sample.getJSONObject("state");for(String key:new String[]{"transactions","events","tasks","undo","chat","lastCreated","expenseAllocations","aiMemory","aiMemorySuggestions","aiChatArchive","correctionHistory","chatBranches"})s.put(key,new JSONArray());s.remove("activeChatBranchId");s.put("aiSummary",JSONObject.NULL).put("chatDraft","");sample.getJSONObject("aiConfig").put("mode","demo").put("autoSummary",false).put("effort","none");
            evaluate("CalendarAndroid.saveSnapshot("+JSONObject.quote(sample.toString())+")");restartApp();sendChat("2026-10-01 月订阅30元");
            String original=evaluate("calendarLedgerPreview.getState().activeChatBranchId");
            evaluate("document.querySelector('#chat-input').value='原聊天草稿';document.querySelector('#chat-input').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-action=fork-chat]').click()");
            check("native fork copies selected history without creating another payment",truth("calendarLedgerPreview.getState().chatBranches.length===2&&calendarLedgerPreview.getState().transactions.length===1&&calendarLedgerPreview.getState().chat.every(r=>r.branchReference)"));
            check("native fork keeps copied undo cards read-only",truth("document.querySelectorAll('#chat-messages [data-action=undo]').length===0"));
            sendChat("刚才那笔改成62");check("native branch edits the shared real payment",truth("calendarLedgerPreview.getState().transactions.length===1&&calendarLedgerPreview.getState().transactions[0].amount===6200"));
            String fork=evaluate("calendarLedgerPreview.getState().activeChatBranchId");
            evaluate("document.querySelector('#chat-input').value='分支草稿';document.querySelector('#chat-input').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-action=chat-branches]').click()");screenshot("app-chat-branches",null);
            check("native branch picker fits phone and offers touch-sized controls",truth("document.querySelector('.branch-open').getBoundingClientRect().height>=44&&document.documentElement.scrollWidth<=innerWidth+1"));
            evaluate("document.querySelector('[data-branch-open=\""+original+"\"]').click()");
            check("native source restores its draft and original discussion",truth("document.querySelector('#chat-input').value==='原聊天草稿'&&calendarLedgerPreview.getState().chat.length===2&&calendarLedgerPreview.getState().transactions[0].amount===6200"));
            evaluate("document.querySelector('[data-action=chat-branches]').click();document.querySelector('[data-branch-open=\""+fork+"\"]').click()");restartApp();
            check("native cold restart retains fork and its text draft",truth("calendarLedgerPreview.getState().activeChatBranchId==="+JSONObject.quote(fork)+"&&document.querySelector('#chat-input').value==='分支草稿'&&calendarLedgerPreview.getState().chat.length===4"));
            evaluate("document.querySelector('[data-action=new-chat]').click()");
            check("native new chat clears context while retaining shared money",truth("calendarLedgerPreview.getState().chat.length===0&&calendarLedgerPreview.getState().transactions[0].amount===6200"));
            evaluate("document.querySelector('.mobile-nav [data-page=more]').click();document.querySelector('.main [data-action=settings]').click();var f=document.querySelector('form[data-form=settings]');f.elements.provider.value='newapi';f.elements.provider.dispatchEvent(new Event('change',{bubbles:true}));f.elements.baseURL.value='https://8.8.8.8/tenant/v1/chat/completions';f.elements.baseURL.dispatchEvent(new Event('input',{bubbles:true}));f.elements.apiKey.value='native-fixture-key-a';document.querySelector('[data-action=settings-models]').click()");
            waitFor("!!document.querySelector('[data-action=settings-model]')",10000);
            check("native model-list probe uses selected gateway path and fixture credential",FakeGatewayConnection.lastUrl.equals("https://8.8.8.8/tenant/v1/models")&&FakeGatewayConnection.lastAuthorization.equals("Bearer native-fixture-key-a"));
            evaluate("document.querySelector('[data-action=settings-model]').click();var f=document.querySelector('form[data-form=settings]');f.elements.aiMode.value='deepseek';f.elements.thinkingFormat.value='deepseek'");screenshot("app-newapi-settings",null);
            evaluate("document.querySelector('form[data-form=settings]').requestSubmit()");waitFor("!document.querySelector('.modal')",10000);
            check("native gateway persists normalized endpoint and model",truth("calendarLedgerPreview.getConfig().provider==='newapi'&&calendarLedgerPreview.getConfig().baseURL==='https://8.8.8.8/tenant/v1'&&calendarLedgerPreview.getConfig().model==='tenant-model'"));
            evaluate("document.querySelector('[data-action=open-ai]').click();document.querySelector('#chat-model-button').click();var f=document.querySelector('[data-ai-controls]');f.elements.effort.value='2';f.requestSubmit();document.querySelector('[data-action=close-modal]').click()");
            waitFor("calendarLedgerPreview.getConfig().effort==='high'",10000);
            sendChat("查询本月实际支出");
            check("native gateway receives tool schema and explicit thinking format",FakeGatewayConnection.lastUrl.equals("https://8.8.8.8/tenant/v1/chat/completions")&&FakeGatewayConnection.lastPayload.getString("model").equals("tenant-model")&&FakeGatewayConnection.lastPayload.getString("reasoning_effort").equals("high")&&FakeGatewayConnection.lastPayload.has("tools"));
            check("native gateway loop executes actual local query without duplicate records",truth("calendarLedgerPreview.getState().chat.at(-1).results.some(r=>r.name==='query_cashflow'&&r.result.expense===6200)&&calendarLedgerPreview.getState().transactions.length===1"));
            screenshot("app-branch-chat",null);restartApp();
            check("native gateway key survives restart only as encrypted private configuration",truth("calendarLedgerPreview.getConfig().configured&&calendarLedgerPreview.getConfig().provider==='newapi'&&!CalendarAndroid.loadSnapshot().includes('native-fixture-key-a')")&&!apiPrefs.getAll().toString().contains("native-fixture-key-a"));
            evaluate("document.querySelector('.mobile-nav [data-page=more]').click();document.querySelector('.main [data-action=settings]').click();var f=document.querySelector('form[data-form=settings]');f.elements.baseURL.value='https://8.8.4.4/v1';f.elements.apiKey.value='';f.requestSubmit()");waitFor("document.querySelector('.form-error').textContent.length>0",10000);
            check("native new address cannot borrow saved gateway key",truth("calendarLedgerPreview.getConfig().baseURL==='https://8.8.8.8/tenant/v1'&&document.querySelector('.form-error').textContent.includes('新的接口地址')"));
            evaluate("var f=document.querySelector('form[data-form=settings]');f.elements.apiKey.value='native-fixture-key-b';f.requestSubmit()");waitFor("!document.querySelector('.modal')",10000);
            check("native second service keeps its own encrypted credential",truth("calendarLedgerPreview.getConfig().baseURL==='https://8.8.4.4/v1'"));
            evaluate("document.querySelector('.main [data-action=settings]').click();var select=document.querySelector('[data-saved-api]');select.value=String(calendarLedgerPreview.getConfig().profiles.findIndex(r=>r.baseURL==='https://8.8.8.8/tenant/v1'));select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('form[data-form=settings]').requestSubmit()");waitFor("!document.querySelector('.modal')",10000);sendChat("再查当前实际支出");
            check("native switching back restores only original gateway credential",FakeGatewayConnection.lastAuthorization.equals("Bearer native-fixture-key-a")&&truth("calendarLedgerPreview.getConfig().baseURL==='https://8.8.8.8/tenant/v1'&&calendarLedgerPreview.getState().transactions.length===1"));
            report.put("actualGateway",false).put("apiKeyUsed",false).put("transport","test-only HTTP gateway through real Android API bridge");
        }finally{android.content.SharedPreferences.Editor edit=apiPrefs.edit().clear();for(Map.Entry<String,?> entry:oldPrefs.entrySet())if(entry.getValue() instanceof String)edit.putString(entry.getKey(),(String)entry.getValue());edit.commit();evaluate("CalendarAndroid.saveSnapshot("+JSONObject.quote(before)+")");restartApp();}
    }
    private void acceptance(JSONObject report)throws Exception {
        check("same-signature upgrade retains every saved record",business().equals(preferences().getString("businessBefore","")));
        check("same-signature upgrade retains encrypted API configuration",getTargetContext().getSharedPreferences("api-config",0).getString("keyCipher","").equals(preferences().getString("keyCipherBefore","!")));
        check("upgrade retains private preference marker","v033-to-v034".equals(preferences().getString("marker","")));
        fixture();restartApp();
        startHost();widget=create();second=create();attach(widget,370,540);
        setMonth(widget.getAppWidgetId(),"2026-10");setMonth(second.getAppWidgetId(),"2026-10");
        waitText(widget,"widget_month","10月");waitText(second,"widget_month","10月");
        check("provider is discoverable by Android's widget framework",widget.getAppWidgetInfo().provider.equals(PROVIDER));
        check("native RemoteViews inflate into five calendar rows",weekCount(widget)==5&&cells(widget).size()==35);
        check("calendar annotates official holiday and adjusted workday",description(widget,"2026-10-01").contains("国庆节")&&description(widget,"2026-10-01").contains("放假")&&description(widget,"2026-10-10").contains("调休上班"));
        check("saved schedule appears on the native calendar",description(widget,"2026-10-09").contains("项目讨论"));
        check("busy holiday retains a visible two-line schedule alongside both accounting rows",visible(dayCell(widget,"2026-10-01"),"widget_event")&&text(dayCell(widget,"2026-10-01"),"widget_event").contains("午后小聚")&&moneyMatches(widget,"2026-10-01"));
        check("widget displays both daily expense and income in their date cells",moneyMatches(widget,"2026-10-01")&&moneyMatches(widget,"2026-10-09")&&visible(dayCell(widget,"2026-10-01"),"widget_expense")&&visible(dayCell(widget,"2026-10-01"),"widget_income"));
        check("refund reduces recorded expense without increasing income",moneyMatches(widget,"2026-10-10"));
        check("refund-only day displays a refund marker and exact accessible total",text(dayCell(widget,"2026-10-11"),"widget_expense").startsWith("退")&&moneyMatches(widget,"2026-10-11"));
        check("transfer-only day has a separate marker and is excluded from income and expense",text(dayCell(widget,"2026-10-12"),"widget_income").startsWith("转")&&moneyMatches(widget,"2026-10-12"));
        check("fully refunded transactions remain visible at zero",text(dayCell(widget,"2026-10-13"),"widget_expense").equals("−0"));
        check("repeated schedule respects excluded occurrence",!description(widget,"2026-10-10").contains("周末运动")&&description(widget,"2026-10-17").contains("周末运动"));
        check("native month uses actual app calendar colors and only calendar controls",view(widget,"widget_ai")!=null&&!allText(widget).contains("预算"));
        check("large month has no overflowing date or schedule views",fits(widget));
        report.put("largeSizeDp",new JSONArray().put(370).put(540));
        screenshot("widget-large",widget);
        tap(view(widget,"widget_next"));waitText(widget,"widget_month","11月");
        check("month arrow changes only the tapped widget",text(second,"widget_month").equals("10月"));
        check("six-week month retains all 42 clickable dates",weekCount(widget)==6&&cells(widget).size()==42);
        check("six-week large calendar fits its allocated rectangle",fits(widget));
        check("six-week calendar keeps both income and expense",moneyMatches(widget,"2026-11-01")&&moneyMatches(widget,"2026-11-09"));
        screenshot("widget-six-weeks",widget);
        tap(view(widget,"widget_previous"));waitText(widget,"widget_month","10月");
        evaluate("globalThis.__widgetChat={input:document.querySelector('#chat-input'),panel:document.querySelector('.ai-panel'),messages:calendarLedgerPreview.getState().chat.length,events:calendarLedgerPreview.getState().events.length};__widgetChat.input.value='继续整理本周安排';__widgetChat.input.dispatchEvent(new Event('input',{bubbles:true}));");
        tap(view(widget,"widget_ai"));detach();waitFor("document.body.classList.contains('ai-visible')",5000);
        check("AI button opens the existing chat through its native PendingIntent",truth("document.querySelector('#chat-input')===__widgetChat.input&&document.querySelector('.ai-panel')===__widgetChat.panel"));
        check("warm AI entry preserves the unsent draft and never sends automatically",truth("document.querySelector('#chat-input').value==='继续整理本周安排'&&calendarLedgerPreview.getState().chat.length===__widgetChat.messages&&calendarLedgerPreview.getState().events.length===__widgetChat.events"));
        check("AI button does not start recording",truth("document.querySelector('#voice-status').hidden"));
        screenshot("widget-ai-open",null);
        attach(widget,370,540);tap(dayCell(widget,"2026-10-01"));detach();
        waitFor("calendarLedgerPreview.getState().selectedDate==='2026-10-01'&&document.querySelector('.main').scrollTop>20",5000);
        check("date PendingIntent opens that day's details below the month",truth("calendarLedgerPreview.getState().page==='calendar'&&!document.body.classList.contains('ai-visible')"));
        attach(widget,370,540);tap(dayCell(widget,"2026-10-10"));detach();
        waitFor("calendarLedgerPreview.getState().selectedDate==='2026-10-10'",5000);
        check("different dates have independent PendingIntent identities",truth("document.querySelector('#day-detail').innerText.includes('10月10日')"));
        screenshot("widget-date-open",null);
        // Real application operations update the widget, including AI-created records.
        int before=Integer.parseInt(evaluate("String(calendarLedgerPreview.getState().events.length)"));
        sendChat("明天下午2点开会1小时，提前30分钟提醒");
        check("existing AI workflow creates the requested schedule",Integer.parseInt(evaluate("String(calendarLedgerPreview.getState().events.length)"))==before+1);
        JSONObject created=new JSONObject(evaluate("JSON.stringify(calendarLedgerPreview.getState().events.at(-1))"));
        String date=created.getString("date"),id=created.getString("id");
        waitDescription(widget,date,created.getString("title"));
        check("AI-created schedule is reflected in saved widget data",description(widget,date).contains(created.getString("time")));
        editEvent(id,date,"AI改过的会议","15:00");waitDescription(widget,date,"AI改过的会议");
        check("editing a schedule refreshes its widget date",description(widget,date).contains("15:00 AI改过的会议"));
        evaluate("__calendarWidgetNavigate({target:'date',date:"+JSONObject.quote(date)+"});document.querySelector('[data-action=edit-event][data-id="+id+"]').click();globalThis.confirm=()=>true;document.querySelector('[data-action=delete-record]').click()");
        waitFor("!calendarLedgerPreview.getState().events.some(e=>e.id==="+JSONObject.quote(id)+")",5000);
        waitAbsentDescription(widget,date,"AI改过的会议");
        check("deleting a schedule removes it from the widget",!description(widget,date).contains("AI改过的会议"));
        before=Integer.parseInt(evaluate("String(calendarLedgerPreview.getState().transactions.length)"));
        sendChat("2026-10-21 午饭25.8");
        JSONObject transaction=new JSONObject(evaluate("JSON.stringify(calendarLedgerPreview.getState().transactions.at(-1))"));
        String transactionId=transaction.getString("id");
        check("existing AI workflow creates the requested transaction",Integer.parseInt(evaluate("String(calendarLedgerPreview.getState().transactions.length)"))==before+1&&transaction.getLong("amount")==2580&&transaction.getString("date").equals("2026-10-21"));
        waitDescription(widget,"2026-10-21",expectedExpense("2026-10-21"));
        check("AI bookkeeping refreshes the native widget immediately",moneyMatches(widget,"2026-10-21"));
        sendChat("午饭改成30.25");
        waitFor("calendarLedgerPreview.getState().transactions.find(t=>t.id==="+JSONObject.quote(transactionId)+").amount===3025",5000);
        waitDescription(widget,"2026-10-21",expectedExpense("2026-10-21"));
        check("AI transaction edit refreshes the daily total",moneyMatches(widget,"2026-10-21"));
        editTransaction(transactionId,"2026-10-21","2026-10-22","40.88");
        waitAbsentDescription(widget,"2026-10-21","支出");waitDescription(widget,"2026-10-22",expectedExpense("2026-10-22"));
        check("moving a transaction refreshes both old and new dates",!visible(dayCell(widget,"2026-10-21"),"widget_expense")&&moneyMatches(widget,"2026-10-22"));
        evaluate("__calendarWidgetNavigate({target:'date',date:'2026-10-22'});document.querySelector('[data-action=edit-transaction][data-id="+transactionId+"]').click();globalThis.confirm=()=>true;document.querySelector('[data-action=delete-record]').click()");
        waitFor("!calendarLedgerPreview.getState().transactions.some(t=>t.id==="+JSONObject.quote(transactionId)+")",5000);
        waitAbsentDescription(widget,"2026-10-22","支出");
        check("deleting the final transaction clears the widget amount",!visible(dayCell(widget,"2026-10-22"),"widget_expense"));
        SystemClock.sleep(600);int updates=widget.updates;
        sendChat("分析本月收支，与上月同期对比");SystemClock.sleep(600);
        check("chat-only updates do not redraw an unchanged calendar",widget.updates==updates);
        attach(widget,250,460);SystemClock.sleep(500);
        check("resizing to a compact widget retains all dates",cells(widget).size()==35&&fits(widget));
        check("compact widget retains money even alongside a holiday",moneyMatches(widget,"2026-10-01")&&visible(dayCell(widget,"2026-10-01"),"widget_income"));
        screenshot("widget-compact",widget);
        detach();settings("dark","large",0);attach(widget,370,540);waitWeekday(widget,"日");
        check("widget follows Sunday-first and large-text app settings",text(view(widget,"widget_weekdays"),"widget_weekday").equals("日")&&((TextView)view(widget,"widget_date")).getTextSize()/density()>=12.9f);
        check("widget follows the application's dark Morandi theme",((GradientDrawable)view(widget,"widget_root").getBackground()).getColor().getDefaultColor()==Color.parseColor("#303632"));
        check("dark widget retains readable daily accounting totals",moneyMatches(widget,"2026-10-01")&&moneyMatches(widget,"2026-10-10"));
        check("dark large-text widget remains within the calendar rectangle",fits(widget));
        screenshot("widget-dark",widget);
        setMonth(widget.getAppWidgetId(),"2027-02");waitText(widget,"widget_year","2027");waitText(widget,"widget_month","2月");
        check("native offline lunar festivals match the app across years",description(widget,"2027-02-06").contains("春节"));
        detach();settings("light","normal",1);setMonth(widget.getAppWidgetId(),"2027-02");attach(widget,370,540);
        waitWeekday(widget,"一");
        check("four-week February contains all 28 dates",weekCount(widget)==4&&cells(widget).size()==28);
        setMonth(widget.getAppWidgetId(),"2026-11");waitText(widget,"widget_month","11月");
        preferences().edit().putInt("keptId",widget.getAppWidgetId()).commit();keepBindings=true;
        host.deleteAppWidgetId(second.getAppWidgetId());allocated.remove(Integer.valueOf(second.getAppWidgetId()));
        check("widget month navigation never changes application business records",truth("calendarLedgerPreview.getState().events.some(e=>e.id==='qa-widget-discussion')"));
        report.put("frameworkUpdates",widget.updates);
    }
    private void projectionAcceptance(JSONObject report)throws Exception {
        String original=evaluate("CalendarAndroid.loadSnapshot()");
        Class<?> type=Class.forName(PACKAGE+".WidgetCalendarData");
        java.lang.reflect.Constructor<?> constructor=type.getDeclaredConstructor(Context.class,java.time.YearMonth.class);constructor.setAccessible(true);
        java.lang.reflect.Field holidays=type.getDeclaredField("holidays");holidays.setAccessible(true);
        java.lang.reflect.Method observance=type.getDeclaredMethod("observance",String.class);observance.setAccessible(true);
        java.lang.reflect.Field events=type.getDeclaredField("events");events.setAccessible(true);
        try {
            JSONObject noCache=new JSONObject(original);noCache.getJSONObject("state").remove("holidayDays");noCache.getJSONObject("state").remove("holidayMeta");
            check("cache-free snapshot remains valid",truth("CalendarAndroid.saveSnapshot("+JSONObject.quote(noCache.toString())+")"));
            Object bundled=constructor.newInstance(getTargetContext(),java.time.YearMonth.of(2026,10));
            Map<?,?> bundledDays=(Map<?,?>)holidays.get(bundled);
            check("widget loads official bundled workdays without app holiday cache",bundledDays.containsKey("2026-10-10")&&!((JSONObject)bundledDays.get("2026-10-10")).optBoolean("isOffDay"));
            JSONObject corrected=new JSONObject(original);corrected.getJSONObject("state").getJSONObject("holidayDays").remove("2026-10-10");
            check("corrected cached year remains valid",truth("CalendarAndroid.saveSnapshot("+JSONObject.quote(corrected.toString())+")"));
            Object updated=constructor.newInstance(getTargetContext(),java.time.YearMonth.of(2026,10));
            check("a removed cached holiday does not reappear from an old bundle",!((Map<?,?>)holidays.get(updated)).containsKey("2026-10-10"));
            Object overlap=constructor.newInstance(getTargetContext(),java.time.YearMonth.of(2020,10));
            String names=String.valueOf(observance.invoke(overlap,"2020-10-01"));
            check("coincident festivals retain both names",names.contains("国庆节")&&names.contains("中秋节"));
            Object february=constructor.newInstance(getTargetContext(),java.time.YearMonth.of(2026,2));
            Object january=constructor.newInstance(getTargetContext(),java.time.YearMonth.of(2026,1));
            String jan=String.valueOf(((Map<?,?>)events.get(january)).get("2026-01-31"));
            String feb=String.valueOf(((Map<?,?>)events.get(february)).get("2026-02-28"));
            check("monthly day 31 is displayed without moving it to February 28",jan.contains("qa-widget-salary")&&!feb.contains("qa-widget-salary"));
        } finally {evaluate("CalendarAndroid.saveSnapshot("+JSONObject.quote(original)+")");}
        int id=preferences().getInt("keptId",-1);startHost();widget=restore(id);attach(widget,370,540);
        waitText(widget,"widget_month","11月");
        int before=widget.updates;
        Bundle fallback=new Bundle();fallback.putParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES,null);
        AppWidgetManager.getInstance(getTargetContext()).updateAppWidgetOptions(id,fallback);
        long end=SystemClock.elapsedRealtime()+8000;while(widget.updates<=before&&SystemClock.elapsedRealtime()<end)SystemClock.sleep(100);
        check("responsive RemoteViews fallback inflates when launcher omits sizes",widget.updates>before&&weekCount(widget)==6&&fits(widget));
        report.put("responsiveFallback",true);keepBindings=true;
    }
    private void sparseGridAcceptance(JSONObject report)throws Exception {
        settings("light","normal",1);
        JSONObject original=new JSONObject(evaluate("CalendarAndroid.loadSnapshot()"));
        startHost();widget=restore(preferences().getInt("keptId",-1));
        keepBindings=true;
        try {
            JSONObject sample=new JSONObject(original.toString());
            JSONArray events=new JSONArray();sample.getJSONObject("state").put("events",events);
            evaluate("CalendarAndroid.saveSnapshot("+JSONObject.quote(sample.toString())+")");
            setMonth(widget.getAppWidgetId(),"2027-05");attach(widget,370,540);waitText(widget,"widget_month","5月");
            SystemClock.sleep(600);
            check("empty six-week month has a framed surface for every clickable date",weekCount(widget)==6&&cells(widget).size()==42&&framesFit(widget));
            check("empty month uses quiet distinct weekday, weekend and outside surfaces",surfaceColor(dayCell(widget,"2027-05-03"))!=surfaceColor(dayCell(widget,"2027-05-02"))&&surfaceColor(dayCell(widget,"2027-05-03"))!=surfaceColor(dayCell(widget,"2027-04-26")));
            check("ordinary empty dates display a lunar sublabel",!text(dayCell(widget,"2027-05-03"),"widget_observance").isEmpty()&&description(widget,"2027-05-03").contains("农历"));
            check("empty schedule state preserves accounting and holiday labels",moneyMatches(widget,"2027-05-01")&&text(dayCell(widget,"2027-05-01"),"widget_observance").equals("劳动节")&&!visible(dayCell(widget,"2027-05-01"),"widget_event")&&fits(widget));
            screenshot("widget-empty",widget);
            events.put(event("sparse-one","出门买菜","2027-05-01","09:00","personal","none","",new JSONArray()));
            evaluate("CalendarAndroid.saveSnapshot("+JSONObject.quote(sample.toString())+")");waitDescription(widget,"2027-05-01","出门买菜");SystemClock.sleep(250);
            check("one scheduled holiday keeps the title and both accounting rows visible",visible(dayCell(widget,"2027-05-01"),"widget_event")&&moneyMatches(widget,"2027-05-01")&&fits(widget));
            check("schedule and accounting remain grouped inside the same date frame",groupedContent(dayCell(widget,"2027-05-01")));
            screenshot("widget-one-event",widget);
            events.put(event("sparse-two","下午去公园散步","2027-05-10","15:00","personal","none","",new JSONArray()));
            events.put(event("sparse-three","年度牙齿检查","2027-05-22","10:30","personal","none","",new JSONArray()));
            evaluate("CalendarAndroid.saveSnapshot("+JSONObject.quote(sample.toString())+")");waitDescription(widget,"2027-05-10","下午去公园散步");waitDescription(widget,"2027-05-22","年度牙齿检查");SystemClock.sleep(250);
            check("three sparse schedules retain their full accessible titles and fit the frames",visible(dayCell(widget,"2027-05-10"),"widget_event")&&visible(dayCell(widget,"2027-05-22"),"widget_event")&&framesFit(widget)&&fits(widget));
            screenshot("widget-three-events",widget);
            attach(widget,230,460);SystemClock.sleep(500);
            check("minimum six-week grid retains frames, a holiday schedule and both money lines",framesFit(widget)&&fits(widget)&&visible(dayCell(widget,"2027-05-01"),"widget_event")&&moneyMatches(widget,"2027-05-01"));
            report.put("scheduleCounts",new JSONArray().put(0).put(1).put(3));
        } finally {
            evaluate("CalendarAndroid.saveSnapshot("+JSONObject.quote(original.toString())+")");
            setMonth(widget.getAppWidgetId(),"2026-11");detach();restartApp();
        }
    }
    private Object weatherController()throws Exception{
        java.lang.reflect.Field field=activity.getClass().getDeclaredField("weather");field.setAccessible(true);return field.get(activity);
    }
    private JSONObject weatherStatus()throws Exception{
        Object controller=weatherController();java.lang.reflect.Method method=controller.getClass().getDeclaredMethod("status");method.setAccessible(true);
        return (JSONObject)method.invoke(controller);
    }
    private void weatherConfigure(JSONObject city)throws Exception{
        Object controller=weatherController();java.lang.reflect.Method method=controller.getClass().getDeclaredMethod("configure",JSONObject.class);method.setAccessible(true);method.invoke(controller,city);
    }
    private void weatherIdle()throws Exception{
        long end=SystemClock.elapsedRealtime()+12000;
        while(SystemClock.elapsedRealtime()<end){if(!weatherStatus().optBoolean("refreshing"))return;SystemClock.sleep(80);}
        throw new AssertionError("Weather did not become idle");
    }
    private void weatherBackground()throws Exception{
        long end=SystemClock.elapsedRealtime()+6000;
        while(SystemClock.elapsedRealtime()<end){
            Object controller=weatherController();java.lang.reflect.Field field=controller.getClass().getDeclaredField("foreground");field.setAccessible(true);
            synchronized(controller){if(!field.getBoolean(controller))return;}
            SystemClock.sleep(50);
        }
        throw new AssertionError("Activity did not reach its weather onStop hook");
    }
    private File weatherFile(){return new File(getTargetContext().getFilesDir(),"weather-cache-v1.json");}
    private byte[] weatherBytes()throws Exception{
        if(!weatherFile().exists())return null;return new android.util.AtomicFile(weatherFile()).readFully();
    }
    private void writeWeather(byte[] bytes)throws Exception{
        Class<?> store=Class.forName(PACKAGE+".WeatherStore");
        java.lang.reflect.Field lock=store.getDeclaredField("LOCK");lock.setAccessible(true);
        synchronized(lock.get(null)){
            android.util.AtomicFile file=new android.util.AtomicFile(weatherFile());
            if(bytes==null){file.delete();return;}
            FileOutputStream output=file.startWrite();try{output.write(bytes);file.finishWrite(output);}catch(Exception error){file.failWrite(output);throw error;}
        }
        Class<?> provider=Class.forName(PACKAGE+".CalendarWidgetProvider");java.lang.reflect.Method changed=provider.getDeclaredMethod("weatherChanged",Context.class);changed.setAccessible(true);changed.invoke(null,getTargetContext());
    }
    private boolean rejectsForecast(JSONObject forecast,JSONObject city)throws Exception{
        Class<?> store=Class.forName(PACKAGE+".WeatherStore");
        java.lang.reflect.Method normalize=store.getDeclaredMethod("normalizeForecast",JSONObject.class,JSONObject.class,long.class);normalize.setAccessible(true);
        try{normalize.invoke(null,forecast,city,System.currentTimeMillis());return false;}catch(java.lang.reflect.InvocationTargetException error){return true;}
    }
    private boolean weatherHeadersFit(View parent){
        AtomicReference<Boolean> result=new AtomicReference<>(true);
        onUi(()->{
            for(View cell:cells(parent)){
                Rect previous=null,frame=new Rect();view(cell,"widget_day_surface").getGlobalVisibleRect(frame);
                for(String id:new String[]{"widget_date","widget_weather","widget_event_more","widget_holiday_badge"}){
                    View child=view(cell,id);if(child==null||child.getVisibility()!=View.VISIBLE)continue;
                    Rect rect=new Rect();child.getGlobalVisibleRect(rect);
                    if(rect.width()<child.getWidth()-1||rect.left<frame.left||rect.right>frame.right
                            ||(previous!=null&&Rect.intersects(previous,rect)))result.set(false);
                    previous=rect;
                }
            }
        });return result.get();
    }
    private void weatherAcceptance(JSONObject report)throws Exception {
        byte[] originalWeather=weatherBytes();String originalSnapshot=evaluate("CalendarAndroid.loadSnapshot()");
        String before=business();JSONObject beijing=FakeWeatherConnection.city("北京",39.9075,116.39723);
        String today=java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).toString();
        String tomorrow=java.time.LocalDate.parse(today).plusDays(1).toString();
        try {
            check("unconfigured app does not make a weather request",FakeWeatherConnection.requests.get()==0);
            evaluate("document.querySelector('.mobile-nav [data-page=more]').click();document.querySelector('.main [data-action=weather]').click()");
            waitFor("document.querySelector('#weather-city-input')!==null",5000);
            evaluate("document.querySelector('#weather-city-input').value='北京';document.querySelector('#weather-search-form').requestSubmit()");
            waitFor("document.querySelector('[data-weather-index]')!==null",6000);
            check("city search requires an explicit choice instead of choosing the first result",weatherStatus().optJSONObject("city")==null&&FakeWeatherConnection.forecasts.get()==0);
            evaluate("document.querySelector('[data-weather-index=\"0\"]').click()");
            waitFor("document.querySelector('.weather-update')?.textContent.includes('最近更新')",6000);weatherIdle();
            JSONObject status=weatherStatus();
            check("selected city receives one forecast through the real native bridge","北京".equals(status.getJSONObject("city").getString("name"))&&FakeWeatherConnection.forecasts.get()==1&&status.optLong("updatedAt")>0);
            check("null or unknown WMO codes are omitted rather than made into sunny days",status.getJSONArray("days").length()==14&&!status.getJSONArray("days").toString().contains("\"code\":999"));
            JSONObject noTemperature=status.getJSONArray("days").getJSONObject(7);
            check("missing temperatures remain absent",!noTemperature.has("min")&&!noTemperature.has("max"));
            check("new forecast covers only the supplied up-to-16-day dates",status.getString("forecastEnd").equals(java.time.LocalDate.parse(today).plusDays(15).toString()));
            byte[] cache=weatherBytes();
            check("durable weather cache is small and excludes accounting, messages and API credentials",cache.length<10_240&&!new String(cache,"UTF-8").matches("(?s).*(transactions|events|apiKey|keyCipher|messages).*"));
            check("reading and configuring weather leaves accounting, events, budgets and ledgers unchanged",before.equals(business()));
            JSONObject malformed=FakeWeatherConnection.forecast();malformed.getJSONObject("daily").getJSONArray("weather_code").put(16,0);
            check("incomplete provider arrays are rejected",rejectsForecast(malformed,beijing));
            malformed=FakeWeatherConnection.forecast();malformed.getJSONObject("daily").getJSONArray("time").put(0,java.time.LocalDate.parse(today).minusDays(1).toString());
            check("a stale provider date range is rejected",rejectsForecast(malformed,beijing));
            malformed=FakeWeatherConnection.forecast();malformed.getJSONObject("daily_units").put("temperature_2m_max","°F");
            check("unexpected Fahrenheit data cannot be shown as Celsius",rejectsForecast(malformed,beijing));
            boolean rejected=false;try{weatherConfigure(new JSONObject(beijing.toString()).put("latitude",91));}catch(Exception expected){rejected=true;}
            check("invalid city coordinates cannot replace the saved city",rejected&&weatherStatus().getJSONObject("city").getString("name").equals("北京"));
            check("weather modal fits the real phone viewport and displays cached update time",truth("document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('.modal').getBoundingClientRect().right<=innerWidth+1&&document.querySelector('.weather-forecast').children.length===7"));
            screenshot("app-weather",null);evaluate("document.querySelector('.weather-settings [data-action=close-modal]').click()");
            settings("light","normal",1);
            startHost();widget=restore(preferences().getInt("keptId",-1));keepBindings=true;
            JSONObject sample=new JSONObject(originalSnapshot);JSONObject state=sample.getJSONObject("state");
            state.getJSONArray("transactions").put(transaction("weather-expense",today,"expense",1980)).put(transaction("weather-income",today,"income",8000));
            state.getJSONArray("events").put(event("weather-shopping","下班买菜",today,"18:00","personal","none","",new JSONArray()));
            evaluate("CalendarAndroid.saveSnapshot("+JSONObject.quote(sample.toString())+")");
            setMonth(widget.getAppWidgetId(),today.substring(0,7));attach(widget,370,540);SystemClock.sleep(500);
            check("weather icon shares the existing date header while both money lines and schedule remain visible",visible(dayCell(widget,today),"widget_weather")&&visible(dayCell(widget,today),"widget_expense")&&visible(dayCell(widget,today),"widget_income")&&visible(dayCell(widget,today),"widget_event")&&fits(widget)&&weatherHeadersFit(widget));
            check("date accessibility describes the full forecast and temperature",description(widget,today).contains("北京天气预报：晴")&&description(widget,today).contains("13至24摄氏度"));
            check("widget carries a visible weather-source link",visible(widget,"widget_weather_source")&&text(widget,"widget_weather_source").equals("Open-Meteo"));
            screenshot("widget-weather",widget);
            state.getJSONArray("events").put(event("weather-two","项目讨论",today,"19:00","work","none","",new JSONArray()))
                    .put(event("weather-three","阅读半小时",today,"20:00","personal","none","",new JSONArray()));
            state.getJSONObject("holidayDays").put(today,new JSONObject().put("date",today).put("name","QA调休").put("isOffDay",false));
            evaluate("CalendarAndroid.saveSnapshot("+JSONObject.quote(sample.toString())+")");
            refresh(widget.getAppWidgetId());SystemClock.sleep(500);
            check("crowded header preserves exact +N and holiday badge without overlap",visible(dayCell(widget,today),"widget_event_more")&&visible(dayCell(widget,today),"widget_holiday_badge")&&weatherHeadersFit(widget)&&fits(widget));
            attach(widget,230,460);SystemClock.sleep(400);
            report.put("minimumWeatherHeaderFits",weatherHeadersFit(widget)).put("minimumWeatherBodyFits",fits(widget));
            check("minimum width omits only the optional icon on a crowded day",!visible(dayCell(widget,today),"widget_weather")&&visible(dayCell(widget,today),"widget_event_more")&&visible(dayCell(widget,today),"widget_event")&&visible(dayCell(widget,today),"widget_expense")&&visible(dayCell(widget,today),"widget_income")&&report.getBoolean("minimumWeatherHeaderFits")&&report.getBoolean("minimumWeatherBodyFits"));
            check("minimum width still shows weather on an uncrowded date",visible(dayCell(widget,tomorrow),"widget_weather"));
            screenshot("widget-weather-minimum",widget);
            state.getJSONObject("holidayDays").remove(today);
            evaluate("CalendarAndroid.saveSnapshot("+JSONObject.quote(sample.toString())+")");
            detach();settings("dark","large",1);attach(widget,370,540);SystemClock.sleep(500);
            check("dark and large-font widget retains native weather icons and uncut content",visible(dayCell(widget,tomorrow),"widget_weather")&&weatherHeadersFit(widget)&&fits(widget));
            screenshot("widget-weather-dark",widget);
            int requests=FakeWeatherConnection.requests.get();
            onUi(()->callActivityOnResume(activity));SystemClock.sleep(250);
            weatherStatus();refresh(widget.getAppWidgetId());attach(widget,250,460);
            check("status reads, resume, widget refresh and resize do not poll weather",FakeWeatherConnection.requests.get()==requests);
            // Exercise the actual Activity onStop hook, not a synthetic background flag.
            onUi(()->activity.moveTaskToBack(true));weatherBackground();
            int background=FakeWeatherConnection.requests.get();
            refresh(widget.getAppWidgetId());
            getTargetContext().sendBroadcast(new Intent(PACKAGE+".WIDGET_NEXT").setComponent(PROVIDER).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,widget.getAppWidgetId()));
            getTargetContext().sendBroadcast(new Intent(PACKAGE+".WIDGET_MIDNIGHT").setComponent(PROVIDER));
            weatherStatus();SystemClock.sleep(600);
            check("background widget flip, midnight and local reads make zero weather network requests",FakeWeatherConnection.requests.get()==background);
            rejected=false;try{weatherConfigure(beijing);}catch(Exception expected){rejected=true;}
            check("background cannot initiate city configuration or forecast networking",rejected&&FakeWeatherConnection.requests.get()==background);
            onUi(()->activity.startActivity(entryIntent()));SystemClock.sleep(500);weatherIdle();
            check("returning to the app foreground refreshes once",FakeWeatherConnection.forecasts.get()==2);
            String previousDays=weatherStatus().getJSONArray("days").toString();long updated=weatherStatus().getLong("updatedAt");
            FakeWeatherConnection.fail=true;restartApp();weatherIdle();
            check("network failure preserves last successful forecast and timestamp",weatherStatus().getLong("updatedAt")==updated&&weatherStatus().getJSONArray("days").toString().equals(previousDays)&&!weatherStatus().getString("lastError").isEmpty());
            FakeWeatherConnection.fail=false;
            JSONObject raw=new JSONObject(new String(weatherBytes(),"UTF-8"));
            raw.put("updatedAt",System.currentTimeMillis()-25L*3600*1000);writeWeather(raw.toString().getBytes("UTF-8"));
            report.put("staleCacheStatus",weatherStatus());
            check("older-than-24-hour cache is explicitly marked stale",weatherStatus().getBoolean("stale")&&!weatherStatus().getBoolean("expired")&&weatherStatus().getJSONArray("days").length()>0);
            raw.put("updatedAt",System.currentTimeMillis()-73L*3600*1000);writeWeather(raw.toString().getBytes("UTF-8"));
            check("expired forecast is hidden without a background update",weatherStatus().getBoolean("expired")&&weatherStatus().getJSONArray("days").length()==0);
            FakeWeatherConnection.block=true;int target=FakeWeatherConnection.forecasts.get()+1;weatherConfigure(beijing);
            long deadline=SystemClock.elapsedRealtime()+4000;
            while(FakeWeatherConnection.forecasts.get()<target&&SystemClock.elapsedRealtime()<deadline)SystemClock.sleep(30);
            check("cancellation test actually starts an in-flight request",FakeWeatherConnection.forecasts.get()>=target);
            onUi(()->activity.moveTaskToBack(true));weatherBackground();FakeWeatherConnection.block=false;SystemClock.sleep(400);
            check("leaving the app cancels an in-flight response and prevents a new cache timestamp",weatherStatus().getLong("updatedAt")==raw.getLong("updatedAt"));
            onUi(()->activity.startActivity(entryIntent()));SystemClock.sleep(400);weatherIdle();
            weatherConfigure(null);
            check("turning weather off removes forecast and city",weatherStatus().optJSONObject("city")==null&&weatherStatus().getJSONArray("days").length()==0);
            int disabled=FakeWeatherConnection.requests.get();restartApp();SystemClock.sleep(250);
            check("disabled weather does not fetch when the app opens again",FakeWeatherConnection.requests.get()==disabled);
            FakeWeatherConnection.block=true;weatherConfigure(beijing);SystemClock.sleep(150);
            weatherConfigure(FakeWeatherConnection.city("上海",31.22222,121.45806));
            check("switching city immediately clears the previous city's cache",weatherStatus().getJSONObject("city").getString("name").equals("上海")&&weatherStatus().getJSONArray("days").length()==0&&weatherStatus().getLong("updatedAt")==0);
            FakeWeatherConnection.block=false;weatherIdle();
            check("late old-city responses cannot overwrite the chosen city","上海".equals(weatherStatus().getJSONObject("city").getString("name"))&&weatherStatus().getJSONArray("days").length()>0);
            report.put("weatherRequests",FakeWeatherConnection.requests.get()).put("forecastRequests",FakeWeatherConnection.forecasts.get())
                    .put("weatherCacheBytes",weatherBytes().length).put("providerResponses","synthetic; real native networking path and lifecycle")
                    .put("fontScale",getTargetContext().getResources().getConfiguration().fontScale);
        } finally {
            FakeWeatherConnection.fail=false;FakeWeatherConnection.block=false;
            try{weatherConfigure(null);}catch(Exception ignored){}
            writeWeather(originalWeather);
            evaluate("CalendarAndroid.saveSnapshot("+JSONObject.quote(originalSnapshot)+")");
            setMonth(preferences().getInt("keptId",-1),"2026-11");detach();restartApp();
        }
    }
    private void liveWeatherAcceptance(JSONObject report)throws Exception {
        byte[] originalWeather=weatherBytes();
        try {
            weatherConfigure(FakeWeatherConnection.city("北京",39.9075,116.39723));
            long end=SystemClock.elapsedRealtime()+22000;
            while(weatherStatus().optBoolean("refreshing")&&SystemClock.elapsedRealtime()<end)SystemClock.sleep(120);
            JSONObject status=weatherStatus();
            check("real Android HTTPS forecast completes through the production provider",status.getLong("updatedAt")>0&&status.getJSONArray("days").length()>0&&status.optString("lastError").isEmpty());
            report.put("provider","https://api.open-meteo.com/v1/forecast").put("city","北京")
                    .put("weatherDays",status.getJSONArray("days").length()).put("weatherCacheBytes",weatherBytes().length);
            settings("light","normal",1);
            startHost();widget=restore(preferences().getInt("keptId",-1));keepBindings=true;
            setMonth(widget.getAppWidgetId(),status.getString("today").substring(0,7));attach(widget,370,540);SystemClock.sleep(400);
            check("real forecast renders beside today's date",visible(dayCell(widget,status.getString("today")),"widget_weather")&&weatherHeadersFit(widget)&&fits(widget));
            screenshot("widget-weather-live",widget);
            detach();evaluate("document.querySelector('.mobile-nav [data-page=more]').click();document.querySelector('.main [data-action=weather]').click()");
            waitFor("document.querySelector('.weather-forecast')!==null",5000);screenshot("app-weather-live",null);
        } finally {
            try{weatherConfigure(null);}catch(Exception ignored){}
            writeWeather(originalWeather);detach();
        }
    }
    private int surfaceColor(View cell){
        AtomicReference<Integer> color=new AtomicReference<>(0);
        onUi(()->color.set(((GradientDrawable)view(cell,"widget_day_surface").getBackground()).getColor().getDefaultColor()));return color.get();
    }
    private boolean framesFit(View parent){
        AtomicReference<Boolean> result=new AtomicReference<>(true);
        onUi(()->{
            Rect previous=null;
            for(View cell:cells(parent)){
                View surface=view(cell,"widget_day_surface");Rect bounds=new Rect(),frame=new Rect();cell.getGlobalVisibleRect(bounds);
                if(surface==null||!(surface.getBackground() instanceof GradientDrawable)||!surface.getGlobalVisibleRect(frame)||frame.height()<surface.getHeight()-1||frame.left<bounds.left||frame.right>bounds.right||frame.bottom>bounds.bottom){result.set(false);continue;}
                if(previous!=null&&previous.top==frame.top&&frame.left-previous.right<density())result.set(false);
                previous=frame;
            }
        });return result.get();
    }
    private boolean groupedContent(View cell){
        AtomicReference<Boolean> result=new AtomicReference<>(false);
        onUi(()->{View event=view(cell,"widget_event"),expense=view(cell,"widget_expense");int[] a=new int[2],b=new int[2];event.getLocationOnScreen(a);expense.getLocationOnScreen(b);result.set(b[1]>=a[1]+event.getHeight()&&b[1]-a[1]-event.getHeight()<=dp(2));});return result.get();
    }
    private Intent entryIntent(){return new Intent().setClassName(PACKAGE,PACKAGE+".MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);}
    private SharedPreferences preferences(){return getTargetContext().getSharedPreferences("qa-widget",0);}
    private void startApp(Intent intent)throws Exception{
        activity=startActivitySync(intent);onUi(()->web=findWeb(activity.getWindow().getDecorView()));
        if(web==null)throw new AssertionError("No Android WebView");waitFor("!!globalThis.calendarLedgerPreview",15000);SystemClock.sleep(200);
    }
    private void restartApp()throws Exception{onUi(()->activity.finish());SystemClock.sleep(300);startApp(entryIntent());}
    private void fixture()throws Exception {
        JSONObject snapshot=new JSONObject(evaluate("CalendarAndroid.loadSnapshot()"));JSONObject state=snapshot.getJSONObject("state");
        JSONArray old=state.getJSONArray("events"),events=new JSONArray();
        for(int i=0;i<old.length();i++)if(!old.getJSONObject(i).optString("id").startsWith("qa-widget-"))events.put(old.get(i));
        events.put(event("busy-holiday","出门买菜","2027-05-01","09:00","personal","none","",new JSONArray()));
        events.put(event("oct-holiday","午后小聚","2026-10-01","15:00","personal","none","",new JSONArray()));
        events.put(event("discussion","项目讨论","2026-10-09","14:00","work","none","",new JSONArray()));
        events.put(event("reading","阅读半小时","2026-10-05","09:00","personal","none","",new JSONArray()));
        events.put(event("fitness","周末运动","2026-10-03","17:00","personal","weekly","2026-11-30",new JSONArray().put("2026-10-10")));
        events.put(event("salary","月末整理","2026-01-31","10:00","work","monthly","",new JSONArray()));
        JSONArray previous=state.getJSONArray("transactions"),transactions=new JSONArray();
        for(int i=0;i<previous.length();i++){JSONObject row=previous.getJSONObject(i);String date=row.optString("date");if(!row.optString("id").startsWith("qa-widget-money-")&&!date.equals("2026-10-11")&&!date.equals("2026-10-12")&&!date.equals("2026-10-13"))transactions.put(row);}
        transactions.put(transaction("holiday-expense","2026-10-01","expense",5800));
        transactions.put(transaction("holiday-income","2026-10-01","income",120000));
        transactions.put(transaction("schedule-expense","2026-10-09","expense",2850));
        transactions.put(transaction("schedule-income","2026-10-09","income",5000));
        transactions.put(transaction("today-expense","2026-10-10","expense",2580));
        transactions.put(transaction("today-refund","2026-10-10","refund",500));
        transactions.put(transaction("today-income","2026-10-10","income",650000));
        transactions.put(transaction("refund","2026-10-11","refund",2088));
        transactions.put(transaction("transfer","2026-10-12","transfer",55000));
        transactions.put(transaction("zero-expense","2026-10-13","expense",3000));
        transactions.put(transaction("zero-refund","2026-10-13","refund",3000));
        transactions.put(transaction("six-expense","2026-11-01","expense",4388));
        transactions.put(transaction("six-income","2026-11-01","income",80001));
        transactions.put(transaction("long-expense","2026-11-09","expense",99999));
        transactions.put(transaction("long-income","2026-11-09","income",99999999));
        transactions.put(transaction("minimum-expense","2027-05-01","expense",1980));
        transactions.put(transaction("minimum-income","2027-05-01","income",8000));
        state.put("transactions",transactions);
        state.put("events",events).put("page","calendar").put("viewMonth","2026-10").put("selectedDate","2026-10-10").put("calendarView","month");
        state.getJSONObject("settings").put("theme","light").put("fontSize","normal").put("weekStart",1);
        snapshot.getJSONObject("aiConfig").put("mode","demo");
        check("fixtures use the real atomic snapshot bridge",truth("CalendarAndroid.saveSnapshot("+JSONObject.quote(snapshot.toString())+")"));
    }
    private JSONObject event(String id,String title,String date,String time,String calendar,String repeat,String until,JSONArray exceptions)throws Exception{
        return new JSONObject().put("id","qa-widget-"+id).put("title",title).put("date",date).put("time",time)
                .put("duration",60).put("reminder",0).put("calendar",calendar).put("repeat",repeat).put("until",until).put("exceptions",exceptions).put("notes","");
    }
    private JSONObject transaction(String id,String date,String kind,long cents)throws Exception{
        return new JSONObject().put("id","qa-widget-money-"+id).put("date",date).put("kind",kind).put("amount",cents)
                .put("category",kind.equals("income")?"工资":"餐饮").put("note","组件记账测试").put("account","微信").put("ledger","个人账本");
    }
    private void editTransaction(String id,String oldDate,String newDate,String amount)throws Exception{
        evaluate("__calendarWidgetNavigate({target:'date',date:"+JSONObject.quote(oldDate)+"});document.querySelector('[data-action=edit-transaction][data-id="+id+"]').click();var f=document.querySelector('form[data-form=transaction]');f.elements.date.value="+JSONObject.quote(newDate)+";f.elements.amount.value="+JSONObject.quote(amount)+";f.requestSubmit()");
        waitFor("!document.querySelector('.modal')",5000);
    }
    private String expectedExpense(String date)throws Exception{
        return "支出 "+evaluate("(calendarLedgerPreview.getState().transactions.filter(t=>t.date==="+JSONObject.quote(date)+"&&(t.kind==='expense'||t.kind==='refund')).reduce((s,t)=>s+(t.kind==='refund'?-t.amount:t.amount),0)/100).toFixed(2)")+" 元";
    }
    private boolean moneyMatches(View parent,String date)throws Exception{
        String json=evaluate("JSON.stringify(calendarLedgerPreview.getState().transactions.filter(t=>t.date==="+JSONObject.quote(date)+"))");
        JSONArray entries=new JSONArray(json);long income=0,expense=0;int incomes=0,expenses=0,transfers=0;
        for(int i=0;i<entries.length();i++){JSONObject t=entries.getJSONObject(i);String kind=t.getString("kind");long cents=t.getLong("amount");if(kind.equals("income")){income+=cents;incomes++;}if(kind.equals("expense")||kind.equals("refund")){expense+=kind.equals("refund")?-cents:cents;expenses++;}if(kind.equals("transfer"))transfers++;}
        View day=dayCell(parent,date);String description=description(parent,date);
        return (expenses==0||visible(day,"widget_expense")&&description.contains("支出 "+orgExact(expense)+" 元"))
                &&(incomes==0||visible(day,"widget_income")&&description.contains("收入 "+orgExact(income)+" 元"))
                &&(transfers==0||description.contains("不计入收支"));
    }
    private String orgExact(long cents){return java.math.BigDecimal.valueOf(cents,2).toPlainString();}
    private boolean visible(View parent,String name){AtomicReference<Boolean> result=new AtomicReference<>(false);onUi(()->{View v=view(parent,name);result.set(v!=null&&v.getVisibility()==View.VISIBLE);});return result.get();}
    private void settings(String theme,String font,int weekStart)throws Exception{
        evaluate("document.querySelector('[data-action=settings]').click();var f=document.querySelector('form[data-form=settings]');f.elements.aiMode.value='demo';f.elements.theme.value="+JSONObject.quote(theme)+";f.elements.fontSize.value="+JSONObject.quote(font)+";f.elements.weekStart.value='"+weekStart+"';f.requestSubmit()");
        waitFor("!document.querySelector('.modal')",5000);SystemClock.sleep(500);
    }
    private void editEvent(String id,String date,String title,String time)throws Exception{
        evaluate("__calendarWidgetNavigate({target:'date',date:"+JSONObject.quote(date)+"});document.querySelector('[data-action=edit-event][data-id="+id+"]').click();var f=document.querySelector('form[data-form=event]');f.elements.title.value="+JSONObject.quote(title)+";f.elements.time.value="+JSONObject.quote(time)+";f.requestSubmit()");
        waitFor("!document.querySelector('.modal')",5000);
    }
    private void startHost(){
        onUi(()->{host=new AppWidgetHost(getTargetContext(),90030){@Override protected AppWidgetHostView onCreateView(Context context,int id,AppWidgetProviderInfo info){return new CountingHostView(context);}};host.startListening();});
    }
    private CountingHostView create()throws Exception {
        int id=host.allocateAppWidgetId();allocated.add(id);
        getUiAutomation().adoptShellPermissionIdentity("android.permission.BIND_APPWIDGET");
        boolean bound;
        try{bound=AppWidgetManager.getInstance(getTargetContext()).bindAppWidgetIdIfAllowed(id,PROVIDER);}
        finally{getUiAutomation().dropShellPermissionIdentity();}
        check("test launcher binds a real widget instance "+id,bound);
        return restore(id);
    }
    private CountingHostView restore(int id){
        AtomicReference<CountingHostView> result=new AtomicReference<>();
        onUi(()->{CountingHostView view=(CountingHostView)host.createView(activity,id,AppWidgetManager.getInstance(getTargetContext()).getAppWidgetInfo(id));view.setPadding(0,0,0,0);result.set(view);});
        return result.get();
    }
    private void attach(CountingHostView view,int width,int height){
        onUi(()->{
            FrameLayout parent=(FrameLayout)web.getParent();
            if(overlay==null){overlay=new FrameLayout(activity);overlay.setBackgroundColor(Color.parseColor("#D9E4D9"));}
            if(overlay.getParent()==null)parent.addView(overlay,new FrameLayout.LayoutParams(-1,-1));
            overlay.removeAllViews();if(view.getParent() instanceof ViewGroup)((ViewGroup)view.getParent()).removeView(view);
            overlay.addView(view,new FrameLayout.LayoutParams(dp(width),dp(height),Gravity.CENTER));
            Bundle options=new Bundle();options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,width);options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,width);
            options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,height);options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,height);
            ArrayList<SizeF> sizes=new ArrayList<>();sizes.add(new SizeF(width,height));options.putParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES,sizes);
            if(view.widthDp!=width||view.heightDp!=height){
                view.widthDp=width;view.heightDp=height;
                AppWidgetManager.getInstance(getTargetContext()).updateAppWidgetOptions(view.getAppWidgetId(),options);
            }
        });
        // A test overlay may be reattached while a resize replaces RemoteViews.
        // Wait for layout/resize delivery before injecting the next actual tap.
        waitForIdleSync();SystemClock.sleep(400);
    }
    private void detach(){onUi(()->{if(overlay!=null&&overlay.getParent() instanceof ViewGroup)((ViewGroup)overlay.getParent()).removeView(overlay);});}
    private void setMonth(int id,String month){getTargetContext().getSharedPreferences("calendar-widget",0).edit().putString("month-"+id,month).commit();refresh(id);}
    private void refresh(int id){getTargetContext().sendBroadcast(new Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).setComponent(PROVIDER).putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS,new int[]{id}));}
    private int resource(String name){return activity.getResources().getIdentifier(name,"id",PACKAGE);}
    private View view(View parent,String name){return parent.findViewById(resource(name));}
    private String text(View parent,String name){AtomicReference<String> value=new AtomicReference<>("");onUi(()->{View v=view(parent,name);if(v instanceof TextView)value.set(((TextView)v).getText().toString());});return value.get();}
    private List<View> cells(View parent){List<View> result=new ArrayList<>();onUi(()->collect(parent,resource("widget_day"),result));return result;}
    private void collect(View view,int id,List<View> result){if(view.getId()==id)result.add(view);if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++)collect(group.getChildAt(i),id,result);}}
    private View dayCell(View parent,String date){String prefix=Integer.parseInt(date.substring(5,7))+"月"+Integer.parseInt(date.substring(8))+"日";for(View cell:cells(parent))if(cell.getContentDescription()!=null&&cell.getContentDescription().toString().startsWith(prefix+"，")||cell.getContentDescription()!=null&&cell.getContentDescription().toString().equals(prefix))return cell;throw new AssertionError("Missing widget date "+date);}
    private String description(View parent,String date){AtomicReference<String> result=new AtomicReference<>("");onUi(()->result.set(String.valueOf(dayCell(parent,date).getContentDescription())));return result.get();}
    private int weekCount(View parent){AtomicReference<Integer> count=new AtomicReference<>(0);onUi(()->{View view=view(parent,"widget_weeks");if(view instanceof ViewGroup)count.set(((ViewGroup)view).getChildCount());});return count.get();}
    private void waitText(View parent,String name,String value)throws Exception{long end=SystemClock.elapsedRealtime()+10000;while(SystemClock.elapsedRealtime()<end){if(value.equals(text(parent,name))){SystemClock.sleep(200);return;}SystemClock.sleep(120);}throw new AssertionError("Widget text did not become "+value+": "+allText(parent));}
    private void waitWeekday(View parent,String value)throws Exception{waitText(view(parent,"widget_weekdays"),"widget_weekday",value);}
    private void waitDescription(View parent,String date,String value)throws Exception{long end=SystemClock.elapsedRealtime()+7000;while(SystemClock.elapsedRealtime()<end){if(description(parent,date).contains(value))return;SystemClock.sleep(100);}throw new AssertionError("Missing updated schedule "+value);}
    private void waitAbsentDescription(View parent,String date,String value)throws Exception{long end=SystemClock.elapsedRealtime()+7000;while(SystemClock.elapsedRealtime()<end){if(!description(parent,date).contains(value))return;SystemClock.sleep(100);}throw new AssertionError("Stale deleted schedule "+value);}
    private boolean fits(View parent){
        AtomicReference<Boolean> result=new AtomicReference<>(true);
        onUi(()->{
            Rect bounds=new Rect();parent.getGlobalVisibleRect(bounds);
            for(String id:new String[]{"widget_month","widget_year"}){
                View label=view(parent,id);if(label==null)continue;Rect visible=new Rect();label.getGlobalVisibleRect(visible);
                if(visible.height()<label.getHeight()-1){result.set(false);fitErrors.put("clipped widget header: "+id);}
            }
            for(View cell:cells(parent)){
                Rect r=new Rect();
                if(!cell.getGlobalVisibleRect(r)||r.left<bounds.left||r.right>bounds.right||r.bottom>bounds.bottom)result.set(false);
                for(String id:new String[]{"widget_date","widget_observance","widget_expense","widget_income","widget_event","widget_event_second"}){
                    View child=view(cell,id);if(child==null||child.getVisibility()!=View.VISIBLE)continue;
                    Rect visible=new Rect();child.getGlobalVisibleRect(visible);int[] loc=new int[2];child.getLocationOnScreen(loc);
                    boolean clipped=loc[1]+child.getHeight()>r.bottom+1||visible.height()<child.getHeight()-1;
                    boolean tooWide=false, textClipped=false;
                    if(id.startsWith("widget_event")&&child instanceof TextView){
                        TextView event=(TextView)child;android.text.Layout layout=event.getLayout();
                        textClipped=layout==null||layout.getLineBottom(layout.getLineCount()-1)>event.getHeight()-event.getCompoundPaddingTop()-event.getCompoundPaddingBottom();
                    }
                    if((id.equals("widget_expense")||id.equals("widget_income"))&&child instanceof TextView){
                        TextView amount=(TextView)child;tooWide=amount.getPaint().measureText(amount.getText().toString())>amount.getWidth()-amount.getPaddingLeft()-amount.getPaddingRight()+1;
                    }
                    if(clipped||tooWide||textClipped){result.set(false);fitErrors.put(String.valueOf(cell.getContentDescription())+" / "+id+" text="+((TextView)child).getText()+" cell="+r+" child="+child.getWidth()+"x"+child.getHeight()+" visible="+visible+" clipped="+clipped+" tooWide="+tooWide+" textClipped="+textClipped);}
                }
            }
        });return result.get();
    }
    private String allText(View parent){AtomicReference<String> result=new AtomicReference<>("");onUi(()->{StringBuilder text=new StringBuilder();collectText(parent,text);result.set(text.toString());});return result.get();}
    private void collectText(View view,StringBuilder text){if(view instanceof TextView)text.append(((TextView)view).getText()).append(' ');if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++)collectText(group.getChildAt(i),text);}}
    private void tap(View view)throws Exception{if(view==null)throw new AssertionError("Missing clickable widget control");int[] location=new int[2];onUi(()->view.getLocationOnScreen(location));float x=location[0]+view.getWidth()/2f,y=location[1]+view.getHeight()/2f;long down=SystemClock.uptimeMillis();MotionEvent press=MotionEvent.obtain(down,down,MotionEvent.ACTION_DOWN,x,y,0);press.setSource(InputDevice.SOURCE_TOUCHSCREEN);sendPointerSync(press);press.recycle();MotionEvent release=MotionEvent.obtain(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,x,y,0);release.setSource(InputDevice.SOURCE_TOUCHSCREEN);sendPointerSync(release);release.recycle();SystemClock.sleep(250);}
    private void onUi(Runnable action){if(Looper.myLooper()==Looper.getMainLooper())action.run();else runOnMainSync(action);}
    private float density(){return activity.getResources().getDisplayMetrics().density;}
    private int dp(int value){return Math.round(value*density());}
    private WebView findWeb(View view){if(view instanceof WebView)return (WebView)view;if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++){WebView found=findWeb(group.getChildAt(i));if(found!=null)return found;}}return null;}
    private String evaluate(String expression)throws Exception{CountDownLatch ready=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();onUi(()->web.evaluateJavascript(expression,result->{value.set(result);ready.countDown();}));if(!ready.await(8,TimeUnit.SECONDS))throw new AssertionError("WebView did not reply");return String.valueOf(new JSONTokener(value.get()).nextValue());}
    private boolean truth(String expression)throws Exception{return "true".equals(evaluate(expression));}
    private void waitFor(String expression,long timeout)throws Exception{long end=SystemClock.elapsedRealtime()+timeout;while(SystemClock.elapsedRealtime()<end){if(truth(expression))return;SystemClock.sleep(100);}throw new AssertionError("Condition not reached: "+expression);}
    private void sendChat(String message)throws Exception{evaluate("document.querySelector('[data-action=open-ai]').click();var input=document.querySelector('#chat-input');input.value="+JSONObject.quote(message)+";input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#chat-form').requestSubmit()");waitFor("!document.querySelector('#chat-form button[type=submit]').disabled",15000);}
    private String business()throws Exception{return evaluate("(()=>{const s=calendarLedgerPreview.getState();const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;return JSON.stringify(canonical({transactions:s.transactions.filter(t=>!t.id.startsWith('qa-widget-money-')),events:s.events.filter(e=>!e.id.startsWith('qa-widget-')),tasks:s.tasks,budgets:s.budgets,calendars:s.calendars,ledgers:s.ledgers}));})()");}
    private void screenshot(String name,View crop)throws Exception{
        if(crop==null){
            waitFor("!document.querySelector('#toast').classList.contains('show')",7000);
            CountDownLatch painted=new CountDownLatch(1);
            onUi(()->web.postVisualStateCallback(SystemClock.uptimeMillis(),new WebView.VisualStateCallback(){
                @Override public void onComplete(long requestId){web.invalidate();painted.countDown();}
            }));
            if(!painted.await(5,TimeUnit.SECONDS))throw new AssertionError("WebView did not paint "+name);
            waitForIdleSync();SystemClock.sleep(250);
        }
        Bitmap screen=getUiAutomation().takeScreenshot();if(screen==null)throw new AssertionError("No Android screenshot");
        Bitmap image=screen;
        if(crop!=null){Rect rect=new Rect();onUi(()->crop.getGlobalVisibleRect(rect));image=Bitmap.createBitmap(screen,rect.left,rect.top,rect.width(),rect.height());}
        try(FileOutputStream output=new FileOutputStream(new File(activity.getExternalFilesDir(null),"qa-"+name+"-v0.3.8.png"))){image.compress(Bitmap.CompressFormat.PNG,100,output);}
        finally{if(image!=screen)image.recycle();screen.recycle();}
    }
    private void check(String name,boolean passed)throws Exception{findings.put(new JSONObject().put("check",name).put("passed",passed));if(!passed)throw new AssertionError(name);}
    private static class CountingHostView extends AppWidgetHostView {volatile int updates;int widthDp,heightDp;CountingHostView(Context context){super(context);}@Override public void updateAppWidget(RemoteViews views){updates++;super.updateAppWidget(views);}}
}
