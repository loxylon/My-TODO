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
        return upgrade(s,System.currentTimeMillis(),ZoneId.systemDefault());
    }
    static boolean upgrade(JSONObject s,long now,ZoneId zone) throws JSONException {
        int schema=s.getInt("schema");if(schema<1||schema>3)throw new JSONException("Неподдерживаемая версия данных");
        boolean legacy=schema<3||!s.has("queueClockStartedAt"),cooldownMigration=s.optInt("tagCooldownVersion")!=1,featureMigration=!s.has("events")||!s.has("graphs");
        if(!legacy&&!cooldownMigration&&!featureMigration)return false;
        if(legacy){
            s.put("schema",3).put("overdueCheckDay",java.time.Instant.ofEpochMilli(now).atZone(zone).toLocalDate().toString()).put("lastRotation",now);
            if(!s.has("queueClockStartedAt"))s.put("queueClockStartedAt",now);
        }
        normalizeCooldowns(s);
        if(!s.has("events"))s.put("events",new JSONArray());
        if(!s.has("graphs"))s.put("graphs",new JSONArray());
        if(cooldownMigration){
            JSONObject clock=new JSONObject();long untagged=0;
            JSONArray tags=s.getJSONArray("tags"),pool=s.getJSONArray("pool"),tasks=s.getJSONArray("tasks");
            java.util.ArrayList<JSONObject> requests=new java.util.ArrayList<>();
            for(int i=0;i<pool.length();i++)requests.add(pool.getJSONObject(i));
            for(int i=0;i<tasks.length();i++){JSONObject p=tasks.getJSONObject(i).optJSONObject("requestBackup");if(p!=null)requests.add(p);}
            for(JSONObject p:requests){
                JSONArray assigned=p.getJSONArray("tags");boolean hasTag=false;long selected=p.optLong("lastSelected");
                for(int i=0;i<assigned.length();i++)for(int j=0;j<tags.length();j++){
                    String id=assigned.getString(i);
                    if(id.equals(tags.getJSONObject(j).getString("id"))){clock.put(id,Math.max(clock.optLong(id),selected));hasTag=true;break;}
                }
                if(!hasTag)untagged=Math.max(untagged,selected);
            }
            s.put("tagLastSelected",clock).put("untaggedLastSelected",untagged).put("tagCooldownVersion",1);
        }
        return true;
    }
    static void normalizeCooldowns(JSONObject s) throws JSONException {
        java.util.ArrayDeque<JSONObject> pending=new java.util.ArrayDeque<>();
        JSONArray pool=s.getJSONArray("pool"),tasks=s.getJSONArray("tasks");
        for(int i=0;i<pool.length();i++)pending.add(pool.getJSONObject(i));
        for(int i=0;i<tasks.length();i++){JSONObject p=tasks.getJSONObject(i).optJSONObject("requestBackup");if(p!=null)pending.add(p);}
        while(!pending.isEmpty()){
            JSONObject p=pending.remove();p.put("cooldownHours",0);
            JSONObject t=p.optJSONObject("taskBackup"),nested=t==null?null:t.optJSONObject("requestBackup");if(nested!=null)pending.add(nested);
        }
    }
    static void prepareImport(JSONObject s,long now,ZoneId zone) throws JSONException {
        upgrade(s,now,zone);normalizeCooldowns(s);
        s.put("overdueCheckDay",java.time.Instant.ofEpochMilli(now).atZone(zone).toLocalDate().toString()).put("lastRotation",now);
    }
    static double cooldownHours(JSONObject s,JSONObject p) throws JSONException {
        double hours=0;boolean found=false;JSONArray tags=s.getJSONArray("tags"),assigned=p.getJSONArray("tags");
        for(int i=0;i<assigned.length();i++)for(int j=0;j<tags.length();j++){
            JSONObject tag=tags.getJSONObject(j);if(tag.getString("id").equals(assigned.getString(i))){hours=Math.max(hours,tag.getDouble("hours"));found=true;}
        }
        return found?hours:48;
    }
    static long cooldownUntil(JSONObject s,JSONObject p) throws JSONException {
        JSONArray tags=s.getJSONArray("tags"),assigned=p.getJSONArray("tags");
        JSONObject clock=s.optJSONObject("tagLastSelected");boolean found=false;long until=0;
        for(int i=0;i<assigned.length();i++)for(int j=0;j<tags.length();j++){
            JSONObject tag=tags.getJSONObject(j);String id=assigned.getString(i);
            if(!id.equals(tag.getString("id")))continue;
            found=true;long selected=clock==null?0:clock.optLong(id);double hours=tag.getDouble("hours");
            if(selected>0&&hours>0)until=Math.max(until,selected+(long)(hours*3600000));
        }
        return found?until:(s.optLong("untaggedLastSelected")>0?s.optLong("untaggedLastSelected")+48*3600000L:0);
    }
    static void markSelected(JSONObject s,JSONObject p,long now) throws JSONException {
        p.put("lastSelected",now);
        JSONArray tags=s.getJSONArray("tags"),assigned=p.getJSONArray("tags");JSONObject clock=s.optJSONObject("tagLastSelected");
        if(clock==null){clock=new JSONObject();s.put("tagLastSelected",clock);}boolean found=false;
        for(int i=0;i<assigned.length();i++)for(int j=0;j<tags.length();j++){
            String id=assigned.getString(i);
            if(id.equals(tags.getJSONObject(j).getString("id"))){clock.put(id,now);found=true;break;}
        }
        if(!found)s.put("untaggedLastSelected",now);
    }
    static boolean isDated(JSONObject t) { return t.optString("project").isEmpty()||t.optBoolean("scheduled"); }
    static int moveOverdue(JSONObject s,long now,ZoneId zone) throws JSONException {
        String today=java.time.Instant.ofEpochMilli(now).atZone(zone).toLocalDate().toString();
        if(today.equals(s.optString("overdueCheckDay")))return 0;
        s.put("overdueCheckDay",today);
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
                JSONObject original=t.optJSONObject("requestBackup");
                request=original==null?new JSONObject().put("id",UUID.randomUUID().toString()).put("tags",new JSONArray()).put("cooldownHours",0).put("enabled",true).put("lastSelected",0):new JSONObject(original.toString());pool.put(request);
            }
            JSONObject backup=new JSONObject(t.toString());backup.remove("requestBackup");
            backup.remove("manualRequest");
            JSONObject original=t.optJSONObject("requestBackup");
            String overdueDate=t.optString("overdueDate",request.optString("overdueDate",original==null?t.getString("date"):original.optString("overdueDate",t.getString("date"))));
            backup.put("overdueDate",overdueDate);
            boolean origin;
            if(t.has("requestOrigin"))origin=t.optBoolean("requestOrigin");
            else if(original!=null)origin=original.has("requestOrigin")?original.optBoolean("requestOrigin"):original.optJSONObject("taskBackup")==null||!original.optJSONObject("taskBackup").optString("source").isEmpty();
            else if(request.has("requestOrigin"))origin=request.optBoolean("requestOrigin");
            else origin=!t.optString("source").isEmpty()&&(request.optJSONObject("taskBackup")==null||!request.optJSONObject("taskBackup").optString("source").isEmpty());
            request.put("requestOrigin",origin).put("title",t.getString("title")).put("taskBackup",backup).put("overdueDate",overdueDate).put("enabled",false).put("cooldownHours",0).put("queuedAt",now);
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
        t.remove("requestBackup");t.remove("manualRequest");
        if(p.has("overdueDate"))t.put("overdueDate",p.getString("overdueDate"));
        String project=t.optString("project");boolean projectExists=false;JSONArray projects=s.getJSONArray("projects");
        for(int i=0;i<projects.length();i++)if(projects.getJSONObject(i).getString("id").equals(project))projectExists=true;
        boolean origin=p.has("requestOrigin")?p.optBoolean("requestOrigin"):backup==null||!backup.optString("source").isEmpty();
        t.put("title",p.getString("title")).put("date",java.time.Instant.ofEpochMilli(now).atZone(zone).toLocalDate().toString()).put("project",projectExists?project:"").put("source",p.getString("id")).put("requestOrigin",origin).put("done",false).put("reminder",t.optLong("reminder")>now?t.optLong("reminder"):0).put("notified",false);
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
