package dev.loxylon.todo;
import android.content.*;
public class AlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        synchronized(Store.class) {
            try { Store.reconcile(c); Alarms.channels(c); Alarms.notifyDue(c); Alarms.sync(c,Store.read(c)); }
            catch(Exception e) { android.util.Log.e("MyTODO","Alarm processing failed",e); }
        }
    }
}
