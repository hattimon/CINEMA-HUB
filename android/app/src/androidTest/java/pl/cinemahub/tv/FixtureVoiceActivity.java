package pl.cinemahub.tv;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognizerIntent;
import java.util.ArrayList;
import java.util.Collections;

public final class FixtureVoiceActivity extends Activity {
    @Override public void onCreate(Bundle state){super.onCreate(state);new Handler(Looper.getMainLooper()).postDelayed(()->{setResult(RESULT_OK,new Intent().putStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS,new ArrayList<>(Collections.singletonList("Avatar"))));finish();},500);}
}
