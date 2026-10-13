export class ApiError extends Error {
  constructor(message:string,public status:number,public retryAfter?:number){super(message);this.name='ApiError';}
}
export async function api<T=unknown>(path:string,body?:unknown,method?:string):Promise<T> {
  const response=await fetch('/api'+path,{method:method||(body===undefined?'GET':'POST'),credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json().catch(()=>({error:'Serwer nie odpowiedział.'}));if(!response.ok)throw new ApiError(data.error||'Operacja nie powiodła się.',response.status,Number.isFinite(data.retryAfter)?data.retryAfter:undefined);return data as T;
}
export const clock=(seconds:number)=>{if(!Number.isFinite(seconds))return '0:00';const h=Math.floor(seconds/3600),m=Math.floor(seconds/60)%60,s=Math.floor(seconds)%60;return (h?h+':':'')+(h?String(m).padStart(2,'0'):m)+':'+String(s).padStart(2,'0');};
export const size=(bytes:number)=>bytes>=1024**3?(bytes/1024**3).toFixed(1)+' GB':bytes>=1024**2?(bytes/1024**2).toFixed(1)+' MB':Math.round(bytes/1024)+' KB';
let audio:AudioContext|undefined;
export function tone(style='soft') {try{audio ||= new AudioContext();if(audio.state==='suspended')void audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type=style==='arcade'?'triangle':'sine';o.frequency.setValueAtTime(style==='minimal'?440:620,audio.currentTime);o.frequency.exponentialRampToValueAtTime(style==='arcade'?1100:420,audio.currentTime+.06);g.gain.setValueAtTime(.035,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.09);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.09);}catch{}}
