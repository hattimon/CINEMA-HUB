package pl.cinemahub.tv;

/** Level decisions are based on decoded PCM RMS (dBFS), not the device volume slider. */
final class AudioLevelRules {
    static final String MANUAL="manual", AUTO="auto", NORMALIZER="normalizer";
    private AudioLevelRules(){}

    static boolean validMode(String mode){return MANUAL.equals(mode)||AUTO.equals(mode)||NORMALIZER.equals(mode);}
    static boolean validBoost(int boost){return boost==100||boost==150||boost==200||boost==250||boost==300;}

    static double gain(String mode,int boost,double rms){
        if(MANUAL.equals(mode))return Math.max(1,Math.min(3,boost/100.0));
        if(!Double.isFinite(rms)||rms<0.001)return 1;
        if(AUTO.equals(mode)){
            if(rms<0.045)return Math.min(3,0.075/rms);
            if(rms>0.16)return Math.max(0.33,0.12/rms);
            return 1;
        }
        if(NORMALIZER.equals(mode))return Math.max(0.33,Math.min(3,0.085/rms));
        return 1;
    }
}
