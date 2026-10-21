package dev.loxylon.todo;

import android.content.Context;
import org.json.*;
import java.time.LocalDate;
import java.util.*;

final class Store {
    private static JSONObject load(Context c) throws JSONException {
        String raw = c.getSharedPreferences("todo", 0).getString("state", "");
        return raw.isEmpty() ? new JSONObject("{\"schema\":2,\"tasks\":[],\"pool\":[],\"tags\":[],\"projects\":[],\"xp\":0,\"theme\":\"sage\",\"intervalHours\":8,\"auto\":true,\"lastRotation\":0}") : new JSONObject(raw);
    }
    static synchronized JSONObject read(Context c) throws JSONException {
        JSONObject s=load(c);
        if(StatePolicy.upgrade(s)) write(c,s);
        return s;
    }
    static synchronized void write(Context c, JSONObject s) throws JSONException {
        s.put("revision", load(c).optLong("revision")+1);
        if (!c.getSharedPreferences("todo", 0).edit().putString("state", s.toString()).commit()) throw new IllegalStateException("Не удалось сохранить данные: проверьте свободное место");
    }
    static synchronized JSONObject reconcile(Context c) throws JSONException {
        JSONObject s = read(c);
        long now = System.currentTimeMillis();
        if(StatePolicy.moveOverdue(s,now,java.time.ZoneId.systemDefault())>0)write(c,s);
        if (!s.optBoolean("auto", true)) return s;
        long last = s.optLong("lastRotation");
        long interval = (long)(Math.max(.25, s.optDouble("intervalHours", 8)) * 3600000);
        if (last != 0 && now - last < interval) return s;
        JSONArray pool = s.getJSONArray("pool"), tasks = s.getJSONArray("tasks"), tags = s.getJSONArray("tags");
        List<PoolPicker.Candidate> candidates = new ArrayList<>();
        for (int i=0; i<pool.length(); i++) {
            JSONObject p = pool.getJSONObject(i); boolean pending = false;
            for (int j=0; j<tasks.length(); j++) {
                JSONObject t = tasks.getJSONObject(j);
                JSONObject backup=p.optJSONObject("taskBackup");
                if ((!t.optBoolean("done") && p.getString("id").equals(t.optString("source")))||(backup!=null&&t.getString("id").equals(backup.getString("id")))) { pending = true; break; }
            }
            double hours = p.optDouble("cooldownHours", 72);
            JSONArray pt = p.optJSONArray("tags");
            if (pt != null) for (int k=0; k<pt.length(); k++) for (int j=0; j<tags.length(); j++) {
                JSONObject tag=tags.getJSONObject(j);
                if (tag.getString("id").equals(pt.getString(k))) hours=Math.max(hours, tag.optDouble("hours", 0));
            }
            candidates.add(new PoolPicker.Candidate(p.optBoolean("enabled", true), pending, p.optLong("lastSelected"), (long)(hours*3600000)));
        }
        int pick = PoolPicker.choose(candidates, now, new Random());
        if (pick >= 0) {
            JSONObject p=pool.getJSONObject(pick);
            tasks.put(StatePolicy.taskFromRequest(s,p,now,java.time.ZoneId.systemDefault()));
            p.put("lastSelected", now);
        }
        // Never dump a backlog of missed ticks into today's list.
        s.put("lastRotation", now); write(c, s); return s;
    }
}
