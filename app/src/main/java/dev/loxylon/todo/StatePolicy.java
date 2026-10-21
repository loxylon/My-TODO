package dev.loxylon.todo;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.Set;
import org.json.*;

/** Schema migration and date rules used by foreground and background Android work. */
final class StatePolicy {
    static boolean upgrade(JSONObject s) throws JSONException {
        if(s.optInt("schema",1)!=1) return false;
        JSONArray tasks=s.getJSONArray("tasks"),pool=s.getJSONArray("pool"),kept=new JSONArray();
        Set<String> pending=new HashSet<>();
        for(int i=0;i<tasks.length();i++) {
            JSONObject t=tasks.getJSONObject(i);
            if(!t.optBoolean("done")) pending.add(t.optString("source"));
        }
        for(int i=0;i<pool.length();i++) {
            JSONObject p=pool.getJSONObject(i),completed=null;
            for(int j=0;j<tasks.length();j++) {
                JSONObject t=tasks.getJSONObject(j);
                if(t.optBoolean("done")&&p.getString("id").equals(t.optString("source"))) completed=t;
            }
            if(completed!=null&&!pending.contains(p.getString("id"))) completed.put("requestBackup",new JSONObject(p.toString()));
            else kept.put(p);
        }
        s.put("pool",kept).put("schema",2);
        return true;
    }
    static boolean isDated(JSONObject t) { return t.optString("project").isEmpty()||t.optBoolean("scheduled"); }
    static boolean isDue(JSONObject t,LocalDate today) {
        return isDated(t)&&t.optString("date").compareTo(today.toString())<=0;
    }
    static long nextDay(long now,ZoneId zone) {
        return java.time.Instant.ofEpochMilli(now).atZone(zone).toLocalDate().plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli();
    }
}
