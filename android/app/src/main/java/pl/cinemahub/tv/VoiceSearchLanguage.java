package pl.cinemahub.tv;

import java.util.Locale;

/** BCP 47 language selection; service support is still determined by Android. */
public final class VoiceSearchLanguage {
    private VoiceSearchLanguage(){}
    public static String device(Locale locale){
        if(locale==null||locale.getLanguage().isEmpty()||locale.getLanguage().equals("und"))return "en-US";
        return locale.toLanguageTag();
    }
    public static String resolve(String requested,Locale device){
        if(requested==null||requested.isEmpty()||requested.equals("system"))return device(device);
        if(requested.length()>64||!requested.matches("[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*"))return null;
        try{
            Locale locale=new Locale.Builder().setLanguageTag(requested).build();
            if(locale.getLanguage().isEmpty()||locale.getLanguage().equals("und"))return null;
            return locale.toLanguageTag();
        }catch(IllegalArgumentException error){return null;}
    }
}
