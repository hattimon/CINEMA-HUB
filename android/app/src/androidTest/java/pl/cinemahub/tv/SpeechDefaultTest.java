package pl.cinemahub.tv;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class SpeechDefaultTest {
    @Test public void automaticChoiceIsStandaloneGoogleServiceDespiteOldKeyboardPreference(){
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        android.content.SharedPreferences preferences=VoiceSearchServices.preferences(context);
        String before=preferences.getString("provider",null);
        try{
            preferences.edit().putString("provider","keyboard").commit();
            VoiceSearchServices.Provider provider=VoiceSearchServices.automatic(context);
            assertNotNull("API 34 test image must provide Google Speech Recognition & Synthesis",provider);
            assertTrue(provider.direct);
            assertNotNull(provider.component);
            assertEquals("com.google.android.tts",provider.component.getPackageName());
            assertTrue(provider.key.startsWith("service:"));
        }finally{if(before==null)preferences.edit().remove("provider").commit();else preferences.edit().putString("provider",before).commit();}
    }
}
