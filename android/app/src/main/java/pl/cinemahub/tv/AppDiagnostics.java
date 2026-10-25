package pl.cinemahub.tv;

import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import java.text.DateFormat;
import java.util.Date;
import java.util.List;

/** Private bounded diagnostics. No audio, transcripts, credentials, URLs or server uploads. */
final class AppDiagnostics {
    private static boolean installed;
    private static SharedPreferences preferences(Context context){return context.getSharedPreferences("cinema-diagnostics",Context.MODE_PRIVATE);}
    static synchronized void install(Context context){
        if(installed)return;installed=true;
        Context application=context.getApplicationContext();
        Thread.UncaughtExceptionHandler previous=Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread,error)->{
            try{StringBuilder report=new StringBuilder(error.getClass().getSimpleName());int count=0;for(StackTraceElement frame:error.getStackTrace()){if(count++==8)break;report.append("\n").append(frame.getClassName()).append('.').append(frame.getMethodName()).append(':').append(frame.getLineNumber());}preferences(application).edit().putString("javaCrash",report.toString()).putLong("javaCrashAt",System.currentTimeMillis()).commit();}catch(Throwable unableToSave){}
            if(previous!=null)previous.uncaughtException(thread,error);
        });
    }
    static void event(Context context,String event){try{preferences(context).edit().putString("voiceEvent",event).putLong("voiceEventAt",System.currentTimeMillis()).apply();}catch(RuntimeException ignored){}}
    static String report(Context context){
        StringBuilder result=new StringBuilder();SharedPreferences saved=preferences(context);
        String crash=saved.getString("javaCrash","");if(!crash.isEmpty())result.append(VoiceSearchServices.text("Ostatni zapisany wyjątek aplikacji:\n","Last recorded app exception:\n")).append(DateFormat.getDateTimeInstance().format(new Date(saved.getLong("javaCrashAt",0)))).append("\n").append(crash).append("\n\n");
        String event=saved.getString("voiceEvent","");if(!event.isEmpty())result.append(VoiceSearchServices.text("Ostatni etap rozpoznawania: ","Last voice stage: ")).append(event).append("\n\n");
        ActivityManager manager=(ActivityManager)context.getSystemService(Context.ACTIVITY_SERVICE);
        if(manager!=null){ActivityManager.MemoryInfo memory=new ActivityManager.MemoryInfo();manager.getMemoryInfo(memory);result.append(VoiceSearchServices.text("Dostępna pamięć RAM: ","Available RAM: ")).append(memory.availMem/1024/1024).append(" MB\n\n");}
        if(Build.VERSION.SDK_INT>=30&&manager!=null)try{
            List<ApplicationExitInfo> exits=manager.getHistoricalProcessExitReasons(context.getPackageName(),0,3);
            for(ApplicationExitInfo exit:exits)result.append(DateFormat.getDateTimeInstance().format(new Date(exit.getTimestamp()))).append(" — ").append(reason(exit.getReason())).append("\n");
            if(exits.isEmpty())result.append(VoiceSearchServices.text("System nie zapisał poprzednich zakończeń procesu.","The system has no previous process exit records."));
        }catch(RuntimeException|LinkageError unavailable){result.append(VoiceSearchServices.text("Ten system nie udostępnia historii zakończeń procesu.","This system does not provide process exit history."));}
        return result.toString();
    }
    private static String reason(int reason){
        switch(reason){
            case ApplicationExitInfo.REASON_LOW_MEMORY:return VoiceSearchServices.text("Android zwolnił pamięć","Android reclaimed memory");
            case ApplicationExitInfo.REASON_CRASH:return VoiceSearchServices.text("Wyjątek aplikacji","App exception");
            case ApplicationExitInfo.REASON_CRASH_NATIVE:return VoiceSearchServices.text("Awaria kodu natywnego","Native crash");
            case ApplicationExitInfo.REASON_ANR:return VoiceSearchServices.text("Aplikacja nie odpowiadała","App not responding");
            case ApplicationExitInfo.REASON_USER_REQUESTED:return VoiceSearchServices.text("Zamknięcie przez użytkownika lub aktualizację","User closure or update");
            case ApplicationExitInfo.REASON_PACKAGE_UPDATED:return VoiceSearchServices.text("Aktualizacja aplikacji","App update");
            default:return VoiceSearchServices.text("Inna przyczyna systemowa (","Other system reason (")+reason+")";
        }
    }
}
