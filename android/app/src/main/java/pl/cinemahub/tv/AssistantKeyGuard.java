package pl.cinemahub.tv;

import android.accessibilityservice.AccessibilityService;
import android.content.Context;
import android.content.SharedPreferences;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;
import androidx.media3.common.util.UnstableApi;
import androidx.annotation.OptIn;
import java.lang.ref.WeakReference;

/** Opt-in key filtering. Only Android-delivered keys can be intercepted. */
@OptIn(markerClass=UnstableApi.class)
public final class AssistantKeyGuard extends AccessibilityService {
    private static WeakReference<MainActivity> foreground=new WeakReference<>(null);
    private int heldKey=KeyEvent.KEYCODE_UNKNOWN;
    static final String PREFS="cinema-assistant-guard";
    static final String ENABLED="enabled";

    static void foreground(MainActivity activity){foreground=new WeakReference<>(activity);}
    static void background(MainActivity activity){if(foreground.get()==activity)foreground.clear();}
    static boolean isAssistantKey(int key){return key==KeyEvent.KEYCODE_ASSIST||key==KeyEvent.KEYCODE_VOICE_ASSIST||key==KeyEvent.KEYCODE_SEARCH;}
    static SharedPreferences preferences(Context context){return context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);}

    @Override public void onAccessibilityEvent(AccessibilityEvent event){}
    @Override public void onInterrupt(){}

    @Override protected boolean onKeyEvent(KeyEvent event){
        // Some TV firmware never delivers ACTION_UP for reserved remote keys.
        // A fresh ACTION_DOWN with repeatCount==0 must still trigger the next search.
        if(event.getKeyCode()==heldKey&&event.getAction()==KeyEvent.ACTION_UP){
            heldKey=KeyEvent.KEYCODE_UNKNOWN;
            return true;
        }
        if(event.getKeyCode()==heldKey&&event.getAction()==KeyEvent.ACTION_DOWN&&event.getRepeatCount()>0)return true;
        MainActivity activity=foreground.get();
        if(activity==null||!preferences(this).getBoolean(ENABLED,false)||!isAssistantKey(event.getKeyCode()))return false;
        // Consume BOTH halves of a key stream, even if the activity loses focus between them.
        if(event.getAction()!=KeyEvent.ACTION_DOWN)return false;
        heldKey=event.getKeyCode();
        if(event.getRepeatCount()==0){
            preferences(this).edit().putInt("last-key",event.getKeyCode()).putLong("last-time",System.currentTimeMillis()).apply();
            activity.runOnUiThread(()->activity.startVoiceFromAssistantGuard());
        }
        return true;
    }
}
