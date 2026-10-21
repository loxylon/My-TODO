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
        return new JSONObject("{\"schema\":2,\"tasks\":[],\"pool\":[],\"tags\":[],\"projects\":[],\"auto\":false,\"lastRotation\":0,\"intervalHours\":8,\"xp\":0}")
            .put("tasks",new JSONArray().put(new JSONObject().put("id","a").put("title","Дело").put("date",date).put("project","").put("done",false).put("reminder",0)));
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
}
