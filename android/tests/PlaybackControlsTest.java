package pl.cinemahub.tv;
public final class PlaybackControlsTest {
    private static int checks;
    private static void expect(boolean value){checks++;if(!value)throw new AssertionError("Check "+checks);}
    public static void main(String[] args){
        expect(PlaybackControls.showMenu(false,true));
        expect(PlaybackControls.showMenu(false,false));
        expect(PlaybackControls.showMenu(true,false));
        expect(!PlaybackControls.showMenu(true,true));
        expect(!PlaybackControls.needsPicturePipelineRestart(1,1));
        expect(PlaybackControls.needsPicturePipelineRestart(2,1));
        expect(PlaybackControls.needsPicturePipelineRestart(3,1));
        expect(PlaybackControls.seekTarget(5000,130000,-10000)==0);
        expect(PlaybackControls.seekTarget(50000,130000,-10000)==40000);
        expect(PlaybackControls.seekTarget(125000,130000,10000)==129000);
        expect(PlaybackControls.seekTarget(50000,-1,10000)==60000);
        expect(PlaybackControls.seekTarget(0,500,10000)==0);
        expect(PlaybackControls.seekTarget(1800000,3600000,0)==1800000);
        expect(PlaybackControls.seekTarget(3000000,3600000,0)==3000000);
        expect(PlaybackControls.seekTarget(4000000,3600000,0)==3599000);
        System.out.println("PASS: "+checks+" fullscreen pause and seek checks");
    }
}
