package dev.loxylon.todo;

import android.graphics.Insets;
import android.os.Build;
import android.view.*;
import android.webkit.WebView;
import android.widget.FrameLayout;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk={29,35})
public class WindowInsetsTest {
    @Test public void actualWebViewportStaysInsideBarsAndAboveKeyboard() {
        try(var controller=Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity activity=controller.get();
            FrameLayout host=activity.findViewById(android.R.id.content);
            FrameLayout content=(FrameLayout)host.getChildAt(0);
            FrameLayout viewport=(FrameLayout)content.getChildAt(0);
            WebView web=(WebView)viewport.getChildAt(0);
            int extra=Math.round(8*activity.getResources().getDisplayMetrics().density);
            WindowInsets bars;
            if(Build.VERSION.SDK_INT>=30) bars=new WindowInsets.Builder().setInsets(WindowInsets.Type.systemBars(),Insets.of(0,40,0,30)).build();
            else bars=new WindowInsets.Builder().setSystemWindowInsets(Insets.of(0,40,0,30)).build();
            content.dispatchApplyWindowInsets(bars);
            layout(content);
            assertEquals(40+extra,viewport.getTop());
            assertEquals(915-30,viewport.getBottom());
            assertEquals(412,web.getMeasuredWidth());
            assertEquals(viewport.getHeight(),web.getMeasuredHeight());
            if(Build.VERSION.SDK_INT>=30) {
                WindowInsets keyboard=new WindowInsets.Builder().setInsets(WindowInsets.Type.systemBars(),Insets.of(0,40,0,30)).setInsets(WindowInsets.Type.ime(),Insets.of(0,0,0,300)).build();
                content.dispatchApplyWindowInsets(keyboard);layout(content);
                assertEquals(40+extra,viewport.getTop());
                assertEquals(615,viewport.getBottom());
                assertEquals(viewport.getHeight(),web.getMeasuredHeight());
                WindowInsets cutout=new WindowInsets.Builder().setInsets(WindowInsets.Type.systemBars(),Insets.of(0,40,0,30)).setInsets(WindowInsets.Type.displayCutout(),Insets.of(0,60,0,0)).build();
                content.dispatchApplyWindowInsets(cutout);layout(content);
                assertEquals(60+extra,viewport.getTop());
                assertEquals(885,viewport.getBottom());
            }
        }
    }
    private static void layout(View v) {
        v.measure(View.MeasureSpec.makeMeasureSpec(412,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(915,View.MeasureSpec.EXACTLY));
        v.layout(0,0,412,915);
    }
}
