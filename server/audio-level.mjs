// Shared signal-level rules used by the browser player and deterministic tests.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function chooseAudioGain(mode,boost,rms,targetDb=-21){
  if(mode==='manual')return clamp(Number.isFinite(boost)?boost/100:1,1,3);
  if(!Number.isFinite(rms)||rms<=0.001)return 1;
  if(mode==='auto'){
    if(rms>0.16)return clamp(0.12/rms,0.03,1);
    if(rms>=0.045)return 1;
    const desired=clamp(0.075/rms,1,3);
    return [1,1.5,2,2.5,3].reduce((best,gain)=>Math.abs(gain-desired)<Math.abs(best-desired)?gain:best,1);
  }
  if(mode==='normalizer')return clamp(10**(clamp(Number.isFinite(targetDb)?targetDb:-21,-30,-12)/20)/rms,0.03,3);
  return 1;
}
export function signalStats(channels){
  let power=0,count=0,peak=0;
  for(const samples of channels){let sum=0;for(const sample of samples){const value=Number.isFinite(sample)?sample:0;sum+=value*value;peak=Math.max(peak,Math.abs(value));}if(sum>1e-12){power+=sum;count+=samples.length;}}
  return {rms:count?Math.sqrt(power/count):0,peak};
}
export class AudioLevelTracker{
  gain=1;power=0;hasSignal=false;
  reset(options){this.gain=chooseAudioGain(options.mode,options.boost,0,options.targetDb);this.power=0;this.hasSignal=false;return this.gain;}
  update(rms,seconds,options){
    if(options.mode==='manual'){this.gain=chooseAudioGain('manual',options.boost,rms,options.targetDb);return this.gain;}
    // Digital silence, pauses and muted playback must never turn into a gain ramp.
    if(!Number.isFinite(rms)||rms<=0.001)return this.gain;
    const elapsed=clamp(Number.isFinite(seconds)?seconds:0.05,0.001,0.5),weight=1-Math.exp(-elapsed/1.5);
    this.power=this.hasSignal?this.power*(1-weight)+rms*rms*weight:rms*rms;this.hasSignal=true;
    const desired=chooseAudioGain(options.mode,options.boost,Math.sqrt(this.power),options.targetDb);
    this.gain+=(desired-this.gain)*(1-Math.exp(-elapsed/(desired<this.gain?0.25:1.5)));
    return this.gain;
  }
}
