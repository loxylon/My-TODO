package dev.loxylon.todo;

import android.content.Context;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import java.nio.charset.StandardCharsets;
import java.time.*;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=35)
public class BackupCompatibilityTest {
    private String fixture(String version) throws Exception {
        try(java.io.InputStream in=getClass().getResourceAsStream("/backups/v"+version+".json")){
            assertNotNull(in);return new String(in.readAllBytes(),StandardCharsets.UTF_8);
        }
    }
    private void sameRecords(JSONObject expected,JSONObject actual) throws Exception {
        for(String key:new String[]{"tasks","pool","tags","projects"})assertEquals(key,expected.getJSONArray(key).toString(),actual.getJSONArray(key).toString());
        assertEquals(expected.getInt("xp"),actual.getInt("xp"));assertEquals(expected.getString("theme"),actual.getString("theme"));
    }
    @Test public void upgradingEveryReleasedFormatKeepsAllRecordsInPlaceAndPreservesOriginalRawBackup() throws Exception {
        Context c=RuntimeEnvironment.getApplication();
        for(String version:new String[]{"1.0.0","1.1.0","1.2.0"}){
            String raw=fixture(version);c.getSharedPreferences("todo",0).edit().clear().putString("state",raw).commit();
            JSONObject expected=new JSONObject(raw);StatePolicy.normalizeCooldowns(expected);
            JSONObject migrated=Store.reconcile(c);assertEquals(3,migrated.getInt("schema"));sameRecords(expected,migrated);
            assertEquals(raw,c.getSharedPreferences("todo",0).getString("beforeMigration",""));sameRecords(expected,Store.reconcile(c));
            assertEquals(raw,c.getSharedPreferences("todo",0).getString("beforeMigration",""));
        }
    }
    @Test public void restoringAnyReleasedJsonSavesThePreviousDataAndDoesNotImmediatelyMoveImportedTasks() throws Exception {
        Context c=RuntimeEnvironment.getApplication();
        for(String version:new String[]{"1.0.0","1.1.0","1.2.0","1.3.0","1.4.0"}){
            String previous=fixture("1.2.0");c.getSharedPreferences("todo",0).edit().clear().putString("state",previous).commit();
            JSONObject imported=new JSONObject(fixture(version));StatePolicy.prepareImport(imported,System.currentTimeMillis(),ZoneId.systemDefault());
            JSONObject expected=new JSONObject(imported.toString());Store.write(c,imported,"beforeImport");
            assertEquals(previous,c.getSharedPreferences("todo",0).getString("beforeImport",""));sameRecords(expected,Store.reconcile(c));
        }
    }
    @Test public void invalidFutureSchemaLeavesTheStoredJsonUntouched() throws Exception {
        Context c=RuntimeEnvironment.getApplication();String raw="{\"schema\":99,\"tasks\":[],\"pool\":[],\"tags\":[],\"projects\":[]}";
        c.getSharedPreferences("todo",0).edit().clear().putString("state",raw).commit();
        try{Store.read(c);fail("Future schemas must not be rewritten");}catch(JSONException expected){}
        assertEquals(raw,c.getSharedPreferences("todo",0).getString("state",""));
    }
    @Test public void tagOnlyCooldownAndUpgradeGraceAreIdenticalToForegroundRules() throws Exception {
        JSONObject s=new JSONObject(fixture("1.0.0")),p=s.getJSONArray("pool").getJSONObject(2);assertEquals(0,StatePolicy.cooldownHours(s,p),0);
        p.put("tags",new JSONArray().put("health").put("home"));assertEquals(72,StatePolicy.cooldownHours(s,p),0);
        long now=Instant.parse("2026-10-21T12:00:00Z").toEpochMilli();ZoneId zone=ZoneId.of("UTC");StatePolicy.upgrade(s,now,zone);
        assertEquals(0,StatePolicy.moveOverdue(s,now,zone));assertTrue(StatePolicy.moveOverdue(s,now+24*3600000L,zone)>0);
    }
    @Test public void installedVersion14RetainsEveryRecordAndRepeatLinkWithoutRewritingTheDatabase() throws Exception {
        Context c=RuntimeEnvironment.getApplication();String raw=fixture("1.4.0");c.getSharedPreferences("todo",0).edit().clear().putString("state",raw).commit();
        JSONObject expected=new JSONObject(raw);sameRecords(expected,Store.read(c));assertEquals(raw,c.getSharedPreferences("todo",0).getString("state",""));
        assertFalse(c.getSharedPreferences("todo",0).contains("beforeMigration"));
    }

}
