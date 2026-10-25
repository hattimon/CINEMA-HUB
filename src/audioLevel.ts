import {AudioLevelTracker,signalStats,type AudioLevelOptions} from '../server/audio-level.mjs';

/** A single graph per video element; reused across sources and option changes. */
export class BrowserAudioLevel {
  private readonly context:AudioContext;
  private readonly source:MediaElementAudioSourceNode;
  private readonly gain:GainNode;
  private readonly limiter:DynamicsCompressorNode;
  private readonly ceiling:WaveShaperNode;
  private readonly splitter:ChannelSplitterNode;
  private readonly meters:AnalyserNode[];
  private readonly samples:Float32Array<ArrayBuffer>[];
  private readonly tracker=new AudioLevelTracker();
  private options:AudioLevelOptions={mode:'manual',boost:100,targetDb:-21};
  private timer:ReturnType<typeof setInterval>|undefined;
  private mediaKey='';
  private lastTime=0;
  private destroyed=false;

  constructor(private readonly video:HTMLVideoElement){
    this.context=new AudioContext();
    try{
      this.gain=this.context.createGain();
      this.limiter=this.context.createDynamicsCompressor();
      // A 0 dB threshold avoids the compressor's automatic make-up gain below
      // full scale; the final ceiling still keeps samples below 0.98.
      this.limiter.threshold.value=0;this.limiter.knee.value=0;this.limiter.ratio.value=20;this.limiter.attack.value=0.003;this.limiter.release.value=0.2;
      this.ceiling=this.context.createWaveShaper();
      const curve=new Float32Array(65537);for(let index=0;index<curve.length;index++)curve[index]=Math.max(-0.98,Math.min(0.98,index*2/(curve.length-1)-1));
      this.ceiling.curve=curve;
      this.splitter=this.context.createChannelSplitter(8);
      this.meters=Array.from({length:8},()=>{const meter=this.context.createAnalyser();meter.fftSize=2048;return meter;});
      this.samples=this.meters.map(meter=>new Float32Array(meter.fftSize));
      this.source=this.context.createMediaElementSource(video);
      this.source.connect(this.gain);this.gain.connect(this.limiter);this.limiter.connect(this.ceiling);this.ceiling.connect(this.context.destination);
      this.source.connect(this.splitter);this.meters.forEach((meter,index)=>this.splitter.connect(meter,index));
    }catch(error){void this.context.close().catch(()=>{});throw error;}
    video.addEventListener('playing',this.playing);video.addEventListener('pause',this.pause);video.addEventListener('ended',this.pause);
  }

  configure(options:AudioLevelOptions,mediaKey:string){
    const changed=mediaKey!==this.mediaKey;this.options=options;this.mediaKey=mediaKey;
    if(changed){const initial=this.tracker.reset(options);this.setGain(initial,true);}
    else if(options.mode==='manual')this.setGain(this.tracker.update(0,0.05,options),true);
    // Exact 100% remains transparent, including the native video volume control.
    this.limiter.ratio.value=options.mode==='manual'&&options.boost===100?1:20;
    this.ceiling.curve=options.mode==='manual'&&options.boost===100?null:this.ceiling.curve||this.peakCurve();
    if(!this.video.paused)this.playing();
  }
  private peakCurve(){const curve=new Float32Array(65537);for(let index=0;index<curve.length;index++)curve[index]=Math.max(-0.98,Math.min(0.98,index*2/(curve.length-1)-1));return curve;}
  private setGain(value:number,immediate=false){const now=this.context.currentTime;this.gain.gain.cancelScheduledValues(now);if(immediate)this.gain.gain.setValueAtTime(value,now);else this.gain.gain.setTargetAtTime(value,now,0.04);}
  resume=()=>{if(!this.destroyed&&this.context.state==='suspended')void this.context.resume().catch(()=>{});};
  private playing=()=>{this.resume();if(this.options.mode==='manual'){this.pause();return;}if(this.timer===undefined){this.lastTime=this.context.currentTime;this.timer=setInterval(this.measure,50);}};
  private pause=()=>{if(this.timer!==undefined){clearInterval(this.timer);this.timer=undefined;}};
  private measure=()=>{
    if(this.destroyed||this.context.state!=='running'||this.video.paused||this.video.ended||this.video.muted||this.video.volume<=0)return;
    const now=this.context.currentTime,seconds=now-this.lastTime;this.lastTime=now;
    if(this.options.mode==='manual')return;
    this.meters.forEach((meter,index)=>meter.getFloatTimeDomainData(this.samples[index]));
    // Undo the media element's user volume only for measurement, never for output.
    const rms=signalStats(this.samples).rms/this.video.volume;
    this.setGain(this.tracker.update(rms,seconds,this.options));
  };
  destroy(){
    this.destroyed=true;this.pause();this.video.removeEventListener('playing',this.playing);this.video.removeEventListener('pause',this.pause);this.video.removeEventListener('ended',this.pause);
    this.source.disconnect();this.gain.disconnect();this.limiter.disconnect();this.ceiling.disconnect();this.splitter.disconnect();this.meters.forEach(meter=>meter.disconnect());
    void this.context.close().catch(()=>{});
  }
}
