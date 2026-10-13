package pl.cinemahub.tv;
final class RemoteNavigation {
    static String key(int code){
        switch(code){
            case 19:return "ArrowUp";
            case 20:return "ArrowDown";
            case 21:return "ArrowLeft";
            case 22:return "ArrowRight";
            case 23:case 66:case 160:return "Enter";
            default:return null;
        }
    }
    static boolean repeatAllowed(String key,int repeat){return !"Enter".equals(key)||repeat==0;}
}
