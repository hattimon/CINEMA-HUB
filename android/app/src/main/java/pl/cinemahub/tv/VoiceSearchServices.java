package pl.cinemahub.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ResolveInfo;
import android.content.pm.ServiceInfo;
import android.speech.RecognitionService;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Only the voice provider used by Cinema Hub changes; Android defaults are untouched. */
final class VoiceSearchServices {
    static SharedPreferences preferences(Context context){return context.getSharedPreferences("cinema-voice",Context.MODE_PRIVATE);}
    static String text(String pl,String en){return "pl".equals(Locale.getDefault().getLanguage())?pl:en;}
    static List<ServiceInfo> available(Context context){
        List<ServiceInfo> result=new ArrayList<>();
        for(ResolveInfo match:context.getPackageManager().queryIntentServices(new Intent(RecognitionService.SERVICE_INTERFACE),0)){
            ServiceInfo service=match.serviceInfo;
            if(service!=null&&service.enabled&&service.exported)result.add(service);
        }
        return result;
    }
    static ComponentName selected(Context context){
        String saved=preferences(context).getString("service","");
        ComponentName component=ComponentName.unflattenFromString(saved);
        if(component!=null)for(ServiceInfo service:available(context))if(component.equals(new ComponentName(service.packageName,service.name)))return component;
        return null;
    }
    static boolean direct(Context context){return preferences(context).getBoolean("direct",false);}
    static String label(Context context,ServiceInfo service){return service.loadLabel(context.getPackageManager()).toString();}
    static String currentLabel(Context context){
        ComponentName component=selected(context);
        if(component!=null)for(ServiceInfo service:available(context))if(component.equals(new ComponentName(service.packageName,service.name)))return label(context,service);
        return text("Domyślna usługa Androida","Android default speech service");
    }
    static void choose(Activity activity){
        List<ServiceInfo> services=available(activity);
        List<String> labels=new ArrayList<>();
        labels.add(text("Systemowe okno — wybierz aplikację ponownie","System voice window — choose an app again"));
        labels.add(text("Usługa w Cinema Hub — domyślna","Recognition in Cinema Hub — default service"));
        for(ServiceInfo service:services)labels.add(text("Usługa w Cinema Hub: ","Recognition in Cinema Hub: ")+label(activity,service)+"\n"+service.packageName);
        SharedPreferences saved=preferences(activity);
        ComponentName selected=selected(activity);
        int initial=direct(activity)?1:0;
        if(selected!=null)for(int index=0;index<services.size();index++)if(selected.equals(new ComponentName(services.get(index).packageName,services.get(index).name)))initial=index+2;
        new AlertDialog.Builder(activity).setTitle(text("Usługa wyszukiwania głosowego","Voice search service"))
            .setSingleChoiceItems(labels.toArray(new String[0]),initial,(dialog,index)->{
                SharedPreferences.Editor edit=saved.edit().putBoolean("direct",index!=0);
                if(index<2)edit.remove("service");else{ServiceInfo service=services.get(index-2);edit.putString("service",new ComponentName(service.packageName,service.name).flattenToString());}
                edit.apply();dialog.dismiss();
            }).setNegativeButton(text("Anuluj","Cancel"),null).show();
    }
}
