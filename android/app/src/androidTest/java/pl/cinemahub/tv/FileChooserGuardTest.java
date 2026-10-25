package pl.cinemahub.tv;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.view.KeyEvent;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class FileChooserGuardTest {
    private ActivityScenario<MainActivity> scenario;
    private MainActivity activity;
    private WebView web;
    private Instrumentation.ActivityMonitor picker;
    private final java.util.concurrent.atomic.AtomicInteger requests=new java.util.concurrent.atomic.AtomicInteger();
    private String requestContext="";
    private java.net.ServerSocket fixture;
    private Instrumentation instrumentation(){return InstrumentationRegistry.getInstrumentation();}
    @Before public void open()throws Exception{
        fixture=new java.net.ServerSocket(0,8,java.net.InetAddress.getByName("127.0.0.1"));
        String origin="http://127.0.0.1:"+fixture.getLocalPort()+"/";
        byte[] html="<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head><body><button id='settings' onclick=\"document.getElementById('content').textContent='Ustawienia';\">Ustawienia</button><button id='files' class='local-open' onclick=\"document.getElementById('file').click()\">Otwórz plik</button><input id='file' type='file' accept='video/*' hidden><div id='content'>Biblioteka</div><script>window.CinemaHubTV={key:()=>false};</script></body></html>".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        Thread host=new Thread(()->{while(!fixture.isClosed())try(java.net.Socket client=fixture.accept()){client.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: "+html.length+"\r\nConnection: close\r\n\r\n").getBytes(java.nio.charset.StandardCharsets.US_ASCII));client.getOutputStream().write(html);client.getOutputStream().flush();}catch(java.io.IOException closed){if(fixture.isClosed())return;}});host.setDaemon(true);host.start();
        Context context=instrumentation().getTargetContext();
        context.getSharedPreferences("cinema-client",Context.MODE_PRIVATE).edit().putString("server",origin).putBoolean("configured",true).putBoolean("cursor",false).commit();
        IntentFilter filter=new IntentFilter(Intent.ACTION_OPEN_DOCUMENT);filter.addCategory(Intent.CATEGORY_OPENABLE);filter.addDataType("video/*");
        picker=new Instrumentation.ActivityMonitor(filter,new Instrumentation.ActivityResult(Activity.RESULT_CANCELED,null),true);
        instrumentation().addMonitor(picker);
        CountDownLatch loaded=new CountDownLatch(1);
        scenario=ActivityScenario.launch(MainActivity.class);
        scenario.onActivity(owner->{
            activity=owner;
            try{Field field=MainActivity.class.getDeclaredField("web");field.setAccessible(true);web=(WebView)field.get(owner);}catch(Exception error){throw new AssertionError(error);}
            try{Field field=MainActivity.class.getDeclaredField("errorView");field.setAccessible(true);android.view.View error=(android.view.View)field.get(owner);if(error!=null){((android.view.ViewGroup)error.getParent()).removeView(error);field.set(owner,null);}}catch(Exception error){throw new AssertionError(error);}
            web.stopLoading();
            web.requestFocus();
            android.webkit.WebChromeClient original=web.getWebChromeClient();
            web.setWebChromeClient(new android.webkit.WebChromeClient(){@Override public boolean onShowFileChooser(WebView view,android.webkit.ValueCallback<android.net.Uri[]> callback,FileChooserParams params){requests.incrementAndGet();try{Field current=MainActivity.class.getDeclaredField("web"),server=MainActivity.class.getDeclaredField("server"),pending=MainActivity.class.getDeclaredField("fileChooser");current.setAccessible(true);server.setAccessible(true);pending.setAccessible(true);requestContext="current="+(view==current.get(owner))+",server="+server.get(owner)+",url="+view.getUrl()+",pending="+(pending.get(owner)!=null);}catch(Exception error){throw new AssertionError(error);}return original.onShowFileChooser(view,callback,params);}});
            web.setWebViewClient(new WebViewClient(){@Override public void onPageFinished(WebView view,String url){view.evaluateJavascript(FileChooserGuard.INSTALL,result->loaded.countDown());}});
            web.loadUrl(origin);
        });
        assertTrue("Fixture did not load",loaded.await(12,TimeUnit.SECONDS));
    }
    @After public void close()throws Exception{if(scenario!=null)scenario.close();if(picker!=null)instrumentation().removeMonitor(picker);if(fixture!=null)fixture.close();}
    private String js(String script)throws Exception{
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();
        instrumentation().runOnMainSync(()->web.evaluateJavascript(script,value->{result.set(value);done.countDown();}));
        assertTrue(done.await(5,TimeUnit.SECONDS));return result.get();
    }
    @Test public void settingsAndUnsolicitedInputNeverOpenDocuments()throws Exception{
        js("document.getElementById('settings').click();document.getElementById('file').click();true");
        Thread.sleep(400);
        assertEquals("\"Ustawienia\"",js("document.getElementById('content').textContent"));
        assertEquals(0,picker.getHits());
    }
    @Test public void intentionalFileActionStillOpensExactlyOnePicker()throws Exception{
        js("document.getElementById('files').focus();true");
        instrumentation().runOnMainSync(()->{activity.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_DPAD_CENTER));activity.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_DPAD_CENTER));});
        long deadline=android.os.SystemClock.uptimeMillis()+5000;
        while(picker.getHits()==0&&android.os.SystemClock.uptimeMillis()<deadline)Thread.sleep(50);
        assertEquals("Native picker requests="+requests.get()+", "+requestContext+", stage="+activity.getSharedPreferences("cinema-diagnostics",Context.MODE_PRIVATE).getString("voiceEvent","")+", JS="+js("JSON.stringify({focused:document.activeElement?.id,gate:window.CinemaHubFiles.take(),url:location.href,buttons:document.querySelectorAll('button').length})"),1,picker.getHits());
        js("document.getElementById('settings').click();document.getElementById('file').click();true");
        Thread.sleep(250);
        assertEquals("A previous file action must not authorize another picker",1,picker.getHits());
    }
    @Test public void remoteOkOpensSettingsInsteadOfNativeFileFocus()throws Exception{
        js("document.getElementById('files').focus();document.getElementById('settings').focus();true");
        instrumentation().runOnMainSync(()->{
            activity.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_DPAD_CENTER));
            activity.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_DPAD_CENTER));
        });
        long deadline=android.os.SystemClock.uptimeMillis()+5000;
        while(!"\"Ustawienia\"".equals(js("document.getElementById('content').textContent"))&&android.os.SystemClock.uptimeMillis()<deadline)Thread.sleep(50);
        assertEquals("\"Ustawienia\"",js("document.getElementById('content').textContent"));
        assertEquals(0,picker.getHits());
    }
}
