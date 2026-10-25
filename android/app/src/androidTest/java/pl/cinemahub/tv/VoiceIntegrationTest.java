package pl.cinemahub.tv;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Context;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.GrantPermissionRule;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class VoiceIntegrationTest {
    @Rule public GrantPermissionRule microphone=GrantPermissionRule.grant(Manifest.permission.RECORD_AUDIO);
    private ActivityScenario<MainActivity> scenario;
    private MainActivity activity;
    private VoiceSearchController voice;
    private final List<String> events=new CopyOnWriteArrayList<>();
    private CountDownLatch completion;
    private static final String ID="00000000000000000000000000000031";
    @Before public void open()throws Exception{
        // RecognitionService fixture runs in the instrumentation APK, while the rule
        // grants RECORD_AUDIO to the target application. Both packages need it.
        InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(
            InstrumentationRegistry.getInstrumentation().getContext().getPackageName(),Manifest.permission.RECORD_AUDIO);
        Context target=InstrumentationRegistry.getInstrumentation().getTargetContext();
        target.getSharedPreferences("cinema-client",Context.MODE_PRIVATE).edit().putString("server","http://127.0.0.1:1/").putBoolean("configured",true).commit();
        target.getSharedPreferences("cinema-voice",Context.MODE_PRIVATE).edit().clear().commit();
        scenario=ActivityScenario.launch(MainActivity.class);scenario.onActivity(owner->activity=owner);
        ui(()->{Field field=MainActivity.class.getDeclaredField("voiceSearch");field.setAccessible(true);((VoiceSearchController)field.get(activity)).destroy();voice=new VoiceSearchController(activity,(type,id,value)->{events.add(type+"|"+value);if(completion!=null)completion.countDown();},()->{List<VoiceSearchServices.Provider> providers=VoiceSearchServices.providers(activity,false);VoiceSearchServices.Provider once=VoiceSearchServices.takeOnce(activity,providers);return once!=null?once:VoiceSearchServices.preferred(activity,providers);});field.set(activity,voice);return null;});
    }
    @After public void close()throws Exception{if(activity!=null)ui(()->{voice.destroy();VoiceSearchServices.reset(activity);return null;});if(scenario!=null)scenario.close();}
    private <T>T ui(Callable<T> action)throws Exception{
        AtomicReference<T> value=new AtomicReference<>();AtomicReference<Throwable> failure=new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{try{value.set(action.call());}catch(Throwable error){failure.set(error);}});
        if(failure.get()!=null)throw new AssertionError(failure.get());return value.get();
    }
    private VoiceSearchServices.Provider fixture(String className)throws Exception{
        return ui(()->{for(VoiceSearchServices.Provider provider:VoiceSearchServices.providers(activity,false))if(provider.component!=null&&provider.component.getClassName().endsWith(className))return provider;throw new AssertionError("Missing fixture "+className);});
    }
    private void select(AlertDialog dialog,List<VoiceSearchServices.Provider> providers,VoiceSearchServices.Provider provider,int button)throws Exception{
        ui(()->{int index=-1;for(int i=0;i<providers.size();i++)if(providers.get(i).key.equals(provider.key)){index=i;break;}
            if(index<0)throw new AssertionError("Fixture provider not listed: "+provider.key);
            dialog.getListView().performItemClick(null,index,index);dialog.getButton(button).performClick();return null;});
    }
    @Test public void onlyOnceDoesNotPersistChoice()throws Exception{
        VoiceSearchServices.Provider provider=fixture("FixtureVoiceActivity");AtomicReference<VoiceSearchServices.Provider> selected=new AtomicReference<>();
        List<VoiceSearchServices.Provider> providers=ui(()->VoiceSearchServices.providers(activity,false));
        AlertDialog dialog=ui(()->VoiceSearchServices.pick(activity,providers,(value,remember)->selected.set(value),()->{}));
        select(dialog,providers,provider,AlertDialog.BUTTON_POSITIVE);
        assertEquals(provider.key,selected.get().key);assertEquals("",ui(()->VoiceSearchServices.preferences(activity).getString("provider","")));
    }
    @Test public void alwaysPersistsAndResetKeepsServer()throws Exception{
        VoiceSearchServices.Provider provider=fixture("FixtureVoiceActivity");List<VoiceSearchServices.Provider> providers=ui(()->VoiceSearchServices.providers(activity,false));
        AlertDialog dialog=ui(()->VoiceSearchServices.pick(activity,providers,(value,remember)->{},()->{}));select(dialog,providers,provider,AlertDialog.BUTTON_NEUTRAL);
        assertEquals(provider.key,ui(()->VoiceSearchServices.preferences(activity).getString("provider","")));
        ui(()->{VoiceSearchServices.reset(activity);return null;});assertEquals("",ui(()->VoiceSearchServices.preferences(activity).getString("provider","")));
        assertEquals("http://127.0.0.1:1/",ui(()->activity.getSharedPreferences("cinema-client",Context.MODE_PRIVATE).getString("server","")));
    }
    @Test public void settingsOnlyOnceIsConsumedOnce()throws Exception{
        VoiceSearchServices.Provider provider=fixture("FixtureVoiceActivity");List<VoiceSearchServices.Provider> providers=ui(()->VoiceSearchServices.providers(activity,false));
        AlertDialog dialog=ui(()->VoiceSearchServices.choose(activity));select(dialog,providers,provider,AlertDialog.BUTTON_POSITIVE);
        assertEquals(provider.key,ui(()->VoiceSearchServices.takeOnce(activity,providers)).key);assertNull(ui(()->VoiceSearchServices.takeOnce(activity,providers)));
        assertNull(ui(()->VoiceSearchServices.preferred(activity,providers)));
    }
    @Test public void alwaysReplacesPendingOneTimeChoice()throws Exception{
        VoiceSearchServices.Provider temporary=fixture("FixtureVoiceActivity");
        VoiceSearchServices.Provider saved=fixture("FixtureRecognitionService");
        // Exercise the same temporary choice used by the settings dialog.
        List<VoiceSearchServices.Provider> providers=ui(()->VoiceSearchServices.providers(activity,false));
        AlertDialog first=ui(()->VoiceSearchServices.choose(activity));select(first,providers,temporary,AlertDialog.BUTTON_POSITIVE);
        ui(()->{VoiceSearchServices.remember(activity,saved);return null;});
        assertNull(ui(()->VoiceSearchServices.takeOnce(activity,providers)));
        assertEquals(saved.key,ui(()->VoiceSearchServices.preferred(activity,providers)).key);
    }
    @Test public void keyboardFallbackUsesExistingSearchFieldFlowWithoutStartingSpeechService()throws Exception{
        VoiceSearchServices.Provider keyboard=ui(()->VoiceSearchServices.find(VoiceSearchServices.providers(activity,false),"keyboard"));
        assertNotNull(keyboard);assertNull(keyboard.component);assertFalse(keyboard.direct);
        ui(()->{VoiceSearchServices.remember(activity,keyboard);voice.start(ID,false,"pl-PL");return null;});
        assertEquals(1,events.size());assertEquals("voice_search_keyboard|",events.get(0));
        assertFalse(ui(()->voice.busy()));
        assertEquals("keyboard",ui(()->VoiceSearchServices.preferences(activity).getString("provider","")));
        assertEquals("http://127.0.0.1:1/",ui(()->activity.getSharedPreferences("cinema-client",Context.MODE_PRIVATE).getString("server","")));
        ui(()->{VoiceSearchServices.reset(activity);return null;});
        assertEquals("",ui(()->VoiceSearchServices.preferences(activity).getString("provider","")));
    }
    @Test public void keyboardFallbackCanBeChosenOnlyOnce()throws Exception{
        List<VoiceSearchServices.Provider> providers=ui(()->VoiceSearchServices.providers(activity,false));
        VoiceSearchServices.Provider keyboard=VoiceSearchServices.find(providers,"keyboard");assertNotNull(keyboard);
        AlertDialog chooser=ui(()->VoiceSearchServices.choose(activity));
        select(chooser,providers,keyboard,AlertDialog.BUTTON_POSITIVE);
        assertEquals("",ui(()->VoiceSearchServices.preferences(activity).getString("provider","")));
        ui(()->{voice.start(ID,false,"pl-PL");return null;});
        assertEquals("voice_search_keyboard|",events.get(0));
        assertNull(ui(()->VoiceSearchServices.takeOnce(activity,providers)));
        assertFalse(ui(()->voice.busy()));
    }
    @Test public void keyboardFallbackFocusesExistingWebSearchField()throws Exception{
        try(ServerSocket http=new ServerSocket(0,8,InetAddress.getByName("127.0.0.1"))){
            String origin="http://127.0.0.1:"+http.getLocalPort()+"/";
            byte[] html="<html><body><form class='search-box'><input aria-label='Szukaj filmów i seriali'></form></body></html>".getBytes(StandardCharsets.UTF_8);
            Thread server=new Thread(()->{
                while(!http.isClosed())try(Socket client=http.accept()){
                    byte[] headers=("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: "+html.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII);
                    client.getOutputStream().write(headers);client.getOutputStream().write(html);client.getOutputStream().flush();
                }catch(IOException closed){if(http.isClosed())return;}
            });server.setDaemon(true);server.start();
            CountDownLatch loaded=new CountDownLatch(1),checked=new CountDownLatch(1);
            AtomicReference<String> focusResult=new AtomicReference<>();
            WebView searchView=ui(()->{
                Field field=MainActivity.class.getDeclaredField("web");field.setAccessible(true);
                Field serverField=MainActivity.class.getDeclaredField("server");serverField.setAccessible(true);serverField.set(activity,origin);
                WebView view=(WebView)field.get(activity);
                view.setWebViewClient(new WebViewClient(){@Override public void onPageFinished(WebView browser,String url){if(origin.equals(url))loaded.countDown();}});
                view.loadUrl(origin);
                return view;
            });
            assertTrue("Search fixture did not load",loaded.await(15,TimeUnit.SECONDS));
            assertTrue("Search fixture origin is not recognized: "+ui(searchView::getUrl),ui(()->ServerAddress.owns(origin,searchView.getUrl())));
            ui(()->{Method open=MainActivity.class.getDeclaredMethod("openKeyboardForVoice",WebView.class);open.setAccessible(true);open.invoke(activity,searchView);return null;});
            Thread.sleep(700);
            ui(()->{searchView.evaluateJavascript("document.activeElement===document.querySelector('.search-box input')",value->{focusResult.set(value);checked.countDown();});return null;});
            assertTrue("Search focus callback not received",checked.await(10,TimeUnit.SECONDS));
            assertEquals("true",focusResult.get());
        }
    }
    @Test public void missingServiceDoesNotLaunchAnAlternativeOrLeaveBusyState()throws Exception{
        for(int repeat=0;repeat<20;repeat++)ui(()->{voice.start(ID,false,"pl-PL");voice.cancel();return null;});
        assertEquals(20,events.size());for(String event:events)assertEquals("voice_search_error|unavailable",event);assertFalse(ui(()->voice.busy()));
    }
    @Test public void directProviderReturnsWholeFinalText()throws Exception{
        VoiceSearchServices.Provider provider=fixture("FixtureRecognitionService");completion=new CountDownLatch(1);
        ui(()->{VoiceSearchServices.remember(activity,provider);voice.start(ID,false,"pl-PL");return null;});
        assertTrue("No native service result",completion.await(30,TimeUnit.SECONDS));assertEquals("voice_search_result|Pingwiny z Madagaskaru",events.get(0));
        assertFalse(ui(()->voice.busy()));assertFalse(ui(()->AppDiagnostics.report(activity)).contains("Pingwiny"));
    }
    @Test public void interruptedDirectRequestIgnoresPartialAndLateResult()throws Exception{
        VoiceSearchServices.Provider provider=fixture("FixtureRecognitionService");completion=new CountDownLatch(1);
        ui(()->{VoiceSearchServices.remember(activity,provider);voice.start(ID,false,"pl-PL");return null;});Thread.sleep(350);
        ui(()->{voice.pause();return null;});assertTrue(completion.await(10,TimeUnit.SECONDS));Thread.sleep(2000);
        assertEquals(1,events.size());assertEquals("voice_search_error|audio",events.get(0));assertFalse(ui(()->voice.busy()));
    }
    @Test public void restartingWithSameRequestIdIgnoresOldRecognizerCallbacks()throws Exception{
        VoiceSearchServices.Provider provider=fixture("FixtureRecognitionService");
        ui(()->{VoiceSearchServices.remember(activity,provider);voice.start(ID,false,"pl-PL");return null;});
        Thread.sleep(350);
        ui(()->{voice.cancel();voice.start(ID,false,"en-US");return null;});
        completion=new CountDownLatch(1);
        assertTrue(completion.await(30,TimeUnit.SECONDS));
        assertEquals(2,events.size());
        assertEquals("voice_search_cancelled|",events.get(0));
        assertEquals("voice_search_result|The Lord of the Rings",events.get(1));
    }
    @Test public void systemWindowResultReturnsToSameRequest()throws Exception{
        VoiceSearchServices.Provider provider=fixture("FixtureVoiceActivity");completion=new CountDownLatch(1);
        ui(()->{VoiceSearchServices.remember(activity,provider);voice.start(ID,false,"en-US");return null;});assertTrue(completion.await(30,TimeUnit.SECONDS));
        assertEquals("voice_search_result|Avatar",events.get(0));assertFalse(ui(()->voice.busy()));
    }
    @Test public void cancelledSystemWindowDoesNotLeaveWaitingSession()throws Exception{
        VoiceSearchServices.Provider provider=fixture("FixtureCancelledVoiceActivity");completion=new CountDownLatch(1);
        ui(()->{VoiceSearchServices.remember(activity,provider);voice.start(ID,false,"pl-PL");return null;});assertTrue(completion.await(30,TimeUnit.SECONDS));Thread.sleep(1200);
        assertEquals(1,events.size());assertEquals("voice_search_cancelled|",events.get(0));assertFalse(ui(()->voice.busy()));
    }
}
