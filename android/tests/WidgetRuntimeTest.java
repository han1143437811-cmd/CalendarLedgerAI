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
            startApp(intent);
            if("baseline".equals(phase)) {
                preferences().edit().putString("businessBefore",business())
                        .putString("keyCipherBefore",getTargetContext().getSharedPreferences("api-config",0).getString("keyCipher",""))
                        .putString("marker","v023-to-v030").commit();
                check("old release has saved business data",truth("calendarLedgerPreview.getState().transactions.length>0&&calendarLedgerPreview.getState().events.length>0"));
            } else if("cold-ai".equals(phase)) {
                check("cold start consumes AI entry after JavaScript is ready",truth("document.body.classList.contains('ai-visible')"));
                check("AI entry does not start microphone",truth("document.querySelector('#voice-status').hidden"));
            } else if("cold-date".equals(phase)) {
                waitFor("calendarLedgerPreview.getState().selectedDate==='2026-10-10'&&document.querySelector('.main').scrollTop>20",5000);
                check("cold start opens requested daily details",truth("calendarLedgerPreview.getState().page==='calendar'&&!document.body.classList.contains('ai-visible')"));
            } else if("data-projection".equals(phase)) {
                projectionAcceptance(report);
            } else if("reopened".equals(phase)||"system-font".equals(phase)) {
                check("saved fixture survives process restart",truth("calendarLedgerPreview.getState().events.some(e=>e.id==='qa-widget-discussion')"));
                int id=preferences().getInt("keptId",-1);
                check("system retains widget binding across app restart",AppWidgetManager.getInstance(getTargetContext()).getAppWidgetInfo(id)!=null);
                startHost();widget=restore(id);attach(widget,350,540);refresh(id);waitText(widget,"widget_month","11月");
                check("independent widget month survives restart",weekCount(widget)==6);
                if("system-font".equals(phase)){
                    settings("light","large",1);attach(widget,250,400);waitText(widget,"widget_month","11月");
                    SystemClock.sleep(500);check("six-week widget fits at system font scale 1.3",fits(widget));
                    report.put("fontScale",getTargetContext().getResources().getConfiguration().fontScale);
                    screenshot("widget-system-font",widget);
                } else screenshot("widget-reopened",widget);
                keepBindings=true;
            } else {
                acceptance(report);
            }
            report.put("passed",true).put("findings",findings);
        } catch(Throwable error) {
            resultCode=1;
            try {report.put("passed",false).put("error",error.toString()).put("findings",findings);
                if(widget!=null)report.put("widgetText",allText(widget));
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
    private void acceptance(JSONObject report)throws Exception {
        check("same-signature upgrade retains every saved record",business().equals(preferences().getString("businessBefore","")));
        check("same-signature upgrade retains encrypted API configuration",getTargetContext().getSharedPreferences("api-config",0).getString("keyCipher","").equals(preferences().getString("keyCipherBefore","!")));
        check("upgrade retains private preference marker","v023-to-v030".equals(preferences().getString("marker","")));
        fixture();restartApp();
        startHost();widget=create();second=create();attach(widget,370,540);
        setMonth(widget.getAppWidgetId(),"2026-10");setMonth(second.getAppWidgetId(),"2026-10");
        waitText(widget,"widget_month","10月");waitText(second,"widget_month","10月");
        check("provider is discoverable by Android's widget framework",widget.getAppWidgetInfo().provider.equals(PROVIDER));
        check("native RemoteViews inflate into five calendar rows",weekCount(widget)==5&&cells(widget).size()==35);
        check("calendar annotates official holiday and adjusted workday",description(widget,"2026-10-01").contains("国庆节")&&description(widget,"2026-10-01").contains("放假")&&description(widget,"2026-10-10").contains("调休上班"));
        check("saved schedule appears on the native calendar",description(widget,"2026-10-09").contains("项目讨论"));
        check("repeated schedule respects excluded occurrence",!description(widget,"2026-10-10").contains("周末运动")&&description(widget,"2026-10-17").contains("周末运动"));
        check("native month uses actual app calendar colors and only calendar controls",view(widget,"widget_ai")!=null&&!allText(widget).contains("预算"));
        check("large month has no overflowing date or schedule views",fits(widget));
        report.put("largeSizeDp",new JSONArray().put(370).put(540));
        screenshot("widget-large",widget);
        tap(view(widget,"widget_next"));waitText(widget,"widget_month","11月");
        check("month arrow changes only the tapped widget",text(second,"widget_month").equals("10月"));
        check("six-week month retains all 42 clickable dates",weekCount(widget)==6&&cells(widget).size()==42);
        check("six-week large calendar fits its allocated rectangle",fits(widget));
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
        SystemClock.sleep(600);int updates=widget.updates;
        sendChat("分析本月收支，与上月同期对比");SystemClock.sleep(600);
        check("chat-only updates do not redraw an unchanged calendar",widget.updates==updates);
        attach(widget,250,400);SystemClock.sleep(500);
        check("resizing to a compact widget retains all dates",cells(widget).size()==35&&fits(widget));
        screenshot("widget-compact",widget);
        detach();settings("dark","large",0);attach(widget,370,540);waitWeekday(widget,"日");
        check("widget follows Sunday-first and large-text app settings",text(view(widget,"widget_weekdays"),"widget_weekday").equals("日")&&((TextView)view(widget,"widget_date")).getTextSize()/density()>=17.9f);
        check("widget follows the application's dark theme",((GradientDrawable)view(widget,"widget_root").getBackground()).getColor().getDefaultColor()==Color.parseColor("#20332A"));
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
        events.put(event("discussion","项目讨论","2026-10-09","14:00","work","none","",new JSONArray()));
        events.put(event("reading","阅读半小时","2026-10-05","09:00","personal","none","",new JSONArray()));
        events.put(event("fitness","周末运动","2026-10-03","17:00","personal","weekly","2026-11-30",new JSONArray().put("2026-10-10")));
        events.put(event("salary","月末整理","2026-01-31","10:00","work","monthly","",new JSONArray()));
        state.put("events",events).put("page","calendar").put("viewMonth","2026-10").put("selectedDate","2026-10-10").put("calendarView","month");
        state.getJSONObject("settings").put("theme","light").put("fontSize","normal").put("weekStart",1);
        snapshot.getJSONObject("aiConfig").put("mode","demo");
        check("fixtures use the real atomic snapshot bridge",truth("CalendarAndroid.saveSnapshot("+JSONObject.quote(snapshot.toString())+")"));
    }
    private JSONObject event(String id,String title,String date,String time,String calendar,String repeat,String until,JSONArray exceptions)throws Exception{
        return new JSONObject().put("id","qa-widget-"+id).put("title",title).put("date",date).put("time",time)
                .put("duration",60).put("reminder",0).put("calendar",calendar).put("repeat",repeat).put("until",until).put("exceptions",exceptions).put("notes","");
    }
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
    private boolean fits(View parent){AtomicReference<Boolean> result=new AtomicReference<>(true);onUi(()->{Rect bounds=new Rect();parent.getGlobalVisibleRect(bounds);for(View cell:cells(parent)){Rect r=new Rect();if(!cell.getGlobalVisibleRect(r)||r.left<bounds.left||r.right>bounds.right||r.bottom>bounds.bottom)result.set(false);for(String id:new String[]{"widget_date","widget_observance","widget_event","widget_event_second"}){View text=view(cell,id);if(text!=null&&text.getVisibility()==View.VISIBLE){Rect visible=new Rect();text.getGlobalVisibleRect(visible);int[] loc=new int[2];text.getLocationOnScreen(loc);if(loc[1]+text.getHeight()>r.bottom+1||visible.height()<text.getHeight()-1)result.set(false);}}}});return result.get();}
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
    private String business()throws Exception{return evaluate("(()=>{const s=calendarLedgerPreview.getState();const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;return JSON.stringify(canonical({transactions:s.transactions,events:s.events.filter(e=>!e.id.startsWith('qa-widget-')),tasks:s.tasks,budgets:s.budgets,calendars:s.calendars,ledgers:s.ledgers}));})()");}
    private void screenshot(String name,View crop)throws Exception{Bitmap screen=getUiAutomation().takeScreenshot();if(screen==null)throw new AssertionError("No Android screenshot");Bitmap image=screen;if(crop!=null){Rect rect=new Rect();onUi(()->crop.getGlobalVisibleRect(rect));image=Bitmap.createBitmap(screen,rect.left,rect.top,rect.width(),rect.height());}try(FileOutputStream output=new FileOutputStream(new File(activity.getExternalFilesDir(null),"qa-"+name+"-v0.3.0.png"))){image.compress(Bitmap.CompressFormat.PNG,100,output);}finally{if(image!=screen)image.recycle();screen.recycle();}}
    private void check(String name,boolean passed)throws Exception{findings.put(new JSONObject().put("check",name).put("passed",passed));if(!passed)throw new AssertionError(name);}
    private static class CountingHostView extends AppWidgetHostView {volatile int updates;int widthDp,heightDp;CountingHostView(Context context){super(context);}@Override public void updateAppWidget(RemoteViews views){updates++;super.updateAppWidget(views);}}
}
