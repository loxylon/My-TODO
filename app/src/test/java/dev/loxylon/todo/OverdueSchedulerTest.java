package dev.loxylon.todo;

import android.app.AlarmManager;
import android.content.Context;
import java.time.LocalDate;
import java.time.ZoneId;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAlarmManager;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=35)
public class OverdueSchedulerTest {
    private JSONObject state(String date) throws Exception {
        return new JSONObject("{\"schema\":3,\"tasks\":[],\"pool\":[],\"tags\":[],\"projects\":[],\"auto\":false,\"lastRotation\":0,\"intervalHours\":8,\"xp\":0}")
            .put("queueClockStartedAt",System.currentTimeMillis()).put("overdueCheckDay",LocalDate.now().minusDays(1).toString()).put("tasks",new JSONArray().put(new JSONObject().put("id","a").put("title","Дело").put("date",date).put("project","").put("done",false).put("reminder",0)));
    }
    @Test public void todaysTaskSchedulesMidnightEvenWithAutoSelectionDisabled() throws Exception {
        Context c=RuntimeEnvironment.getApplication();JSONObject s=state(LocalDate.now().toString());Alarms.sync(c,s);
        ShadowAlarmManager am=Shadows.shadowOf(c.getSystemService(AlarmManager.class));
        assertEquals(1,am.getScheduledAlarms().size());
        ShadowAlarmManager.ScheduledAlarm alarm=am.getScheduledAlarms().get(0);
        assertEquals("day-rollover",Shadows.shadowOf(alarm.operation).getSavedIntent().getStringExtra("id"));
        assertEquals(StatePolicy.nextDay(System.currentTimeMillis(),ZoneId.systemDefault()),alarm.triggerAtTime);
    }
    @Test public void foregroundAndBackgroundUseTheSamePersistentMoveWithoutDuplicates() throws Exception {
        Context c=RuntimeEnvironment.getApplication();Store.write(c,state(LocalDate.now().minusDays(1).toString()));
        JSONObject first=Store.reconcile(c);assertEquals(0,first.getJSONArray("tasks").length());assertEquals(1,first.getJSONArray("pool").length());
        assertEquals("просроченные",first.getJSONArray("tags").getJSONObject(0).getString("name"));
        JSONObject next=Store.reconcile(c);assertEquals(first.toString(),next.toString());assertEquals(first.toString(),Store.read(c).toString());
    }
    @Test public void futureRepeatSchedulesMidnightAndReminderWithoutGeneratingExtraCopies() throws Exception {
        Context c=RuntimeEnvironment.getApplication();JSONObject s=state(LocalDate.now().plusDays(3).toString());
        long reminder=System.currentTimeMillis()+3*24*3600000L;
        JSONObject t=s.getJSONArray("tasks").getJSONObject(0);t.put("repeatDays",3).put("repeatParent","previous").put("repeatSeries","previous").put("repeatIndex",1).put("reminder",reminder);
        Store.write(c,s);Alarms.sync(c,s);ShadowAlarmManager am=Shadows.shadowOf(c.getSystemService(AlarmManager.class));assertEquals(2,am.getScheduledAlarms().size());
        JSONObject reconciled=Store.reconcile(c);assertEquals(1,reconciled.getJSONArray("tasks").length());assertEquals(0,reconciled.getJSONArray("pool").length());assertEquals(3,reconciled.getJSONArray("tasks").getJSONObject(0).getInt("repeatDays"));assertEquals(reminder,reconciled.getJSONArray("tasks").getJSONObject(0).getLong("reminder"));
    }

    @Test public void overdueTasksRemainExcludedAfterTheNextBackgroundSelectionTick() throws Exception {
        Context c=RuntimeEnvironment.getApplication();JSONObject s=state(LocalDate.now().minusDays(1).toString()).put("auto",true);Store.write(c,s);
        JSONObject moved=Store.reconcile(c);assertEquals(0,moved.getJSONArray("tasks").length());assertFalse(moved.getJSONArray("pool").getJSONObject(0).getBoolean("enabled"));
        moved.put("lastRotation",0);Store.write(c,moved);JSONObject next=Store.reconcile(c);
        assertEquals(0,next.getJSONArray("tasks").length());assertEquals(1,next.getJSONArray("pool").length());assertFalse(next.getJSONArray("pool").getJSONObject(0).getBoolean("enabled"));
    }

    @Test public void backgroundRotationPausesTheWholeTagAfterChoosingOneRequest() throws Exception {
        Context c=RuntimeEnvironment.getApplication();long now=System.currentTimeMillis();
        JSONObject s=new JSONObject("{\"schema\":3,\"tagCooldownVersion\":1,\"tagLastSelected\":{},\"untaggedLastSelected\":0,\"tasks\":[],\"pool\":[],\"tags\":[],\"projects\":[],\"auto\":true,\"lastRotation\":0,\"intervalHours\":8,\"xp\":0}");
        s.put("queueClockStartedAt",now).put("overdueCheckDay",LocalDate.now().toString());
        s.getJSONArray("tags").put(new JSONObject().put("id","home").put("name","дом").put("hours",24));
        for(String id:new String[]{"first","second"})s.getJSONArray("pool").put(new JSONObject().put("id",id).put("title",id).put("tags",new JSONArray().put("home")).put("cooldownHours",0).put("enabled",true).put("lastSelected",0).put("queuedAt",now-3600000));
        Store.write(c,s);JSONObject selected=Store.reconcile(c);assertEquals(1,selected.getJSONArray("tasks").length());assertTrue(selected.getJSONObject("tagLastSelected").getLong("home")>0);
        selected.put("lastRotation",0);Store.write(c,selected);JSONObject again=Store.reconcile(c);assertEquals(1,again.getJSONArray("tasks").length());
    }

}
