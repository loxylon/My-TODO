package dev.loxylon.todo;

import static org.junit.Assert.assertEquals;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.TimeZone;
import org.json.JSONObject;
import org.junit.Test;

public class EventAlarmTest {
    @Test public void deadlineNotificationUsesConfiguredLeadTime() throws Exception {
        long deadline=1765008000000L;
        JSONObject event=new JSONObject().put("deadline",deadline).put("date","").put("remindBeforeHours",48);
        assertEquals(deadline-48L*3600000,Alarms.eventReminderAt(event));
    }

    @Test public void dateOnlyNotificationUsesNineInPhoneTimezone() throws Exception {
        TimeZone previous=TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("Europe/Moscow"));
            JSONObject event=new JSONObject().put("deadline",0).put("date","2026-12-02").put("remindBeforeHours",24);
            long expected=LocalDate.parse("2026-12-02").atTime(9,0).atZone(ZoneId.of("Europe/Moscow")).toInstant().toEpochMilli()-24L*3600000;
            assertEquals(expected,Alarms.eventReminderAt(event));
        } finally { TimeZone.setDefault(previous); }
    }
}
