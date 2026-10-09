package org.calendarledger.preview;
import android.content.*;
import org.json.*;
public class BootReceiver extends BroadcastReceiver{
    @Override public void onReceive(Context context,Intent intent){if(!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction()))return;PendingResult result=goAsync();new Thread(()->{try{SharedPreferences prefs=context.getSharedPreferences("reminders",Context.MODE_PRIVATE);ReminderScheduler.sync(context,new JSONArray(prefs.getString("events","[]")),prefs.getBoolean("demo",true));}catch(Exception ignored){}finally{result.finish();}}).start();}
}
