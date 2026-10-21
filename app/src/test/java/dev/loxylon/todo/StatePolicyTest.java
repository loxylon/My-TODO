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
}
