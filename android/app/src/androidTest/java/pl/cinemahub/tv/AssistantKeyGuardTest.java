package pl.cinemahub.tv;

import android.Manifest;
import android.accessibilityservice.AccessibilityService;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.view.KeyEvent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class AssistantKeyGuardTest {
    private Context context(){return InstrumentationRegistry.getInstrumentation().getTargetContext();}

    @Test public void onlyAssistantHardwareKeysAreEligible(){
        assertTrue(AssistantKeyGuard.isAssistantKey(KeyEvent.KEYCODE_ASSIST));
        assertTrue(AssistantKeyGuard.isAssistantKey(KeyEvent.KEYCODE_VOICE_ASSIST));
        assertFalse(AssistantKeyGuard.isAssistantKey(KeyEvent.KEYCODE_BACK));
        assertFalse(AssistantKeyGuard.isAssistantKey(KeyEvent.KEYCODE_DPAD_CENTER));
        assertFalse(AssistantKeyGuard.isAssistantKey(KeyEvent.KEYCODE_VOLUME_UP));
        assertTrue(AssistantKeyGuard.isAssistantKey(KeyEvent.KEYCODE_SEARCH));
    }

    @Test public void obsoleteAccessibilityServiceIsNoLongerOffered()throws Exception{
        try{context().getPackageManager().getServiceInfo(new ComponentName(context(),AssistantKeyGuard.class),PackageManager.GET_META_DATA);fail("Obsolete key guard is still registered");}
        catch(PackageManager.NameNotFoundException expected){}
    }

    @Test public void disablingGuardDoesNotTouchCinemaHubSettings(){
        Context app=context();
        String server=app.getSharedPreferences("cinema-client",Context.MODE_PRIVATE).getString("server","missing");
        AssistantKeyGuard.preferences(app).edit().putBoolean(AssistantKeyGuard.ENABLED,true).commit();
        AssistantKeyGuard.preferences(app).edit().putBoolean(AssistantKeyGuard.ENABLED,false).commit();
        assertFalse(AssistantKeyGuard.preferences(app).getBoolean(AssistantKeyGuard.ENABLED,true));
        assertEquals(server,app.getSharedPreferences("cinema-client",Context.MODE_PRIVATE).getString("server","missing"));
    }
}
