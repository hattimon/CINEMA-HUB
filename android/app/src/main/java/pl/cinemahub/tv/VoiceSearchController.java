package pl.cinemahub.tv;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.KeyEvent;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** System voice UI first: TV firmware can route a remote microphone to its own service.
 * Direct SpeechRecognizer is used when that UI is absent. No audio leaves through the web bridge. */
final class VoiceSearchController implements VoiceSearchSession.Host {
    static final int AUDIO_PERMISSION=12;
    interface Listener {void completed(String type,String id,String value);}
    interface ProviderResolver {VoiceSearchServices.Provider get();}
    private final Activity activity;
    private final Listener listener;
    private final ProviderResolver providerResolver;
    private final Handler handler=new Handler(Looper.getMainLooper());
    final VoiceSearchSession session=new VoiceSearchSession(this);
    private SpeechRecognizer recognizer;
    private AlertDialog dialog;
    private VoiceSearchServices.Provider provider;
    private int activityRequest=-1,nextRequest=0x4000;
    private boolean permissionPending;
    private boolean systemAway,ready;
    private long recognitionGeneration;
    private long levelUpdated;
    private String language=VoiceSearchLanguage.device(Locale.getDefault());
    private final Runnable timeout=()->session.error("timeout");
    private void timeoutAfter(long milliseconds){handler.removeCallbacks(timeout);handler.postDelayed(timeout,milliseconds);}

