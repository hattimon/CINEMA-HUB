package pl.cinemahub.tv;

import android.app.Dialog;
import android.content.Context;
import android.widget.Button;
import android.view.View;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Map;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@UnstableApi
@RunWith(AndroidJUnit4.class)
public final class PlaybackEffectsMenuTest {
    @Test public void openingMenuDisplaysEveryLabelBeforeAnySelection() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.getSharedPreferences("cinema-client",Context.MODE_PRIVATE).edit()
            .putString("server","http://127.0.0.1:1/").putBoolean("configured",true)
            .remove("audio-boost").remove("audio-mode").commit();

        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity->{
                ExoPlayer fakePlayer=new ExoPlayer.Builder(activity).build();
                try {
                    Field playerField=MainActivity.class.getDeclaredField("player");playerField.setAccessible(true);
                    playerField.set(activity,fakePlayer);
                    Method show=MainActivity.class.getDeclaredMethod("showPlaybackMenu");show.setAccessible(true);
                    Field choices=MainActivity.class.getDeclaredField("playbackPanelOptions");choices.setAccessible(true);
                    Field dialogField=MainActivity.class.getDeclaredField("playbackEffectsDialog");dialogField.setAccessible(true);

                    show.invoke(activity);
                    Dialog dialog=(Dialog)dialogField.get(activity);
                    assertNotNull(dialog);assertTrue(dialog.isShowing());
                    @SuppressWarnings("unchecked")
                    Map<String,Button> options=(Map<String,Button>)choices.get(activity);
                    assertEquals(15,options.size());
                    assertLabel(options,"profile:natural","Naturalny",true);
                    assertLabel(options,"profile:projector","Projektor",false);
                    assertLabel(options,"profile:cinema","Kino",false);
                    assertLabel(options,"profile:soft","Łagodne SD",false);
                    assertLabel(options,"effect:none","Bez efektu",true);
                    assertLabel(options,"effect:crt","CRT klasyczny",false);
                    assertLabel(options,"effect:crt-warm","CRT ciepły",false);
                    assertLabel(options,"effect:crt-green","Zielony kineskop",false);
                    assertLabel(options,"boost:100","Normalnie",true);
                    assertLabel(options,"boost:150","150%",false);
                    assertLabel(options,"boost:200","200%",false);
                    assertLabel(options,"boost:250","250%",false);
                    assertLabel(options,"boost:300","300%",false);
                    assertLabel(options,"audio:auto","AUTO",false);
                    assertLabel(options,"audio:normalizer","Normalizer",false);
                    options.get("boost:300").performClick();
                    assertEquals(300,context.getSharedPreferences("cinema-client",Context.MODE_PRIVATE).getInt("audio-boost",0));
                    assertLabel(options,"boost:300","300%",true);
                    options.get("audio:auto").performClick();
                    assertLabel(options,"audio:auto","AUTO",true);
                    assertLabel(options,"boost:300","300%",false);
                    assertEquals("auto",context.getSharedPreferences("cinema-client",Context.MODE_PRIVATE).getString("audio-mode",""));
                    dialog.dismiss();
                } catch(Exception exception) {
                    throw new AssertionError("Playback panel initial state",exception);
                } finally {
                    try {Field field=MainActivity.class.getDeclaredField("playbackEffectsDialog");field.setAccessible(true);Dialog dialog=(Dialog)field.get(activity);if(dialog!=null)dialog.dismiss();}catch(Exception ignored){}
                    try {Field field=MainActivity.class.getDeclaredField("player");field.setAccessible(true);field.set(activity,null);}catch(Exception ignored){}
                    fakePlayer.release();
                }
            });
        }
    }

    private static void assertLabel(Map<String,Button> buttons,String key,String label,boolean selected) {
        Button button=buttons.get(key);
        assertNotNull("Missing " + key,button);
        assertTrue("Invisible " + key,button.isShown());
        assertTrue("Blank label " + key,button.getText().toString().contains(label));
        assertEquals("Hardware text layer may omit the first frame for " + key,View.LAYER_TYPE_SOFTWARE,button.getLayerType());
        assertEquals("Wrong selected state for " + key,selected,button.isSelected());
    }
}
