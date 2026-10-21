package dev.loxylon.todo;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.Build;
import org.json.*;
import java.util.*;

final class Alarms {
    static final String CHANNEL = "todo-reminders";
    static void channels(Context c) {
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Напоминания о делах", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Уведомления в указанное для задачи время");
        c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
    }
    private static PendingIntent intent(Context c, String id) {
        return PendingIntent.getBroadcast(c, 0, new Intent(c, AlarmReceiver.class).setData(Uri.parse("mytodo://alarm/"+id)).putExtra("id", id), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private static void at(Context c, String id, long time) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, time, intent(c,id));
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, time, intent(c,id));
    }
    static synchronized void sync(Context c, JSONObject s) throws JSONException {
        channels(c);
        AlarmManager am=c.getSystemService(AlarmManager.class);
        android.content.SharedPreferences prefs=c.getSharedPreferences("alarms",0);
        for(String id:prefs.getStringSet("ids",Collections.emptySet())) am.cancel(intent(c,id));
        Set<String> ids=new HashSet<>(),activeTaskIds=new HashSet<>(); long now=System.currentTimeMillis();
        JSONArray tasks=s.getJSONArray("tasks");
        for(int i=0;i<tasks.length();i++) {
            JSONObject t=tasks.getJSONObject(i); long when=t.optLong("reminder");
            activeTaskIds.add(t.getString("id"));
            if(t.optBoolean("done")) c.getSystemService(NotificationManager.class).cancel(t.getString("id"),1);
            if(!t.optBoolean("done") && when>now && !t.optBoolean("notified")) {
                String id=t.getString("id"); at(c,id,when); ids.add(id);
            }
        }
        NotificationManager notifications=c.getSystemService(NotificationManager.class);
        for(android.service.notification.StatusBarNotification n:notifications.getActiveNotifications()) {
            if(n.getTag()!=null&&!activeTaskIds.contains(n.getTag()))notifications.cancel(n.getTag(),n.getId());
        }
        if(s.optBoolean("auto",true) && s.getJSONArray("pool").length()>0) {
            at(c,"rotation", Math.max(now+1000,s.optLong("lastRotation")+(long)(Math.max(.25,s.optDouble("intervalHours",8))*3600000))); ids.add("rotation");
        }
        // Midnight also moves today's unfinished tasks to the request queue.
        for(int i=0;i<tasks.length();i++) {
            JSONObject t=tasks.getJSONObject(i);
            if(!t.optBoolean("done")&&StatePolicy.isDated(t)) {
                at(c,"day-rollover",StatePolicy.nextDay(now,java.time.ZoneId.systemDefault())); ids.add("day-rollover"); break;
            }
        }
        prefs.edit().putStringSet("ids",ids).apply();
    }
    static void notifyDue(Context c) throws JSONException {
        JSONObject s=Store.read(c); JSONArray tasks=s.getJSONArray("tasks"); boolean changed=false;
        for(int i=0;i<tasks.length();i++) {
            JSONObject t=tasks.getJSONObject(i); long time=t.optLong("reminder");
            if(!t.optBoolean("done") && !t.optBoolean("notified") && time>0 && time<=System.currentTimeMillis()) {
                // Deliver reminders delayed by reboot/Doze as well.
                if(Build.VERSION.SDK_INT>=33 && c.checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=android.content.pm.PackageManager.PERMISSION_GRANTED) continue;
                PendingIntent open=PendingIntent.getActivity(c,0,new Intent(c,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
                Notification n=new Notification.Builder(c,CHANNEL).setSmallIcon(dev.loxylon.todo.R.drawable.ic_notification).setContentTitle("Время для дела").setContentText(t.getString("title")).setStyle(new Notification.BigTextStyle().bigText(t.getString("title"))).setContentIntent(open).setAutoCancel(true).build();
                c.getSystemService(NotificationManager.class).notify(t.getString("id"),1,n);
                t.put("notified",true); changed=true;
            }
        }
        if(changed) Store.write(c,s);
    }
}
