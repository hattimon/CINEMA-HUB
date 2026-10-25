export type AudioLevelOptions={mode:'manual'|'auto'|'normalizer';boost:number;targetDb:number};
export function chooseAudioGain(mode:string,boost:number,rms:number,targetDb?:number):number;
export function signalStats(channels:ReadonlyArray<ArrayLike<number>>):{rms:number;peak:number};
export class AudioLevelTracker {
  gain:number;power:number;hasSignal:boolean;
  reset(options:AudioLevelOptions):number;
  update(rms:number,seconds:number,options:AudioLevelOptions):number;
}
