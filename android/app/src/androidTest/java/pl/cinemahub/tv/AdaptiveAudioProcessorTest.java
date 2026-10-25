package pl.cinemahub.tv;

import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.util.UnstableApi;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@UnstableApi
@RunWith(AndroidJUnit4.class)
public final class AdaptiveAudioProcessorTest {
    private static short process(AdaptiveAudioProcessor processor,short input)throws Exception{
        ByteBuffer data=ByteBuffer.allocateDirect(2).order(ByteOrder.LITTLE_ENDIAN);
        data.putShort(input).flip();processor.queueInput(data);
        return processor.getOutput().order(ByteOrder.LITTLE_ENDIAN).getShort();
    }
    private static short processProgram(AdaptiveAudioProcessor processor,short sample){
        ByteBuffer data=ByteBuffer.allocateDirect(9600*2).order(ByteOrder.LITTLE_ENDIAN);
        for(int i=0;i<9600;i++)data.putShort(sample);
        data.flip();processor.queueInput(data);
        return processor.getOutput().order(ByteOrder.LITTLE_ENDIAN).getShort(0);
    }
    @Test public void decodedPcmBoostIsAppliedOnTheFirstSampleAndNextPlayback()throws Exception{
        AdaptiveAudioProcessor film1=new AdaptiveAudioProcessor();
        film1.setLevel("manual",200);
        film1.configure(new AudioProcessor.AudioFormat(48000,2,C.ENCODING_PCM_16BIT));film1.flush();
        assertEquals(2000,process(film1,(short)1000));
        film1.setLevel("manual",300);
        assertEquals(3000,process(film1,(short)1000));
        film1.reset();
        AdaptiveAudioProcessor film2=new AdaptiveAudioProcessor();
        film2.setLevel("manual",200);
        film2.configure(new AudioProcessor.AudioFormat(48000,2,C.ENCODING_PCM_16BIT));film2.flush();
        assertEquals(2000,process(film2,(short)1000));
    }
    @Test public void loudSampleIsLimitedAndSilenceIsSilent()throws Exception{
        AdaptiveAudioProcessor processor=new AdaptiveAudioProcessor();
        processor.setLevel("manual",300);
        processor.configure(new AudioProcessor.AudioFormat(44100,2,C.ENCODING_PCM_16BIT));processor.flush();
        assertEquals(0,process(processor,(short)0));
        assertTrue(Math.abs(process(processor,(short)20000))<=32113);
    }
    @Test public void autoAndNormalizerAdjustDecodedAudioToMeasuredLevel()throws Exception{
        for(String mode:new String[]{"auto","normalizer"}){
            AdaptiveAudioProcessor processor=new AdaptiveAudioProcessor();
            processor.setLevel(mode,100);
            processor.configure(new AudioProcessor.AudioFormat(48000,2,C.ENCODING_PCM_16BIT));processor.flush();
            short quiet=0;
            for(int i=0;i<35;i++)quiet=processProgram(processor,(short)650);
            assertTrue(mode+" should amplify quiet programs",quiet>850);
            short loud=0;
            for(int i=0;i<40;i++)loud=processProgram(processor,(short)9600);
            assertTrue(mode+" should attenuate loud programs",loud<9600);
        }
    }
}
