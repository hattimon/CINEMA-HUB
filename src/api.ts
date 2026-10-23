export class ApiError extends Error {
  constructor(message:string,public status:number,public retryAfter?:number){super(message);this.name='ApiError';}
}
export async function api<T=unknown>(path:string,body?:unknown,method?:string,options:{signal?:AbortSignal;timeoutMs?:number;keepalive?:boolean}={}):Promise<T> {
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),options.timeoutMs??45000);
  const aborted=()=>controller.abort();options.signal?.addEventListener('abort',aborted,{once:true});if(options.signal?.aborted)aborted();
  try{
  const response=await fetch('/api'+path,{method:method||(body===undefined?'GET':'POST'),credentials:'same-origin',signal:controller.signal,keepalive:options.keepalive,headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json().catch(()=>({error:'Serwer nie odpowiedział.'}));controller.signal.throwIfAborted();if(!response.ok)throw new ApiError(data.error||'Operacja nie powiodła się.',response.status,Number.isFinite(data.retryAfter)?data.retryAfter:undefined);return data as T;
  }catch(error){if(controller.signal.aborted&&!options.signal?.aborted)throw new ApiError('Serwer zbyt długo nie odpowiada. Ponów próbę lub wybierz hosting ręcznie.',408);throw error;}
  finally{clearTimeout(timeout);options.signal?.removeEventListener('abort',aborted);}
}
export const clock=(seconds:number)=>{if(!Number.isFinite(seconds))return '0:00';const h=Math.floor(seconds/3600),m=Math.floor(seconds/60)%60,s=Math.floor(seconds)%60;return (h?h+':':'')+(h?String(m).padStart(2,'0'):m)+':'+String(s).padStart(2,'0');};
export const size=(bytes:number)=>bytes>=1024**3?(bytes/1024**3).toFixed(1)+' GB':bytes>=1024**2?(bytes/1024**2).toFixed(1)+' MB':Math.round(bytes/1024)+' KB';
let audio:AudioContext|undefined,noise:AudioBuffer|undefined,lastTone=0;
export function tone(style='soft',volume=50,preview=false) {
  const level=Math.max(0,Math.min(200,Number.isFinite(volume)?volume:50));if(level===0)return;
  try{if(!preview&&performance.now()-lastTone<35)return;lastTone=performance.now();audio ||= new AudioContext();if(audio.state==='suspended')void audio.resume();const context=audio,at=context.currentTime,master=context.createGain();master.gain.value=level/50;master.connect(context.destination);
    // Release the short-lived mix after the longest theme finishes.
    setTimeout(()=>master.disconnect(),500);
    const note=(frequency:number,end:number,length:number,type:OscillatorType='sine',level=.025,delay=0)=>{const o=context.createOscillator(),g=context.createGain(),start=at+delay;o.type=type;o.frequency.setValueAtTime(frequency,start);o.frequency.exponentialRampToValueAtTime(end,start+length);g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(level,start+.008);g.gain.exponentialRampToValueAtTime(.0001,start+length);o.connect(g);g.connect(master);o.start(start);o.stop(start+length);};
    if(style==='wind'){if(!noise){noise=context.createBuffer(1,Math.floor(context.sampleRate*.2),context.sampleRate);const samples=noise.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;}const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();source.buffer=noise;filter.type='bandpass';filter.frequency.setValueAtTime(1500,at);filter.frequency.exponentialRampToValueAtTime(450,at+.18);gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(.045,at+.04);gain.gain.exponentialRampToValueAtTime(.0001,at+.2);source.connect(filter);filter.connect(gain);gain.connect(master);source.start();return;}
    if(style==='glass'){note(1350,1310,.22,'sine',.025);note(2700,2650,.16,'sine',.011,.014);return;}
    if(style==='cinematic'){note(160,75,.23,'sine',.035);note(330,220,.16,'triangle',.01,.02);return;}
    if(style==='retro'){note(660,660,.055,'square',.012);note(990,990,.075,'square',.009,.05);return;}
    if(style==='futuristic'){note(480,1550,.09,'sine',.022);note(1900,850,.12,'triangle',.008,.04);return;}
    note(style==='minimal'?440:620,style==='arcade'?1100:420,.09,style==='arcade'?'triangle':'sine',.03);
  }catch{}
}
