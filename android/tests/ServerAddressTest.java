package pl.cinemahub.tv;
public final class ServerAddressTest {
    private static int checks;
    private static void expect(boolean value){checks++;if(!value)throw new AssertionError("Check "+checks);}
    public static void main(String[] args) {
        expect(ServerAddress.normalize("192.168.11.20:9999").equals(ServerAddress.DEFAULT));
        expect(ServerAddress.normalize("HTTPS://KINO.EXAMPLE.ORG:8443/").equals("https://kino.example.org:8443/"));
        expect(ServerAddress.normalize("http://[::1]:9999/").equals("http://[::1]:9999/"));
        for(String invalid:new String[]{"javascript:alert(1)","file:///data/","ftp://server/","http://user:password@server/","https://server/?token=x","https://server/#x","http://server:0","http://server:99999","https://server/path/","", "http://server\\@other/"}){try{ServerAddress.normalize(invalid);throw new AssertionError(invalid);}catch(IllegalArgumentException expected){checks++;}}
        expect(ServerAddress.owns(ServerAddress.DEFAULT,"http://192.168.11.20:9999/connect"));
        expect(!ServerAddress.owns(ServerAddress.DEFAULT,"http://192.168.11.20:8090/"));
        expect(!ServerAddress.owns(ServerAddress.DEFAULT,"http://192.168.11.20.evil.invalid:9999/"));
        expect(!ServerAddress.owns(ServerAddress.DEFAULT,"http://evil@192.168.11.20:9999/"));
        String id="00112233445566778899aabbccddeeff";
        expect(ServerAddress.isDownload(ServerAddress.DEFAULT,ServerAddress.DEFAULT+"api/downloads/"+id+"/file"));
        expect(!ServerAddress.isDownload(ServerAddress.DEFAULT,ServerAddress.DEFAULT+"api/downloads/"+id+"/file?redirect=x"));
        expect(!ServerAddress.isDownload(ServerAddress.DEFAULT,"https://filman.cc/film.mp4"));
        expect(!ServerAddress.isDownload(ServerAddress.DEFAULT,ServerAddress.DEFAULT+"api/downloads/../file"));
        expect(ServerAddress.isPlaybackId(id));expect(!ServerAddress.isPlaybackId("../../private"));
        System.out.println("PASS: "+checks+" client address, origin and playback checks");
    }
}
