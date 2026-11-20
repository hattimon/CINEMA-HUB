import {api} from './api';
import type {Playlist,QueueState} from './playlist';

type ProgressChange={kind:'progress';playlistId:string;entryId:string;stamp:number;restartGeneration:number;position:number;completed?:boolean};
type CursorChange={kind:'cursor';playlistId:string;stamp:number;restartGeneration:number;state:QueueState};
type Change=ProgressChange|CursorChange;
let owner='',pending:Change[]=[],generation=0,lastStamp=0;
let running:Promise<void>|undefined,controller:AbortController|undefined;
const storageKey=(user:string)=>'cinema-hub.playlist-journal.v1.'+user;
const save=()=>{if(!owner)return;try{localStorage.setItem(storageKey(owner),JSON.stringify(pending));}catch{/* Offline storage may be disabled. */}};
const stamp=()=>lastStamp=Math.max(Date.now(),lastStamp+1);
const same=(a:Change,b:Change)=>a.kind===b.kind&&a.playlistId===b.playlistId&&a.restartGeneration===b.restartGeneration&&(a.kind==='cursor'||b.kind==='progress'&&a.entryId===b.entryId);

function enqueue(change:Change){
  if(!owner)return;
  // A pause/teardown position event can arrive after the end-of-episode
  // event. Never replace the pending completed marker with that position.
  if(change.kind==='progress'&&change.completed!==true&&pending.some(item=>
    item.kind==='progress'&&item.playlistId===change.playlistId&&item.entryId===change.entryId
    &&item.restartGeneration===change.restartGeneration&&item.completed===true))return;
  pending=pending.filter(item=>!same(item,change));
  pending.push(change);
  save();
  void flushPlaylistJournal();
}

export function recordPlaylistPosition(playlistId:string,entryId:string,position:number,completed?:boolean,restartGeneration=0){
  if(!Number.isFinite(position)||position<0||position>1e8||position===0&&completed===undefined)return;
  enqueue({kind:'progress',playlistId,entryId,position,completed,restartGeneration,stamp:stamp()});
}

export function recordPlaylistCursor(playlistId:string,state:QueueState,restartGeneration=0){
  enqueue({kind:'cursor',playlistId,state,restartGeneration,stamp:stamp()});
}

export function discardPlaylistJournal(playlistId:string){
  pending=pending.filter(change=>change.playlistId!==playlistId);
  // Invalidate any request that was sent before the restart. The server also
  // rejects older stamps, including requests which arrive after the restart.
  generation++;
  controller?.abort();controller=undefined;running=undefined;
  save();
  void flushPlaylistJournal();
}

export function syncPlaylistJournalStamps(document:Playlist){
  lastStamp=Math.max(lastStamp,document.playbackStamp||0,...document.entries.map(e=>e.progressStamp||0));
}

export function withLocalPlaylist(document:Playlist):Playlist{
  syncPlaylistJournalStamps(document);
  let result=document;
  for(const change of pending.filter(change=>change.playlistId===document.id
    &&(change.restartGeneration??0)===(document.restartGeneration??0)).sort((a,b)=>a.stamp-b.stamp)){
    if(change.kind==='cursor'){
      if(change.stamp>(result.playbackStamp||0)&&(!change.state.cursorId||result.entries.some(entry=>entry.id===change.state.cursorId))){
        result={...result,...change.state,playbackStamp:change.stamp};
      }
    }else{
      const entry=result.entries.find(entry=>entry.id===change.entryId);
      if(!entry||change.stamp<=(entry.progressStamp||0)||entry.completed&&change.completed!==true)continue;
      result={...result,entries:result.entries.map(item=>item.id===change.entryId?{
        ...item,playbackPosition:change.position,completed:change.completed??item.completed,progressStamp:change.stamp
      }:item)};
    }
  }
  return result===document?document:{...result,completedCount:result.entries.filter(entry=>entry.completed).length};
}

export function flushPlaylistJournal(keepalive=false):Promise<void>{
  if(!owner)return Promise.resolve();
  if(running)return running;
  const session=generation;
  controller=new AbortController();const signal=controller.signal;
  running=(async()=>{
    while(session===generation){
      const change=pending.slice().sort((a,b)=>a.stamp-b.stamp)[0];
      if(!change)return;
      try{
        if(change.kind==='progress')await api('/playlists/'+change.playlistId+'/entries/'+change.entryId+'/progress',{
          position:change.position,completed:change.completed,stamp:change.stamp,restartGeneration:change.restartGeneration??0
        },'PATCH',{signal,timeoutMs:5000,keepalive});
        else await api('/playlists/'+change.playlistId+'/playback',{...change.state,stamp:change.stamp,restartGeneration:change.restartGeneration??0},'PATCH',{signal,timeoutMs:5000,keepalive});
        if(session!==generation)return;
        if(pending.includes(change)){pending=pending.filter(item=>item!==change);save();}
      }catch(error){
        // Deleted entries/playlists should not permanently block the remaining journal.
        if(session===generation&&[400,404].includes((error as {status?:number}).status||0)){
          if(pending.includes(change)){pending=pending.filter(item=>item!==change);save();}
          continue;
        }
        return;
      }
    }
  })().finally(()=>{if(session===generation){running=undefined;controller=undefined;}});
  return running;
}

export function startPlaylistSync(userId:string):()=>void{
  generation++;controller?.abort();controller=undefined;running=undefined;
  owner=userId;pending=[];lastStamp=0;
  if(!owner)return()=>{};
  try{
    const stored:unknown=JSON.parse(localStorage.getItem(storageKey(owner))||'[]');
    if(Array.isArray(stored))pending=stored.filter((item):item is Change=>!!item
      &&typeof item.playlistId==='string'&&Number.isSafeInteger(item.stamp)&&item.stamp>=0
      &&(item.kind==='cursor'&&!!item.state&&Array.isArray(item.state.shuffleRemaining)&&Array.isArray(item.state.shuffleHistory)
        ||item.kind==='progress'&&typeof item.entryId==='string'&&Number.isFinite(item.position)&&item.position>=0)
      &&(item.restartGeneration===undefined||Number.isSafeInteger(item.restartGeneration)&&item.restartGeneration>=0));
    lastStamp=Math.max(0,...pending.map(item=>item.stamp));
  }catch{/* Ignore malformed or unavailable browser storage. */}
  const retry=()=>{void flushPlaylistJournal();};
  const leaving=()=>{void flushPlaylistJournal(true);};
  window.addEventListener('online',retry);window.addEventListener('pagehide',leaving);
  document.addEventListener('visibilitychange',leaving);
  const timer=window.setInterval(retry,10000);retry();
  return()=>{window.clearInterval(timer);window.removeEventListener('online',retry);
    window.removeEventListener('pagehide',leaving);document.removeEventListener('visibilitychange',leaving);
    generation++;controller?.abort();controller=undefined;running=undefined;owner='';pending=[];};
}
