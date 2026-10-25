package pl.cinemahub.tv;

import android.app.AlertDialog;
import android.content.Context;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class AssistantControlsMenuTest {
    @Test public void settingsOnlyOfferManualGoogleControlsAndKeepServer() {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        String previous=context.getSharedPreferences("cinema-client",Context.MODE_PRIVATE).getString("server",null);
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity->{
                AlertDialog dialog=new AssistantControls(activity).show();
                try {
                    assertTrue(dialog.isShowing());
                    assertNull("Experimental settings must not be listed",dialog.getListView());
                    assertEquals("Otwórz ustawienia Google",dialog.getButton(AlertDialog.BUTTON_POSITIVE).getText().toString());
                    assertTrue(dialog.getButton(AlertDialog.BUTTON_POSITIVE).isShown());
                    String message=((android.widget.TextView)dialog.findViewById(android.R.id.message)).getText().toString();
                    assertTrue(message.contains("com.google.android.katniss"));
                    assertTrue(message.contains("również po zamknięciu Cinema Hub"));
                } finally {
                    dialog.dismiss();
                }
            });
        }
        assertEquals(previous,context.getSharedPreferences("cinema-client",Context.MODE_PRIVATE).getString("server",null));
    }
}
