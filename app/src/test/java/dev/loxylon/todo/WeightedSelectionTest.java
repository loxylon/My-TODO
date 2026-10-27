package dev.loxylon.todo;

import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class WeightedSelectionTest {
    private Random draw(double value) {
        return new Random(0) { @Override public double nextDouble() { return value; } };
    }
    @Test public void sharedVectorsMatchJavascriptAtWeightAndCooldownBoundaries() throws Exception {
        try(java.io.InputStream in=getClass().getResourceAsStream("/weighted-selection.json")) {
            assertNotNull(in);JSONArray cases=new JSONArray(new String(in.readAllBytes(),StandardCharsets.UTF_8));
            for(int i=0;i<cases.length();i++) {
                JSONObject vector=cases.getJSONObject(i);JSONArray input=vector.getJSONArray("candidates");List<PoolPicker.Candidate> candidates=new ArrayList<>();
                for(int j=0;j<input.length();j++){JSONObject c=input.getJSONObject(j);candidates.add(new PoolPicker.Candidate(c.getBoolean("enabled"),c.getBoolean("pending"),c.getLong("lastSelected"),c.getLong("cooldownMillis"),c.getLong("queuedAt")));}
                assertEquals(vector.getString("name"),vector.getInt("expected"),PoolPicker.choose(candidates,vector.getLong("now"),draw(vector.getDouble("draw"))));
            }
        }
    }
    @Test public void threeToOneAgeRatioProducesThreeToOneSelectionCounts() {
        List<PoolPicker.Candidate> candidates=List.of(new PoolPicker.Candidate(true,false,0,0,1000),new PoolPicker.Candidate(true,false,0,0,3000));int[] counts=new int[2];
        for(int i=0;i<1000;i++)counts[PoolPicker.choose(candidates,4000,draw((i+.5)/1000))]++;
        assertArrayEquals(new int[]{750,250},counts);
    }
    @Test public void legacyClockInitializesOnceAndImportPreservesExistingQueueTimestamps() throws Exception {
        JSONObject s=new JSONObject("{\"schema\":3,\"pool\":[],\"tasks\":[],\"tags\":[],\"projects\":[],\"lastRotation\":0}");java.time.ZoneId zone=java.time.ZoneId.of("UTC");
        assertTrue(StatePolicy.upgrade(s,1000,zone));assertEquals(1000,s.getLong("queueClockStartedAt"));assertFalse(StatePolicy.upgrade(s,2000,zone));assertEquals(1000,s.getLong("queueClockStartedAt"));
        s.getJSONArray("pool").put(new JSONObject().put("id","p").put("cooldownHours",0).put("queuedAt",500));StatePolicy.prepareImport(s,3000,zone);assertEquals(1000,s.getLong("queueClockStartedAt"));assertEquals(500,s.getJSONArray("pool").getJSONObject(0).getLong("queuedAt"));
    }
}
