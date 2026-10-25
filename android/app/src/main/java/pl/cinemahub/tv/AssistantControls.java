package pl.cinemahub.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;
import java.util.ArrayList;
import java.util.List;

/** Opens Android's reversible, user-confirmed Google app controls. */
final class AssistantControls {
    private static final String[] PACKAGES={"com.google.android.katniss","com.google.android.googlequicksearchbox","com.google.android.tvsearch","com.google.android.apps.googleassistant"};
    private final Activity activity;
    AssistantControls(Activity activity){this.activity=activity;}

    AlertDialog show(){
        PackageManager manager=activity.getPackageManager();
        List<PackageInfo> installed=new ArrayList<>();
        for(String name:PACKAGES)try{installed.add(manager.getPackageInfo(name,PackageManager.GET_DISABLED_COMPONENTS));}catch(PackageManager.NameNotFoundException ignored){}
        if(installed.size()==1)return showPackage(installed.get(0));
        if(installed.isEmpty())return new AlertDialog.Builder(activity).setTitle("Asystent Google")
            .setMessage("Nie znaleziono pakietu Asystenta Google na tym urządzeniu.")
            .setPositiveButton("Zamknij",null).show();
        String[] labels=new String[installed.size()];
        for(int index=0;index<labels.length;index++){PackageInfo info=installed.get(index);labels[index]=info.applicationInfo.loadLabel(manager)+" · "+(info.applicationInfo.enabled?"włączona":"wyłączona")+"\n"+info.packageName;}
        return new AlertDialog.Builder(activity).setTitle("Asystent Google — wybierz aplikację")
            .setItems(labels,(dialog,index)->showPackage(installed.get(index))).setNegativeButton("Zamknij",null).show();
    }

    private AlertDialog showPackage(PackageInfo info){
        String label=info.applicationInfo.loadLabel(activity.getPackageManager()).toString();
        boolean enabled=info.applicationInfo.enabled;
        return new AlertDialog.Builder(activity).setTitle("Asystent Google — ręczne wyłączenie / włączenie")
            .setMessage(label+"\n"+info.packageName+"\nStan: "+(enabled?"włączona":"wyłączona")
                +"\n\nW ustawieniach Androida wybierz „Wyłącz”, aby Asystent nie przejmował mikrofonu pilota. Aby przywrócić Asystenta, otwórz ten sam ekran i wybierz „Włącz”."
                +"\n\nZmiana obowiązuje dla całego urządzenia, również po zamknięciu Cinema Hub. Cinema Hub nie ma uprawnień do automatycznej zmiany tego ustawienia."
                +"\n\nRozpoznawanie w Cinema Hub korzysta z osobnej aplikacji „Rozpoznawanie i synteza mowy” Google. Pozostaw ją włączoną.")
            .setPositiveButton("Otwórz ustawienia Google",(dialog,which)->{
                try{activity.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+info.packageName)));}
                catch(RuntimeException unavailable){new AlertDialog.Builder(activity).setMessage("Android nie udostępnił szczegółów tej aplikacji.").setPositiveButton("Zamknij",null).show();}
            }).setNegativeButton("Zamknij",null).show();
    }
}
