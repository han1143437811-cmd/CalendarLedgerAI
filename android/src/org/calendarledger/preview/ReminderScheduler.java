package org.calendarledger.preview;
import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.Build;
import org.json.*;
import java.text.SimpleDateFormat;
import java.util.*;
import java.time.LocalDate;

public final class ReminderScheduler{
    public static JSONObject sync(Context context,JSONArray events,boolean demo)throws Exception{
        SharedPreferences preferences=context.getSharedPreferences("reminders",Context.MODE_PRIVATE);AlarmManager alarms=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        String old=preferences.getString("scheduled","");for(String value:old.split(",")){if(value.isEmpty())continue;int id=Integer.parseInt(value);PendingIntent intent=PendingIntent.getBroadcast(context,id,new Intent(context,ReminderReceiver.class),PendingIntent.FLAG_NO_CREATE|PendingIntent.FLAG_IMMUTABLE);if(intent!=null){alarms.cancel(intent);intent.cancel();}}
        if(events==null)events=new JSONArray(preferences.getString("events","[]"));boolean allowed=Build.VERSION.SDK_INT<33||context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED;
        JSONObject status=new JSONObject().put("platform","android").put("notifications",allowed).put("demo",demo);if(demo||!allowed){preferences.edit().putString("scheduled","").apply();return status.put("scheduled",0).put("message",demo?"示例数据不触发系统提醒":"请在设置中启用手机通知");}
        boolean exact=Build.VERSION.SDK_INT<31||alarms.canScheduleExactAlarms();long now=System.currentTimeMillis(),limit=now+90L*86400000L;SimpleDateFormat dateFormat=new SimpleDateFormat("yyyy-MM-dd",Locale.ROOT),fullFormat=new SimpleDateFormat("yyyy-MM-dd HH:mm",Locale.ROOT);dateFormat.setLenient(false);fullFormat.setLenient(false);int count=0;StringBuilder ids=new StringBuilder();
        for(int i=0;i<events.length()&&count<200;i++){JSONObject event=events.getJSONObject(i);String base=event.getString("date"),repeat=event.optString("repeat","none"),until=event.optString("until","");JSONArray exceptions=event.optJSONArray("exceptions");
            for(LocalDate occurrence:ReminderDates.between(LocalDate.parse(base),repeat,until,LocalDate.now(),LocalDate.now().plusDays(90))){if(count>=200)break;String day=occurrence.toString();long start=fullFormat.parse(day+" "+event.getString("time")).getTime();if(start>limit)break;boolean excluded=false;if(exceptions!=null)for(int k=0;k<exceptions.length();k++)if(day.equals(exceptions.getString(k)))excluded=true;
                if(!excluded){long trigger=start-event.optInt("reminder",30)*60000L;if(trigger>now){String stable=event.getString("id")+":"+day;int id=stable.hashCode()&0x7fffffff;Intent notification=new Intent(context,ReminderReceiver.class).putExtra("title",event.getString("title")).putExtra("date",day).putExtra("time",event.getString("time")).putExtra("notificationId",id);PendingIntent intent=PendingIntent.getBroadcast(context,id,notification,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);if(exact)alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,trigger,intent);else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,trigger,intent);ids.append(id).append(',');count++;}}
            }
        }
        preferences.edit().putString("scheduled",ids.toString()).apply();return status.put("scheduled",count).put("exact",exact).put("message",exact?"系统提醒已安排":"已安排提醒；精确时间权限可在设置中开启");
    }
}
