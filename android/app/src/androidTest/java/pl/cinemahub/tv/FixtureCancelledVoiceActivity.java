package pl.cinemahub.tv;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

public final class FixtureCancelledVoiceActivity extends Activity {
    @Override public void onCreate(Bundle state){super.onCreate(state);new Handler(Looper.getMainLooper()).postDelayed(()->{setResult(RESULT_CANCELED);finish();},500);}
}
