package pl.cinemahub.tv;

import java.util.Locale;

public final class VoiceSearchLanguageTest {
    private static int checks;
    private static void expect(boolean value){checks++;if(!value)throw new AssertionError("Language check "+checks);}
    public static void main(String[] args){
        Locale polish=Locale.forLanguageTag("pl-PL"),english=Locale.forLanguageTag("en-GB");
        expect(VoiceSearchLanguage.resolve("system",polish).equals("pl-PL"));
        expect(VoiceSearchLanguage.resolve("system",english).equals("en-GB"));
        expect(VoiceSearchLanguage.resolve(null,english).equals("en-GB"));
        expect(VoiceSearchLanguage.resolve("",english).equals("en-GB"));
        expect(VoiceSearchLanguage.device(Locale.ROOT).equals("en-US"));
        expect(VoiceSearchLanguage.device(null).equals("en-US"));
        expect(VoiceSearchLanguage.resolve("EN-us",polish).equals("en-US"));
        expect(VoiceSearchLanguage.resolve("zh-Hant-TW",polish).equals("zh-Hant-TW"));
        for(String tag:new String[]{"pl-PL","en-US","en-GB","de-DE","fr-FR","es-MX","pt-BR","ar-SA","ja-JP","ko-KR","hi-IN","uk-UA","ru-RU","th-TH"})expect(VoiceSearchLanguage.resolve(tag,english).equals(tag));
        for(String invalid:new String[]{"und","en_US","en--US","<script>","pl-PL\n","123","x-private","en-123456789","a".repeat(65),"system-other-"})expect(VoiceSearchLanguage.resolve(invalid,english)==null);
        for(String title:new String[]{"The Lord of the Rings","千と千尋の神隠し","기생충","حكاية لعبة","Амели","Le Fabuleux Destin d’Amélie Poulain"})expect(VoiceSearchSession.transcript(title).equals(title));
        System.out.println("PASS: "+checks+" language selection, BCP 47 and international title checks");
    }
}
