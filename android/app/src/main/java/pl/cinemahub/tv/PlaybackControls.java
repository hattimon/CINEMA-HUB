package pl.cinemahub.tv;
final class PlaybackControls {
    static boolean showMenu(boolean fullscreen,boolean playWhenReady){return !fullscreen||!playWhenReady;}
    static long seekTarget(long position,long duration,long change){long target=Math.max(0,position+change);return duration>0?Math.min(target,Math.max(0,duration-1000)):target;}
}