    VoiceSearchController(Activity activity,Listener listener){this(activity,listener,()->VoiceSearchServices.automatic(activity));}
    VoiceSearchController(Activity activity,Listener listener,ProviderResolver resolver){this.activity=activity;this.listener=listener;this.providerResolver=resolver;}
    private Intent intent(){return new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE,language)
        .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,1)
        .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,false)
        .putExtra(RecognizerIntent.EXTRA_PROMPT,activity.getString(R.string.voice_prompt));}
    boolean systemAvailable(){try{return provider!=null&&!provider.direct&&intent().setComponent(provider.component).resolveActivity(activity.getPackageManager())!=null;}catch(RuntimeException error){return false;}}
    boolean available(){return providerResolver.get()!=null;}
    boolean busy(){return session.active()||permissionPending;}
    void start(String id,boolean direct,String requestedLanguage){
        if(busy())return;
        String selected=VoiceSearchLanguage.resolve(requestedLanguage,Locale.getDefault());
        if(selected==null){listener.completed("voice_search_error",id,"invalid_language");return;}
        language=selected;
        ready=false;
        VoiceSearchServices.Provider selectedProvider=providerResolver.get();
        session.choose(id);
        if(!session.active())return;
        AppDiagnostics.event(activity,"speech.choose");
        if(selectedProvider!=null)select(selectedProvider);
        else session.error("unavailable");
    }
    private void select(VoiceSearchServices.Provider chosen){
        if(session.state()!=VoiceSearchSession.State.CHOOSING)return;
        provider=chosen;AppDiagnostics.event(activity,chosen.direct?"speech.direct":"speech.system");
        if("keyboard".equals(chosen.key)){
            AppDiagnostics.event(activity,"speech.keyboard_fallback");
            session.keyboard();
            return;
        }
        session.selected(chosen.direct);
        if(session.active())timeoutAfter(60000);
    }
    boolean hardwareKey(int key){if(key!=KeyEvent.KEYCODE_SEARCH&&key!=KeyEvent.KEYCODE_VOICE_ASSIST&&key!=KeyEvent.KEYCODE_ASSIST)return false;if(!session.active())return false;AppDiagnostics.event(activity,"speech.remote_key_received");return true;}
    void cancel(){session.cancel();}
    void pause(){if(session.state()==VoiceSearchSession.State.SYSTEM)systemAway=true;else if(session.state()==VoiceSearchSession.State.LISTENING){AppDiagnostics.event(activity,"speech.interrupted_by_background");session.error("audio");}else if(session.state()==VoiceSearchSession.State.CHOOSING)cancel();}
    void resume(){
        if(!systemAway)return;
        systemAway=false;
        final String id=session.requestId();
        // Some vendor voice windows return to the app without delivering an activity result.
        handler.postDelayed(()->{if(session.state()==VoiceSearchSession.State.SYSTEM&&id.equals(session.requestId())&&activity.hasWindowFocus())session.error("client");},1500);
    }
    void destroy(){cancel();handler.removeCallbacksAndMessages(null);}
    @Override public boolean launchSystem(){
        if(!systemAvailable())return false;
        activityRequest=nextRequest++;
        if(nextRequest>0x7fff)nextRequest=0x4000;
        try{activity.startActivityForResult(intent().setComponent(provider.component),activityRequest);return true;}
        catch(RuntimeException error){activityRequest=-1;return false;}
    }
    @Override public boolean recognitionAvailable(){try{return provider!=null&&provider.direct&&VoiceSearchServices.find(VoiceSearchServices.providers(activity,true),provider.key)!=null;}catch(RuntimeException error){return false;}}
    @Override public boolean audioPermission(){return activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED;}
    @Override public void requestPermission(){permissionPending=true;activity.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},AUDIO_PERMISSION);}
    boolean permissionResult(int code,int[] results){
        if(code!=AUDIO_PERMISSION)return false;
        permissionPending=false;session.permissionResult(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED);return true;
    }
    boolean activityResult(int code,int result,Intent data){
        if(code<0x4000||code>0x7fff)return false;
        if(code!=activityRequest||session.state()!=VoiceSearchSession.State.SYSTEM)return true;
        activityRequest=-1;
        if(result==Activity.RESULT_CANCELED)session.cancel();
        else if(result==Activity.RESULT_OK)session.result(first(data==null?null:data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)));
        else session.error(result==RecognizerIntent.RESULT_AUDIO_ERROR?"audio":result==RecognizerIntent.RESULT_NETWORK_ERROR?"network":result==RecognizerIntent.RESULT_NO_MATCH?"no_match":result==RecognizerIntent.RESULT_CLIENT_ERROR?"client":"server");
        return true;
    }
    private static String first(ArrayList<String> values){return values==null||values.isEmpty()?"":values.get(0);}
    @Override public void listen(){
        final String id=session.requestId();
        final long generation=++recognitionGeneration;
        final String serviceLabel=provider.label;
        try{
            ComponentName selected=provider.component;
            recognizer=selected==null?SpeechRecognizer.createSpeechRecognizer(activity):SpeechRecognizer.createSpeechRecognizer(activity,selected);
            recognizer.setRecognitionListener(new RecognitionListener(){
                private boolean current(){return generation==recognitionGeneration&&session.state()==VoiceSearchSession.State.LISTENING&&id.equals(session.requestId());}
                @Override public void onReadyForSpeech(Bundle data){if(current()&&dialog!=null){ready=true;dialog.setMessage(activity.getString(R.string.voice_ready)+"\n\n"+serviceLabel);}}
                @Override public void onBeginningOfSpeech(){if(current())AppDiagnostics.event(activity,"speech.detected");}
                @Override public void onRmsChanged(float value){if(current()&&ready&&dialog!=null&&android.os.SystemClock.uptimeMillis()-levelUpdated>=200){levelUpdated=android.os.SystemClock.uptimeMillis();dialog.setMessage(activity.getString(R.string.voice_ready)+"\n\n"+serviceLabel+"\n"+VoiceSearchServices.text("Poziom zgłaszany przez usługę: ","Level reported by the service: ")+String.format(Locale.getDefault(),"%.1f",value));}}
                @Override public void onBufferReceived(byte[] buffer){} // Never retain or forward audio.
                @Override public void onEndOfSpeech(){ready=false;if(current()){timeoutAfter(20000);if(dialog!=null)dialog.setMessage(activity.getString(R.string.voice_processing));}}
                @Override public void onError(int code){if(current()){AppDiagnostics.event(activity,"speech.error."+errorCode(code));session.error(errorCode(code));}}
                @Override public void onResults(Bundle data){if(current()){
                    String text=first(data==null?null:data.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION));
                    ready=false;
                    // onPause/onCancel already invalidate this session. A finished transcript must
                    // not be discarded because a TV firmware briefly moves dialog focus.
                    session.result(text);
                }}
                @Override public void onPartialResults(Bundle data){
                    if(!current()||dialog==null)return;
                    String partial=VoiceSearchSession.transcript(first(data==null?null:data.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)));
                    if(!partial.isEmpty())dialog.setMessage(activity.getString(R.string.voice_ready)+"\n\n"+partial+"…");
                    // Partial words are preview only. Only onResults updates the catalog search.
                }
                @Override public void onEvent(int type,Bundle data){}
            });
            dialog=new AlertDialog.Builder(activity).create();dialog.setTitle(R.string.voice_title);dialog.setMessage(activity.getString(R.string.voice_starting));
            dialog.setButton(AlertDialog.BUTTON_NEGATIVE,activity.getString(R.string.voice_cancel),(d,w)->cancel());dialog.setOnCancelListener(d->cancel());
            dialog.setOnKeyListener((window,key,event)->hardwareKey(key));
            dialog.show();dialog.getButton(AlertDialog.BUTTON_NEGATIVE).requestFocus();
            recognizer.startListening(intent());
        }catch(SecurityException error){session.error("permission_denied");}
        catch(RuntimeException error){session.error("unavailable");}
    }
    static String errorCode(int code){
        switch(code){
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:return "permission_denied";
            case SpeechRecognizer.ERROR_AUDIO:return "audio";
            case SpeechRecognizer.ERROR_NETWORK:case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:return "network";
            case SpeechRecognizer.ERROR_NO_MATCH:return "no_match";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:return "no_speech";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:return "busy";
            case SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED:case SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE:return "language";
            case SpeechRecognizer.ERROR_CLIENT:return "client";
            default:return "server";
        }
    }
    @Override public void release(){
        ready=false;systemAway=false;permissionPending=false;recognitionGeneration++;
        handler.removeCallbacks(timeout);
        int request=activityRequest;activityRequest=-1;
        if(request!=-1)try{activity.finishActivity(request);}catch(RuntimeException cleanup){AppDiagnostics.event(activity,"speech.system_cleanup_error");}
        SpeechRecognizer old=recognizer;recognizer=null;
        if(old!=null){try{old.cancel();}catch(RuntimeException ignored){}try{old.destroy();}catch(RuntimeException ignored){}}
        AlertDialog oldDialog=dialog;dialog=null;if(oldDialog!=null)try{oldDialog.dismiss();}catch(RuntimeException cleanup){AppDiagnostics.event(activity,"speech.dialog_cleanup_error");}
        provider=null;
    }
    @Override public void completed(String type,String id,String value){listener.completed(type,id,value);}
}
