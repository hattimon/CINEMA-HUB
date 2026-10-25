package pl.cinemahub.tv;

/** Single, user-initiated request. All calls run on the Activity main thread. */
public final class VoiceSearchSession {
    public enum State { IDLE, SYSTEM, PERMISSION, LISTENING }
    public interface Host {
        boolean launchSystem();
        boolean recognitionAvailable();
        boolean audioPermission();
        void requestPermission();
        void listen();
        void release();
        void completed(String type,String requestId,String value);
    }
    private final Host host;
    private State state=State.IDLE;
    private String requestId="";
    public VoiceSearchSession(Host host){this.host=host;}
    public State state(){return state;}
    public boolean active(){return state!=State.IDLE;}
    public String requestId(){return requestId;}
    public static boolean validId(String id){return id!=null&&id.matches("[a-f0-9]{32}");}
    public static String transcript(String value){
        if(value==null)return "";
        String text=value.replaceAll("[\\p{Cntrl}\\s]+"," ").trim();
        return text.length()<=500?text:"";
    }
    public void start(String id){
        start(id,false);
    }
    public void start(String id,boolean direct){
        if(active()||!validId(id))return;
        requestId=id;state=State.SYSTEM;
        if(!direct&&host.launchSystem())return;
        direct();
    }
    private void direct(){
        if(!host.recognitionAvailable()){error("unavailable");return;}
        if(!host.audioPermission()){state=State.PERMISSION;host.requestPermission();return;}
        state=State.LISTENING;host.listen();
    }
    public void permissionResult(boolean granted){if(state==State.PERMISSION){if(granted){state=State.LISTENING;host.listen();}else error("permission_denied");}}
    public void result(String value){if(!active())return;String text=transcript(value);if(text.isEmpty())error("no_match");else finish("voice_search_result",text);}
    public void error(String code){if(active())finish("voice_search_error",code);}
    public void cancel(){if(active())finish("voice_search_cancelled","");}
    private void finish(String type,String value){String id=requestId;state=State.IDLE;requestId="";host.release();host.completed(type,id,value);}
}
