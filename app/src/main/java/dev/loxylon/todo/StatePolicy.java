package dev.loxylon.todo;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
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
    static int moveOverdue(JSONObject s,long now,ZoneId zone) throws JSONException {
        String today=java.time.Instant.ofEpochMilli(now).atZone(zone).toLocalDate().toString();
        JSONArray tasks=s.getJSONArray("tasks"),pool=s.getJSONArray("pool"),tags=s.getJSONArray("tags"),kept=new JSONArray();
        JSONObject overdueTag=null;int moved=0;
        for(int i=0;i<tasks.length();i++) {
            JSONObject t=tasks.getJSONObject(i);
            if(t.optBoolean("done")||!isDated(t)||t.getString("date").compareTo(today)>=0){kept.put(t);continue;}
            if(overdueTag==null) {
                for(int j=0;j<tags.length();j++) {
                    JSONObject tag=tags.getJSONObject(j);
                    if("просроченные".equalsIgnoreCase(tag.getString("name").trim())){overdueTag=tag;break;}
                }
                if(overdueTag==null){overdueTag=new JSONObject().put("id",UUID.randomUUID().toString()).put("name","просроченные").put("hours",0);tags.put(overdueTag);}
            }
            JSONObject request=null;
            for(int j=0;j<pool.length();j++) {
                JSONObject p=pool.getJSONObject(j),backup=p.optJSONObject("taskBackup");
                if(p.getString("id").equals(t.optString("source"))&&(backup==null||backup.getString("id").equals(t.getString("id")))){request=p;break;}
            }
            if(request==null) {
                request=new JSONObject().put("id",UUID.randomUUID().toString()).put("tags",new JSONArray()).put("cooldownHours",0).put("enabled",true).put("lastSelected",0);pool.put(request);
            }
            JSONObject backup=new JSONObject(t.toString());backup.remove("requestBackup");
            request.put("title",t.getString("title")).put("taskBackup",backup).put("overdueDate",t.getString("date"));
            JSONArray requestTags=request.getJSONArray("tags");boolean tagged=false;
            for(int j=0;j<requestTags.length();j++)if(requestTags.getString(j).equals(overdueTag.getString("id")))tagged=true;
            if(!tagged)requestTags.put(overdueTag.getString("id"));
            moved++;
        }
        if(moved>0)s.put("tasks",kept).put("lastRotation",now);
        return moved;
    }
    static JSONObject taskFromRequest(JSONObject s,JSONObject p,long now,ZoneId zone) throws JSONException {
        JSONObject backup=p.optJSONObject("taskBackup"),t=backup==null?new JSONObject().put("id",UUID.randomUUID().toString()).put("rewarded",false):new JSONObject(backup.toString());
        t.remove("requestBackup");
        String project=t.optString("project");boolean projectExists=false;JSONArray projects=s.getJSONArray("projects");
        for(int i=0;i<projects.length();i++)if(projects.getJSONObject(i).getString("id").equals(project))projectExists=true;
        t.put("title",p.getString("title")).put("date",java.time.Instant.ofEpochMilli(now).atZone(zone).toLocalDate().toString()).put("project",projectExists?project:"").put("source",p.getString("id")).put("done",false).put("reminder",t.optLong("reminder")>now?t.optLong("reminder"):0).put("notified",false);
        if(backup!=null)t.put("scheduled",true);
        return t;
    }
    static boolean isDue(JSONObject t,LocalDate today) {
        return isDated(t)&&t.optString("date").compareTo(today.toString())<=0;
    }
    static long nextDay(long now,ZoneId zone) {
        return java.time.Instant.ofEpochMilli(now).atZone(zone).toLocalDate().plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli();
    }
}
