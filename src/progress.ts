import { api } from './api';
import type { Episode,Item,Progress } from './types';

type Entry={itemId:string;progress:Progress;pending:boolean};
let owner='',entries:Entry[]=[],generation=0;
let running:Promise<void>|undefined,controller:AbortController|undefined;
const key=(user:string)=>'cinema-hub.progress.v1.'+user;
const sameEpisode=(a:Progress,b:Progress|Episode)=>a.episode===('url' in b?b.url:b.episode)
  ||a.season!==undefined&&a.number!==undefined&&a.season===b.season&&a.number===b.number;
const persist=()=>{try{localStorage.setItem(key(owner),JSON.stringify(entries));}catch{/* Playback still works when browser storage is unavailable. */}};

export function latestProgress(itemId:string,server?:Progress|null,episode?:Episode):Progress|undefined {
  const local=entries.filter(entry=>entry.itemId===itemId&&(!episode||sameEpisode(entry.progress,episode)))
    .sort((a,b)=>(b.progress.updatedAt||0)-(a.progress.updatedAt||0))[0]?.progress;
  return local&&(!server||(local.updatedAt||0)>(server.updatedAt||0))?local:server||undefined;
}
export function withLocalProgress(item:Item):Item {
  return {...item,progress:latestProgress(item.id,item.progress)||null};
}
export function resumeEpisode(item:Item):Episode|undefined {
  const progress=item.progress;
  return (progress&&item.episodes?.find(episode=>sameEpisode(progress,episode)))
    ||[...(item.episodes||[])].sort((a,b)=>a.season-b.season||a.number-b.number)[0];
}
export function flushProgress(keepalive=false):Promise<void> {
  if(!owner)return Promise.resolve();
  if(running)return running;
  const session=generation;
  controller=new AbortController();const signal=controller.signal;
  running=(async()=>{
    while(session===generation){
      const entry=entries.find(value=>value.pending);if(!entry)return;
      if(session!==generation)return;
      try{
        await api('/items/'+entry.itemId+'/progress',entry.progress,'PUT',{timeoutMs:5000,keepalive,signal});
        if(session!==generation)return;
        // A final pause/close snapshot can arrive while an earlier save is in flight.
        if(entries.includes(entry)){entry.pending=false;persist();}
      }catch{return;}
    }
  })().finally(()=>{if(session===generation){running=undefined;controller=undefined;}});
  return running;
}
export function saveProgress(itemId:string,progress:Progress):Promise<void> {
  if(!owner||!Number.isFinite(progress.position)||!Number.isFinite(progress.duration)||progress.duration<=0)return Promise.resolve();
  const saved={...progress,updatedAt:Date.now()};
  entries=entries.filter(entry=>entry.itemId!==itemId||!sameEpisode(entry.progress,saved));
  entries.push({itemId,progress:saved,pending:true});
  const pending=entries.filter(entry=>entry.pending),synced=entries.filter(entry=>!entry.pending);
  entries=[...synced.slice(-200),...pending];persist();
  return flushProgress();
}
export function startProgressSync(userId:string):()=>void {
  generation++;controller?.abort();running=undefined;owner=userId;entries=[];
  if(!owner)return()=>{};
  try{
    const saved:unknown=JSON.parse(localStorage.getItem(key(owner))||'[]');
    if(Array.isArray(saved))entries=saved.filter((entry):entry is Entry=>!!entry&&typeof entry.itemId==='string'
      &&typeof entry.progress?.episode==='string'&&Number.isFinite(entry.progress.position)&&entry.progress.position>=0
      &&Number.isFinite(entry.progress.duration)&&entry.progress.duration>0&&Number.isFinite(entry.progress.updatedAt)
      &&typeof entry.progress.completed==='boolean'&&typeof entry.pending==='boolean');
  }catch{/* Ignore damaged or unavailable browser storage. */}
  const retry=()=>{void flushProgress();},leaving=()=>{void flushProgress(true);};
  window.addEventListener('online',retry);window.addEventListener('pagehide',leaving);
  document.addEventListener('visibilitychange',leaving);
  const timer=window.setInterval(retry,10000);retry();
  return()=>{window.clearInterval(timer);window.removeEventListener('online',retry);window.removeEventListener('pagehide',leaving);
    document.removeEventListener('visibilitychange',leaving);generation++;controller?.abort();running=undefined;owner='';entries=[];};
}
