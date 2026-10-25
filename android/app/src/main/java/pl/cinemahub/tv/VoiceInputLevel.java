package pl.cinemahub.tv;

/** A transient level measurement, never a recording or a speech-recognition result. */
public final class VoiceInputLevel {
    private VoiceInputLevel(){}
    public static int peak(short[] samples,int count){
        int peak=0;
        for(int index=0;index<Math.min(Math.max(count,0),samples.length);index++)peak=Math.max(peak,Math.abs((int)samples[index]));
        return peak;
    }
}
