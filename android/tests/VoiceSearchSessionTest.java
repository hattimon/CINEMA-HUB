package pl.cinemahub.tv;

public final class VoiceSearchSessionTest {
    private static int checks;
    private static final String ID="0123456789abcdef0123456789abcdef",OTHER="abcdef0123456789abcdef0123456789";
    private static void expect(boolean value){checks++;if(!value)throw new AssertionError("Voice check "+checks);}
    private static final class Fake implements VoiceSearchSession.Host {
        boolean system=true,available=true,permission=true;
        int launches,permissions,listens,releases,events;
        String type,id,value;
        public boolean launchSystem(){launches++;return system;}
        public boolean recognitionAvailable(){return available;}
        public boolean audioPermission(){return permission;}
        public void requestPermission(){permissions++;}
        public void listen(){listens++;}
        public void release(){releases++;}
        public void completed(String type,String id,String value){events++;this.type=type;this.id=id;this.value=value;}
    }
    public static void main(String[] args){
        Fake f=new Fake();VoiceSearchSession s=new VoiceSearchSession(f);
        expect(!s.active());s.start("not-an-id");expect(!s.active()&&f.launches==0);
        expect(!VoiceSearchSession.validId(null));expect(!VoiceSearchSession.validId(ID+"x"));
        s.start(ID);expect(s.state()==VoiceSearchSession.State.SYSTEM);expect(f.permissions==0&&f.listens==0);
        s.start(ID);s.start(OTHER);expect(f.launches==1);
        s.result("  Pingwiny z\nMadagaskaru  ");expect(f.type.equals("voice_search_result")&&f.id.equals(ID)&&f.value.equals("Pingwiny z Madagaskaru"));
        expect(!s.active()&&f.releases==1);s.result("Spóźniony wynik");s.cancel();s.error("audio");expect(f.events==1&&f.releases==1);
        s.start(OTHER);s.cancel();expect(f.type.equals("voice_search_cancelled")&&f.releases==2);
        f.system=false;f.available=false;s.start(ID);expect(f.type.equals("voice_search_error")&&f.value.equals("unavailable"));expect(f.permissions==0&&f.releases==3);
        f.available=true;f.permission=false;s.start(ID);expect(s.state()==VoiceSearchSession.State.PERMISSION&&f.permissions==1&&f.listens==0);
        s.permissionResult(false);expect(f.value.equals("permission_denied")&&!s.active()&&f.releases==4);
        s.start(ID);s.permissionResult(true);expect(s.state()==VoiceSearchSession.State.LISTENING&&f.listens==1);
        s.result("");expect(f.value.equals("no_match")&&f.releases==5);
        s.start(ID);s.cancel();s.permissionResult(true);expect(f.listens==1&&f.type.equals("voice_search_cancelled"));
        f.permission=true;f.system=true;s.start(ID,true);expect(s.state()==VoiceSearchSession.State.LISTENING&&f.listens==2);
        s.error("network");expect(f.value.equals("network")&&f.releases==7);
        for(String code:new String[]{"audio","no_speech","busy","language","timeout","client","server"}){
            s.start(ID,true);s.error(code);expect(f.value.equals(code)&&!s.active());
        }
        s.start(ID);s.result(null);expect(f.value.equals("no_match"));
        s.start(ID);s.result("x".repeat(501));expect(f.value.equals("no_match"));
        expect(VoiceSearchSession.transcript("<script> & \"film\"").equals("<script> & \"film\""));
        for(int i=0;i<30;i++){s.start(ID,true);s.cancel();}
        expect(f.events==f.releases);expect(!s.active());
        expect(ServerAddress.owns("https://kino.example/","https://kino.example"));
        expect(!ServerAddress.owns("https://kino.example/","http://kino.example"));
        expect(!ServerAddress.owns("https://kino.example/","https://kino.example.evil.test"));
        expect(!ServerAddress.owns("https://kino.example/","https://kino.example:9999"));
        expect(!ServerAddress.owns("https://kino.example/","https://user@kino.example"));
        s.choose(ID);expect(s.state()==VoiceSearchSession.State.CHOOSING&&s.active());
        int beforeChoice=f.events;
        s.result("Wynik przed wyborem");expect(s.state()==VoiceSearchSession.State.CHOOSING&&f.events==beforeChoice);
        s.choose("b".repeat(32));expect(s.requestId().equals(ID));
        s.selected(true);expect(s.state()==VoiceSearchSession.State.LISTENING);
        s.cancel();s.selected(true);expect(!s.active()&&f.type.equals("voice_search_cancelled"));
        s.choose(ID);s.cancel();expect(!s.active()&&f.type.equals("voice_search_cancelled"));
        s.choose("bad");expect(!s.active());
        s.choose(ID);s.keyboard();expect(!s.active()&&f.type.equals("voice_search_keyboard")&&f.id.equals(ID));
        int keyboardEvents=f.events;s.keyboard();s.result("Spóźniony tekst");expect(f.events==keyboardEvents);
        f.permission=false;s.start(ID,true);expect(s.state()==VoiceSearchSession.State.PERMISSION);
        beforeChoice=f.events;s.result("Wynik bez uprawnienia");expect(f.events==beforeChoice&&s.state()==VoiceSearchSession.State.PERMISSION);
        s.cancel();s.permissionResult(true);expect(!s.active());
        System.out.println("PASS: "+checks+" voice state, permission, origin, cancellation and release checks");
    }
}
