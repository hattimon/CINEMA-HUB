package pl.cinemahub.tv;

public final class VoiceInputLevelTest {
    public static void main(String[] args){
        check(VoiceInputLevel.peak(new short[]{0,0,0},3)==0);
        check(VoiceInputLevel.peak(new short[]{-20,10,0},3)==20);
        check(VoiceInputLevel.peak(new short[]{Short.MIN_VALUE,Short.MAX_VALUE},2)==32768);
        check(VoiceInputLevel.peak(new short[]{3,30000},1)==3);
        check(VoiceInputLevel.peak(new short[]{3},100)==3);
        check(VoiceInputLevel.peak(new short[]{3},-1)==0);
        System.out.println("6 microphone level checks passed.");
    }
    private static void check(boolean value){if(!value)throw new AssertionError("Incorrect microphone level.");}
}
