package pl.cinemahub.tv;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionService;
import android.speech.SpeechRecognizer;
import android.speech.RecognizerIntent;
import java.util.ArrayList;
import java.util.Collections;

/** Deterministic framework fixture. No microphone capture occurs. Never packaged in the release APK. */
public final class FixtureRecognitionService extends RecognitionService {
    private final Handler handler=new Handler(Looper.getMainLooper());
    @Override protected void onStartListening(Intent intent,Callback listener){
        String transcription="en-US".equals(intent.getStringExtra(RecognizerIntent.EXTRA_LANGUAGE))?"The Lord of the Rings":"Pingwiny z Madagaskaru";
        try{listener.readyForSpeech(new Bundle());Bundle partial=new Bundle();partial.putStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION,new ArrayList<>(Collections.singletonList("Pi")));listener.partialResults(partial);}catch(Exception ignored){}
        handler.postDelayed(()->{try{Bundle result=new Bundle();result.putStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION,new ArrayList<>(Collections.singletonList(transcription)));listener.results(result);}catch(Exception ignored){}},1600);
    }
    @Override protected void onStopListening(Callback listener){}
    @Override protected void onCancel(Callback listener){} // Deliberately late completion exercises cancellation.
    @Override public void onDestroy(){handler.removeCallbacksAndMessages(null);super.onDestroy();}
}
