package org.calendarledger.preview;
import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.Build;
public class ReminderReceiver extends BroadcastReceiver{
    @Override public void onReceive(Context context,Intent intent){if(Build.VERSION.SDK_INT>=33&&context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);manager.createNotificationChannel(new NotificationChannel("calendar-events","日程提醒",NotificationManager.IMPORTANCE_HIGH));PendingIntent open=PendingIntent.getActivity(context,0,new Intent(context,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);Notification notification=new Notification.Builder(context,"calendar-events").setSmallIcon(R.drawable.notification_icon).setContentTitle(intent.getStringExtra("title")).setContentText(intent.getStringExtra("date")+" "+intent.getStringExtra("time")+" · 日程即将开始").setContentIntent(open).setAutoCancel(true).build();manager.notify(intent.getIntExtra("notificationId",0),notification);}
}
