package pl.cinemahub.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.ResolveInfo;
import android.content.pm.ServiceInfo;
import android.speech.RecognitionService;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.widget.Toast;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.WeakHashMap;

/** Choices belong to Cinema Hub. System assistant/default application settings are never rewritten. */
final class VoiceSearchServices {
    static final class Provider {
        final String key,label;
        final boolean direct;
        final ComponentName component;
        Provider(String key,String label,boolean direct,ComponentName component){this.key=key;this.label=label;this.direct=direct;this.component=component;}
    }
    interface Selection {void selected(Provider provider,boolean remember);}
    private static final Map<Activity,String> once=new WeakHashMap<>();
    static SharedPreferences preferences(Context context){return context.getSharedPreferences("cinema-voice",Context.MODE_PRIVATE);}
    static String text(String pl,String en){return "pl".equals(Locale.getDefault().getLanguage())?pl:en;}
    static List<ServiceInfo> available(Context context){
        List<ServiceInfo> result=new ArrayList<>();
        try{for(ResolveInfo match:context.getPackageManager().queryIntentServices(new Intent(RecognitionService.SERVICE_INTERFACE),0)){
            ServiceInfo service=match.serviceInfo;
            if(service!=null&&service.enabled&&service.exported)result.add(service);
        }}catch(RuntimeException unavailable){AppDiagnostics.event(context,"speech.services.unavailable");}
        return result;
    }
    static List<Provider> providers(Context context,boolean directOnly){
        Map<String,Provider> result=new LinkedHashMap<>();
        for(ServiceInfo service:available(context)){
            ComponentName component=new ComponentName(service.packageName,service.name);
            String label=service.loadLabel(context.getPackageManager()).toString()+text(" — w Cinema Hub"," — inside Cinema Hub");
            Provider provider=new Provider("service:"+component.flattenToString(),label,true,component);result.put(provider.key,provider);
        }
        try{if(SpeechRecognizer.isRecognitionAvailable(context))result.put("default",new Provider("default",text("Domyślna usługa Androida — w Cinema Hub","Android default service — inside Cinema Hub"),true,null));}catch(RuntimeException ignored){}
        if(!directOnly)try{for(ResolveInfo match:context.getPackageManager().queryIntentActivities(new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH),0)){
            ActivityInfo info=match.activityInfo;if(info==null||!info.enabled||!info.exported)continue;
            ComponentName component=new ComponentName(info.packageName,info.name);
            String label=match.loadLabel(context.getPackageManager()).toString()+text(" — okno Androida"," — Android window");
            Provider provider=new Provider("activity:"+component.flattenToString(),label,false,component);result.put(provider.key,provider);
        }}catch(RuntimeException unavailable){AppDiagnostics.event(context,"speech.activities.unavailable");}
        // Some TV remotes only expose their microphone to the system IME (e.g. Gboard).
        // This choice opens the ordinary search field; dictation is started on the keyboard.
        if(!directOnly)result.put("keyboard",new Provider("keyboard",text("Klawiatura Androida (np. Gboard) — dyktowanie z klawiatury","Android keyboard (e.g. Gboard) — keyboard dictation"),false,null));
        return new ArrayList<>(result.values());
    }
    static Provider find(List<Provider> providers,String key){if(key!=null)for(Provider provider:providers)if(provider.key.equals(key))return provider;return null;}
    static Provider preferred(Context context,List<Provider> providers){return find(providers,preferences(context).getString("provider",""));}
    /** Explicit standalone recognizer confirmed on Magcubic; never falls back to Assistant. */
    static Provider automatic(Context context){
        for(Provider provider:providers(context,true))if(provider.component!=null&&"com.google.android.tts".equals(provider.component.getPackageName()))return provider;
        return null;
    }
    static Provider takeOnce(Activity activity,List<Provider> providers){return find(providers,once.remove(activity));}
    static void remember(Context context,Provider provider){
        // An earlier "just once" must not override a newer "always" choice.
        if(context instanceof Activity)once.remove((Activity)context);
        preferences(context).edit().putString("provider",provider.key).remove("service").remove("direct").apply();
    }
    static void reset(Context context){preferences(context).edit().remove("provider").remove("service").remove("direct").apply();if(context instanceof Activity)once.remove((Activity)context);}
    static String currentLabel(Context context){Provider provider=automatic(context);return provider==null?text("Rozpoznawanie i synteza mowy Google — usługa niedostępna","Google Speech Recognition & Synthesis — service unavailable"):provider.label;}
    static AlertDialog pick(Activity activity,List<Provider> providers,Selection selection,Runnable cancelled){
        if(providers.isEmpty())return null;
        String[] labels=new String[providers.size()];for(int index=0;index<providers.size();index++)labels[index]=providers.get(index).label;
        int[] chosen={0};Provider preferred=preferred(activity,providers);if(preferred!=null)chosen[0]=providers.indexOf(preferred);
        AlertDialog dialog=new AlertDialog.Builder(activity).setTitle(text("Wybierz rozpoznawanie mowy","Choose speech recognition"))
            .setSingleChoiceItems(labels,chosen[0],(window,index)->chosen[0]=index)
            .setPositiveButton(text("Tylko raz","Just once"),null)
            .setNeutralButton(text("Zawsze","Always"),null)
            .setNegativeButton(text("Anuluj","Cancel"),(window,which)->cancelled.run())
            .setOnCancelListener(window->cancelled.run()).create();
        dialog.setOnShowListener(window->{
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view->{Provider provider=providers.get(chosen[0]);dialog.dismiss();selection.selected(provider,false);});
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(view->{Provider provider=providers.get(chosen[0]);remember(activity,provider);dialog.dismiss();selection.selected(provider,true);});
            dialog.getListView().setSelection(chosen[0]);dialog.getListView().requestFocus();
        });dialog.show();return dialog;
    }
    static AlertDialog choose(Activity activity){
        List<Provider> providers=providers(activity,false);
        if(providers.isEmpty()){Toast.makeText(activity,text("Brak dostępnej usługi rozpoznawania mowy.","No speech recognition service is available."),Toast.LENGTH_LONG).show();return null;}
        return pick(activity,providers,(provider,remember)->{
            if(!remember)once.put(activity,provider.key);
            Toast.makeText(activity,remember?text("Wybór zapamiętany w Cinema Hub.","Choice saved in Cinema Hub."):text("Wybór na najbliższe uruchomienie mikrofonu.","Choice applies to the next microphone request only."),Toast.LENGTH_LONG).show();
        },()->{});
    }
}
