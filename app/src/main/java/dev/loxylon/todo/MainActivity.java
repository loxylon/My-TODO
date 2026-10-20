package dev.loxylon.todo;

import android.app.*;
import android.os.*;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.provider.Settings;
import android.view.*;
import android.webkit.*;
import org.json.*;

public class MainActivity extends Activity {
    private WebView web;
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        web=new WebView(this); web.setBackgroundColor(Color.rgb(21,25,30));
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setAllowFileAccess(false); web.getSettings().setAllowContentAccess(false);
        web.getSettings().setDomStorageEnabled(false);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u=r.getUrl();
                if("https".equals(u.getScheme()) && "app.local".equals(u.getHost())) {
                    String p=u.getPath(); if(p==null || p.equals("/")) p="/index.html";
                    if(p.contains("..")) return new WebResourceResponse("text/plain","UTF-8",null);
                    try { String mime=p.endsWith(".css")?"text/css":p.endsWith(".js")?"application/javascript":"text/html";
                        return new WebResourceResponse(mime,"UTF-8",getAssets().open(p.substring(1)));
                    } catch(Exception e) { return new WebResourceResponse("text/plain","UTF-8",null); }
                }
                return new WebResourceResponse("text/plain","UTF-8",null);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r) { return !"app.local".equals(r.getUrl().getHost()); }
        });
        web.addJavascriptInterface(new Bridge(),"Android");
        setContentView(web);
        if(Build.VERSION.SDK_INT>=35) web.setOnApplyWindowInsetsListener((v,insets)->{
            android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());
            android.graphics.Insets ime=insets.getInsets(WindowInsets.Type.ime());
            v.setPadding(bars.left,bars.top,bars.right,Math.max(bars.bottom,ime.bottom)); return insets;
        });
        web.loadUrl("https://app.local/index.html");
    }
    @Override protected void onResume() {
        super.onResume();
        if(web!=null) { synchronized(Store.class) { try { Store.reconcile(this); Alarms.channels(this); Alarms.notifyDue(this); Alarms.sync(this,Store.read(this)); } catch(Exception e){ android.util.Log.e("MyTODO","Resume failed",e); } }
            web.post(()->web.evaluateJavascript("window.refreshNative && refreshNative()",null)); }
    }
    @Override public void onBackPressed() { web.evaluateJavascript("window.handleBack && handleBack()",null); }
    private final class Bridge {
        @JavascriptInterface public String read() { try { return Store.reconcile(MainActivity.this).toString(); } catch(Exception e){ return "{\"error\":\"Не удалось прочитать данные\"}"; } }
        @JavascriptInterface public String save(String json) {
            synchronized(Store.class) {
                try { JSONObject s=new JSONObject(json);
                    if(s.optLong("revision")!=Store.read(MainActivity.this).optLong("revision")) return "{\"error\":\"Список обновился в фоне. Повторите изменение.\",\"conflict\":true}";
                    Store.write(MainActivity.this,s); Alarms.sync(MainActivity.this,s); return s.toString(); }
                catch(Exception e) { android.util.Log.e("MyTODO","Save failed",e); return "{\"error\":\"Не удалось сохранить данные или напоминания\"}"; }
            }
        }
        @JavascriptInterface public String permissions() {
            boolean notifications=Build.VERSION.SDK_INT<33 || checkSelfPermission("android.permission.POST_NOTIFICATIONS")==android.content.pm.PackageManager.PERMISSION_GRANTED;
            boolean exact=Build.VERSION.SDK_INT<31 || getSystemService(AlarmManager.class).canScheduleExactAlarms();
            return "{\"notifications\":"+notifications+",\"exact\":"+exact+"}";
        }
        @JavascriptInterface public void requestNotifications() { runOnUiThread(()->{ if(Build.VERSION.SDK_INT>=33) requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},1); }); }
        @JavascriptInterface public void requestExact() { runOnUiThread(()->{ if(Build.VERSION.SDK_INT>=31) startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName()))); }); }
        @JavascriptInterface public void shareBackup(String json) {
            runOnUiThread(()->{ try {
                // Storage Access Framework writes a private, user-selected backup document.
                pendingBackup=json; startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").putExtra(Intent.EXTRA_TITLE,"my-todo-backup.json").addCategory(Intent.CATEGORY_OPENABLE),2);
            } catch(Exception e) { android.widget.Toast.makeText(MainActivity.this,"Не удалось открыть выбор файла",android.widget.Toast.LENGTH_SHORT).show(); } });
        }
        @JavascriptInterface public void importBackup() { runOnUiThread(()->startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE),3)); }
        @JavascriptInterface public void colors(String background, boolean light) { runOnUiThread(()->{ try { int c=Color.parseColor(background); getWindow().setStatusBarColor(c); getWindow().setNavigationBarColor(c); getWindow().getDecorView().setSystemUiVisibility(light?View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR:0); } catch(Exception ignored){} }); }
        @JavascriptInterface public void close() { runOnUiThread(()->finish()); }
    }
    private String pendingBackup;
    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);
        if(result!=RESULT_OK || data==null || data.getData()==null) return;
        try {
            if(request==2 && pendingBackup!=null) { try(java.io.OutputStream out=getContentResolver().openOutputStream(data.getData())) { out.write(pendingBackup.getBytes(java.nio.charset.StandardCharsets.UTF_8)); } pendingBackup=null; }
            if(request==3) { try(java.io.InputStream in=getContentResolver().openInputStream(data.getData())) {
                java.io.ByteArrayOutputStream buffer=new java.io.ByteArrayOutputStream(); byte[] chunk=new byte[4096]; int count;
                while((count=in.read(chunk))!=-1) { if(buffer.size()+count>2_000_000) throw new IllegalArgumentException("large backup"); buffer.write(chunk,0,count); }
                byte[] bytes=buffer.toByteArray();
                String raw=new String(bytes,java.nio.charset.StandardCharsets.UTF_8);
                web.evaluateJavascript("window.receiveBackup("+JSONObject.quote(raw)+")",null);
            } }
        } catch(Exception e) { android.widget.Toast.makeText(this,"Не удалось обработать файл",android.widget.Toast.LENGTH_SHORT).show(); }
    }
}
