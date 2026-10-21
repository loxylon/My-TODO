package dev.loxylon.todo;

import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;
import java.time.*;
import java.nio.charset.StandardCharsets;

public class StatePolicyTest {
    private JSONObject legacy() throws Exception {
        try(java.io.InputStream in=getClass().getResourceAsStream("/v1-state.json")) {
            assertNotNull(in);
            return new JSONObject(new String(in.readAllBytes(),StandardCharsets.UTF_8));
        }
    }
    @Test public void migratesOldRequestsWithoutLosingProjectsTagsTasksOrXp() throws Exception {
        JSONObject s=legacy();
        assertTrue(StatePolicy.upgrade(s));
        assertEquals(2,s.getInt("schema"));
        assertEquals(210,s.getInt("xp")); assertEquals("paper",s.getString("theme"));
        assertEquals(3,s.getJSONArray("tasks").length()); assertEquals(1,s.getJSONArray("projects").length());
        assertEquals("home",s.getJSONArray("tags").getJSONObject(0).getString("id"));
        assertEquals(1,s.getJSONArray("pool").length());
        assertEquals("pending-request",s.getJSONArray("pool").getJSONObject(0).getString("id"));
        JSONObject backup=s.getJSONArray("tasks").getJSONObject(0).getJSONObject("requestBackup");
        assertEquals("done-request",backup.getString("id")); assertEquals("home",backup.getJSONArray("tags").getString(0));
        assertFalse(StatePolicy.upgrade(s));
    }
    @Test public void legacyProjectTasksRemainUndated() throws Exception {
        JSONObject s=legacy();StatePolicy.upgrade(s);
        assertFalse(StatePolicy.isDated(s.getJSONArray("tasks").getJSONObject(2)));
        assertTrue(StatePolicy.isDated(s.getJSONArray("tasks").getJSONObject(1)));
    }
    @Test public void everyScheduledProjectTaskBecomesDueOnItsDate() throws Exception {
        JSONObject t=new JSONObject("{\"date\":\"2026-10-25\",\"project\":\"work\",\"scheduled\":true}");
        assertFalse(StatePolicy.isDue(t,LocalDate.parse("2026-10-24")));
        assertTrue(StatePolicy.isDue(t,LocalDate.parse("2026-10-25")));
        assertTrue(StatePolicy.isDue(t,LocalDate.parse("2026-10-26")));
        t.put("scheduled",false);
        assertFalse(StatePolicy.isDue(t,LocalDate.parse("2026-10-26")));
    }
    @Test public void rolloverUsesLocalMidnightIncludingDstChanges() {
        ZoneId zone=ZoneId.of("Europe/Berlin");
        long spring=LocalDate.parse("2026-03-29").atStartOfDay(zone).toInstant().toEpochMilli();
        long autumn=LocalDate.parse("2026-10-25").atStartOfDay(zone).toInstant().toEpochMilli();
        assertEquals(23*3600000L,StatePolicy.nextDay(spring,zone)-spring);
        assertEquals(25*3600000L,StatePolicy.nextDay(autumn,zone)-autumn);
    }
    private JSONObject overdueState() throws Exception {
        try(java.io.InputStream in=getClass().getResourceAsStream("/overdue-state.json")) {
            assertNotNull(in);return new JSONObject(new String(in.readAllBytes(),StandardCharsets.UTF_8));
        }
    }
    @Test public void overdueMoveIsIdempotentPreservesMetadataAndIgnoresUndatedFutureAndCompletedTasks() throws Exception {
        JSONObject s=overdueState();long now=Instant.parse("2026-10-22T12:00:00Z").toEpochMilli();
        assertEquals(3,StatePolicy.moveOverdue(s,now,ZoneId.of("UTC")));
        assertEquals(4,s.getJSONArray("tasks").length());assertEquals(3,s.getJSONArray("pool").length());assertEquals(40,s.getInt("xp"));
        JSONArray tags=s.getJSONArray("tags");assertEquals(2,tags.length());assertEquals("просроченные",tags.getJSONObject(1).getString("name"));assertEquals(0,tags.getJSONObject(1).getInt("hours"));
        JSONObject existing=s.getJSONArray("pool").getJSONObject(0);assertFalse(existing.getBoolean("enabled"));assertEquals(24,existing.getInt("cooldownHours"));assertEquals(2,existing.getJSONArray("tags").length());
        assertEquals(0,StatePolicy.moveOverdue(s,now,ZoneId.of("UTC")));assertEquals(3,s.getJSONArray("pool").length());
    }
    @Test public void nativeSelectionRestoresProjectAndIdentityWithoutRevivingExpiredReminders() throws Exception {
        JSONObject s=overdueState();long now=Instant.parse("2026-10-22T12:00:00Z").toEpochMilli();ZoneId zone=ZoneId.of("UTC");StatePolicy.moveOverdue(s,now,zone);
        JSONObject request=s.getJSONArray("pool").getJSONObject(2),t=StatePolicy.taskFromRequest(s,request,now,zone);
        assertEquals("old-project",t.getString("id"));assertEquals("repair",t.getString("project"));assertEquals("2026-10-22",t.getString("date"));assertEquals(0,t.getLong("reminder"));assertTrue(t.getBoolean("rewarded"));assertTrue(t.getBoolean("scheduled"));
        s.put("projects",new JSONArray());assertEquals("",StatePolicy.taskFromRequest(s,request,now,zone).getString("project"));
    }
    @Test public void overdueBoundaryFollowsPhoneTimezone() throws Exception {
        JSONObject s=overdueState();long before=Instant.parse("2026-10-21T20:59:59Z").toEpochMilli();ZoneId moscow=ZoneId.of("Europe/Moscow");
        assertEquals(0,StatePolicy.moveOverdue(s,before,moscow));assertEquals(3,StatePolicy.moveOverdue(s,before+1000,moscow));
    }
}
