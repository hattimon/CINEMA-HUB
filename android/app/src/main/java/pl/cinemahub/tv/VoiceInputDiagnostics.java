package pl.cinemahub.tv;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.speech.SpeechRecognizer;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.util.Arrays;

/** Local, explicitly requested input test. No audio is saved or sent to the server. */
final class VoiceInputDiagnostics {
    static final int AUDIO_PERMISSION=15;
    private final Activity activity;
    private final VoiceSearchController voice;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private AudioRecord recorder;
    private AlertDialog testDialog;
    private TextView status;
    private ProgressBar meter;
    private final short[] samples=new short[3200];
    private int maximum;
    private long stopAt;
    private boolean permissionPending;
    VoiceInputDiagnostics(Activity activity,VoiceSearchController voice){this.activity=activity;this.voice=voice;}
    private String text(String pl,String en){return VoiceSearchServices.text(pl,en);}
    void show(){
        voice.cancel();
        String[] entries={text("Stan mikrofonu i usług mowy","Microphone and speech service status"),text("Sprawdź sygnał mikrofonu (10 sekund)","Check microphone signal (10 seconds)"),text("Uprawnienia Cinema Hub","Cinema Hub permissions"),text("Ostatnie zamknięcia i diagnostyka aplikacji","Recent exits and app diagnostics")};
        new AlertDialog.Builder(activity).setTitle(text("Mikrofon i rozpoznawanie","Microphone and recognition"))
            .setItems(entries,(dialog,index)->{
                if(index==0)showStatus();
                else if(index==1)requestTest();
                else if(index==2)openSettings(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+activity.getPackageName())));
                else if(index==3)showTextReport(text("Diagnostyka aplikacji","App diagnostics"),AppDiagnostics.report(activity));
            })
            .setNegativeButton(text("Zamknij","Close"),null).show();
    }
    private void openSettings(Intent intent){
        try{activity.startActivity(intent);}catch(RuntimeException error){Toast.makeText(activity,text("Ten system nie udostępnia wybranego ekranu ustawień.","This system does not provide that settings screen."),Toast.LENGTH_LONG).show();}
    }
    private void showStatus(){
        StringBuilder report=new StringBuilder();
        boolean allowed=activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED;
        report.append(text("Mikrofon: ","Microphone permission: ")).append(allowed?text("dostęp przyznany","granted"):text("brak zgody","not granted"));
        report.append("\n\n").append(text("Wybrana usługa: ","Selected service: ")).append(VoiceSearchServices.currentLabel(activity));
        report.append("\n").append(text("Dostępne usługi rozpoznawania: ","Available recognition services: ")).append(VoiceSearchServices.available(activity).size());
        report.append("\n").append(text("System zgłasza rozpoznawanie: ","System reports recognition available: ")).append(SpeechRecognizer.isRecognitionAvailable(activity));
        report.append("\n\n").append(text("Wejścia dźwięku widoczne w Androidzie:","Audio inputs visible to Android:"));
        AudioManager audio=(AudioManager)activity.getSystemService(Activity.AUDIO_SERVICE);
        AudioDeviceInfo[] devices=audio==null?new AudioDeviceInfo[0]:audio.getDevices(AudioManager.GET_DEVICES_INPUTS);
        if(devices.length==0)report.append("\n").append(text("Brak widocznych wejść.","No visible inputs."));
        for(AudioDeviceInfo device:devices)report.append("\n• ").append(device.getProductName()).append(" (").append(deviceType(device.getType())).append(")");
        report.append("\n\n").append(text("Lista urządzeń nie potwierdza, że mikrofon pilota jest dostępny dla Cinema Hub. Sprawdź sygnał mikrofonu. Test nie zapisuje nagrań.","The device list does not prove that Cinema Hub can capture the remote microphone. Run the signal test. The test does not save recordings."));
        showTextReport(text("Diagnostyka mikrofonu","Microphone diagnostics"),report);
    }
    private void showTextReport(String title,CharSequence report){
        TextView view=new TextView(activity);view.setText(report);int padding=(int)(24*activity.getResources().getDisplayMetrics().density);view.setPadding(padding,padding,padding,padding);view.setTextSize(17);
        ScrollView scroll=new ScrollView(activity);scroll.addView(view);
        new AlertDialog.Builder(activity).setTitle(title).setView(scroll).setPositiveButton(text("Zamknij","Close"),null).show();
    }
    private static String deviceType(int type){
        switch(type){case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:return "Bluetooth SCO";case AudioDeviceInfo.TYPE_BLE_HEADSET:return "Bluetooth LE";case AudioDeviceInfo.TYPE_BUILTIN_MIC:return "MIC";case AudioDeviceInfo.TYPE_USB_DEVICE:case AudioDeviceInfo.TYPE_USB_HEADSET:return "USB";case AudioDeviceInfo.TYPE_WIRED_HEADSET:return "Headset";default:return "Android "+type;}
    }
    private void requestTest(){
        voice.cancel();
        if(activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){permissionPending=true;activity.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},AUDIO_PERMISSION);return;}
        startTest();
    }
    boolean permissionResult(int code,int[] grants){
        if(code!=AUDIO_PERMISSION)return false;
        boolean requested=permissionPending;permissionPending=false;
        if(requested&&grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED)startTest();
        else if(requested)Toast.makeText(activity,text("Test wymaga dostępu do mikrofonu.","Microphone permission is required for the test."),Toast.LENGTH_LONG).show();
        return true;
    }
    private void startTest(){
        if(activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){Toast.makeText(activity,text("Test wymaga dostępu do mikrofonu.","Microphone permission is required for the test."),Toast.LENGTH_LONG).show();return;}
        stopRecording();maximum=0;
        LinearLayout content=new LinearLayout(activity);content.setOrientation(LinearLayout.VERTICAL);int padding=(int)(24*activity.getResources().getDisplayMetrics().density);content.setPadding(padding,padding,padding,padding);
        status=new TextView(activity);status.setTextSize(17);status.setText(text("Mów do mikrofonu pilota. Pomiar trwa 10 sekund. Dźwięk nie jest zapisywany.","Speak into the remote microphone. Measurement lasts 10 seconds. Audio is not saved."));content.addView(status);
        meter=new ProgressBar(activity,null,android.R.attr.progressBarStyleHorizontal);meter.setMax(32768);content.addView(meter,new LinearLayout.LayoutParams(-1,-2));
        testDialog=new AlertDialog.Builder(activity).setTitle(text("Test sygnału mikrofonu","Microphone signal test")).setView(content).setNegativeButton(text("Zamknij","Close"),(dialog,which)->stopRecording()).setOnCancelListener(dialog->stopRecording()).create();
        testDialog.setOnDismissListener(dialog->{stopRecording();testDialog=null;});testDialog.show();testDialog.getButton(AlertDialog.BUTTON_NEGATIVE).requestFocus();
        try{
            int size=AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT);
            if(size<=0)throw new IllegalStateException("Audio format unavailable");
            recorder=new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,Math.max(size,12800));
            if(recorder.getState()!=AudioRecord.STATE_INITIALIZED)throw new IllegalStateException("Audio input unavailable");
            recorder.startRecording();
            if(recorder.getRecordingState()!=AudioRecord.RECORDSTATE_RECORDING)throw new IllegalStateException("Audio capture unavailable");
            stopAt=SystemClock.elapsedRealtime()+10000;handler.post(measure);
        }catch(SecurityException error){stopRecording();status.setText(text("Android odmówił dostępu do mikrofonu. Sprawdź uprawnienia Cinema Hub.","Android denied microphone access. Check Cinema Hub permissions."));}
        catch(RuntimeException error){stopRecording();status.setText(text("Android nie uruchomił wejścia dźwięku dla Cinema Hub. Sprawdź dostęp do mikrofonu oraz dostępność wejścia w systemie.","Android could not start audio capture for Cinema Hub. Check microphone permission and whether an audio input is available."));}
    }
    private final Runnable measure=new Runnable(){public void run(){
        if(recorder==null)return;
        try{
            int read=recorder.read(samples,0,samples.length,AudioRecord.READ_NON_BLOCKING);
            if(read<0)throw new IllegalStateException("Audio read failed");
            int peak=VoiceInputLevel.peak(samples,read);Arrays.fill(samples,(short)0);maximum=Math.max(maximum,peak);meter.setProgress(peak);
            AudioDeviceInfo route=recorder.getRoutedDevice();
            String input=route==null?text("systemowe wejście","system input"):route.getProductName()+" ("+deviceType(route.getType())+")";
            status.setText(text("Wejście: ","Input: ")+input+text("\nPoziom: ","\nLevel: ")+peak+text("\nNajwyższy poziom: ","\nPeak level: ")+maximum+text("\nPomiar nie rozpoznaje słów i nie zapisuje dźwięku.","\nThis test does not recognize words or save audio."));
            if(SystemClock.elapsedRealtime()>=stopAt){stopRecording();status.append("\n\n"+text("Pomiar zakończony. Poziom zerowy oznacza brak sygnału w tej próbie; nie potwierdza samodzielnie blokady firmware.","Measurement complete. A zero level means no signal in this test; it does not by itself prove a firmware restriction."));}
            else handler.postDelayed(this,100);
        }catch(RuntimeException error){stopRecording();status.setText(text("Odczyt dźwięku został przerwany.","Audio capture was interrupted."));}
    }};
    private void stopRecording(){handler.removeCallbacks(measure);AudioRecord old=recorder;recorder=null;if(old!=null){try{old.stop();}catch(RuntimeException ignored){}try{old.release();}catch(RuntimeException cleanup){AppDiagnostics.event(activity,"audio.test_cleanup_error");}}Arrays.fill(samples,(short)0);}
    void pause(){if(recorder!=null){stopRecording();if(status!=null)status.append("\n\n"+text("Test zatrzymany po przełączeniu aplikacji.","Test stopped when the app lost foreground focus."));}}
    void destroy(){permissionPending=false;stopRecording();if(testDialog!=null)testDialog.dismiss();handler.removeCallbacksAndMessages(null);}
}
