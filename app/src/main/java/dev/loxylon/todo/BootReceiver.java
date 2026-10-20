package dev.loxylon.todo;
import android.content.*;
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        String action=i.getAction();
        if(Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action) || Intent.ACTION_TIME_CHANGED.equals(action) || Intent.ACTION_TIMEZONE_CHANGED.equals(action) || "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED".equals(action)) new AlarmReceiver().onReceive(c,i);
    }
}
