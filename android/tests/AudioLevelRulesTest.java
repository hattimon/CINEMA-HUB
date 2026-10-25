package pl.cinemahub.tv;

public final class AudioLevelRulesTest {
    private static int checks;
    private static void check(boolean value){checks++;if(!value)throw new AssertionError("audio level check "+checks);}
    public static void main(String[] args){
        for(int percent:new int[]{100,150,200,250,300})check(AudioLevelRules.validBoost(percent));
        check(!AudioLevelRules.validBoost(400));
        check(AudioLevelRules.validMode("manual")&&AudioLevelRules.validMode("auto")&&AudioLevelRules.validMode("normalizer"));
        check(AudioLevelRules.gain("manual",200,0.02)==2);
        check(AudioLevelRules.gain("manual",300,0.02)==3);
        check(AudioLevelRules.gain("auto",100,0.08)==1);
        check(AudioLevelRules.gain("auto",100,0.02)>1);
        check(AudioLevelRules.gain("auto",100,0.28)<1);
        check(AudioLevelRules.gain("auto",100,0)==1);
        check(AudioLevelRules.gain("normalizer",100,0.02)>1);
        check(AudioLevelRules.gain("normalizer",100,0.2)<1);
        System.out.println("PASS: "+checks+" audio mode, range and level rules checks");
    }
}
