package pl.cinemahub.tv;

import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.audio.BaseAudioProcessor;
import androidx.media3.common.util.UnstableApi;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/** Changes actual decoded PCM samples, including when each new film gets a new audio session. */
@UnstableApi
final class AdaptiveAudioProcessor extends BaseAudioProcessor {
    private volatile String mode=AudioLevelRules.MANUAL;
    private volatile int boost=100;
    private double gain=1;
    private double measuredRms=0;
    private boolean hasMeasurement;
    private volatile boolean supported;

    void setLevel(String mode,int boost){
        if(!AudioLevelRules.validMode(mode)||!AudioLevelRules.validBoost(boost))return;
        this.mode=mode;this.boost=boost;
    }
    boolean supportsCurrentAudio(){return supported;}

    @Override protected AudioProcessor.AudioFormat onConfigure(AudioProcessor.AudioFormat input){
        supported=input.encoding==C.ENCODING_PCM_16BIT||input.encoding==C.ENCODING_PCM_FLOAT;
        return supported?input:AudioProcessor.AudioFormat.NOT_SET;
    }
    @Override protected void onFlush(){gain=1;measuredRms=0;hasMeasurement=false;}
    @Override protected void onReset(){supported=false;onFlush();}

    @Override public void queueInput(ByteBuffer input){
        int bytes=input.remaining();
        if(bytes==0)return;
        boolean floating=inputAudioFormat.encoding==C.ENCODING_PCM_FLOAT;
        int sampleBytes=floating?4:2;
        int samples=bytes/sampleBytes;
        if(samples==0){input.position(input.limit());return;}
        ByteBuffer source=input.slice().order(ByteOrder.LITTLE_ENDIAN);
        double squareSum=0,peak=0;
        for(int i=0;i<samples;i++){
            double value=floating?source.getFloat():source.getShort()/32768.0;
            if(!Double.isFinite(value))value=0;
            squareSum+=value*value;peak=Math.max(peak,Math.abs(value));
        }
        double rms=Math.sqrt(squareSum/samples);
        double seconds=samples/(double)Math.max(1,inputAudioFormat.sampleRate*inputAudioFormat.channelCount);
        // Track program loudness over several seconds, ignoring digital silence.
        if(rms>0.001){
            double weight=1-Math.exp(-seconds/2.0);
            measuredRms=hasMeasurement?measuredRms*(1-weight)+rms*weight:rms;
            hasMeasurement=true;
        }
        double desired=AudioLevelRules.gain(mode,boost,measuredRms);
        if(AudioLevelRules.MANUAL.equals(mode))gain=desired;
        else{
            double time=desired<gain?0.35:2.0;
            double smoothing=1-Math.exp(-seconds/time);
            gain+=(desired-gain)*smoothing;
        }
        // A fast peak ceiling prevents accidental clipping before the slow leveling settles.
        double applied=peak>0?Math.min(gain,0.98/peak):gain;
        ByteBuffer output=replaceOutputBuffer(bytes).order(ByteOrder.LITTLE_ENDIAN);
        source.rewind();
        for(int i=0;i<samples;i++){
            if(floating){float value=source.getFloat();output.putFloat(Float.isFinite(value)?(float)Math.max(-0.98,Math.min(0.98,value*applied)):0f);}
            else{int value=source.getShort();output.putShort((short)Math.max(-32767,Math.min(32767,Math.round(value*applied))));}
        }
        input.position(input.position()+samples*sampleBytes);
        output.flip();
    }
}
