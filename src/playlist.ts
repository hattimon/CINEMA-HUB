export type PlaylistMode='once'|'repeat'|'shuffle';
export type PlaylistEntry={
  id:string;position:number;itemId:string|null;episodeUrl:string|null;
  season:number|null;episode:number|null;label:string;completed:boolean;playbackPosition:number;
  metadata:Record<string,unknown>;
  media:{id:string;title:string;kind:string;sourceId:string;sourceName?:string;poster?:string}|null;
  needsStargateLink?:boolean;
};
export type Playlist={
  id:string;name:string;description:string;mode:PlaylistMode;revision:number;
  cursorId:string|null;shuffleRemaining:string[];shuffleHistory:string[];
  itemCount:number;completedCount:number;created:number;updated:number;entries:PlaylistEntry[];
};
export type PlaylistSummary=Omit<Playlist,'entries'>;
export type StargatePreparation={playlist:Playlist;message?:string};
export type QueueState=Pick<Playlist,'cursorId'|'shuffleRemaining'|'shuffleHistory'>;
export function playlistEpisodeCode(entry:PlaylistEntry) {
  if(entry.season===null||entry.episode===null)return '';
  const code='S'+String(entry.season).padStart(2,'0')+'E'+String(entry.episode).padStart(2,'0');
  const last=Number(entry.metadata.episode_end);
  return Number.isInteger(last)&&last>entry.episode&&last<=999?code+'–'+String(last).padStart(2,'0'):code;
}
const randomize=(ids:string[])=>{
  const copy=[...ids];
  for(let i=copy.length-1;i>0;i--){const index=Math.floor(Math.random()*(i+1));[copy[i],copy[index]]=[copy[index],copy[i]];}
  return copy;
};
export function selectPlaylistEntry(p:Playlist,id:string):QueueState{
  return {cursorId:id,shuffleRemaining:p.mode==='shuffle'?randomize(p.entries.map(e=>e.id).filter(x=>x!==id)):[],shuffleHistory:[]};
}
export function advancePlaylist(p:Playlist,direction:1|-1):QueueState|null{
  const ids=p.entries.map(e=>e.id),cursor=p.cursorId;
  if(!ids.length)return null;
  if(p.mode==='shuffle'){
    if(direction===-1){
      const history=p.shuffleHistory.filter(id=>ids.includes(id));
      const previous=history.pop();
      return previous?{cursorId:previous,shuffleHistory:history,shuffleRemaining:cursor?[cursor,...p.shuffleRemaining.filter(id=>ids.includes(id)&&id!==cursor)]:p.shuffleRemaining}:null;
    }
    let bag=[...new Set(p.shuffleRemaining.filter(id=>ids.includes(id)&&id!==cursor))];
    if(!bag.length)bag=randomize(ids.filter(id=>id!==cursor));
    if(!bag.length)return cursor?{cursorId:cursor,shuffleRemaining:[],shuffleHistory:[]}:null;
    const next=bag[0];
    return {cursorId:next,shuffleRemaining:bag.slice(1),shuffleHistory:cursor?[...p.shuffleHistory.filter(id=>ids.includes(id)),cursor].slice(-5000):[]};
  }
  const index=ids.indexOf(cursor||'');
  const destination=index+direction;
  if(destination>=0&&destination<ids.length)return {cursorId:ids[destination],shuffleRemaining:[],shuffleHistory:[]};
  if(p.mode==='repeat')return {cursorId:ids[(destination+ids.length)%ids.length],shuffleRemaining:[],shuffleHistory:[]};
  if(index<0&&direction===1)return {cursorId:ids[0],shuffleRemaining:[],shuffleHistory:[]};
  return null;
}

// Serialize updates to a single user's playlist so an earlier response cannot
// overwrite a newer cursor, mode change or restart.
export function createPlaylistWriteQueue(){
  const pending=new Map<string,Promise<void>>();
  return function enqueue<T>(key:string,write:()=>Promise<T>):Promise<T>{
    const previous=pending.get(key)??Promise.resolve();
    const task=previous.catch(()=>{}).then(write);
    const settled=task.then(()=>{},()=>{});
    pending.set(key,settled);
    void settled.then(()=>{if(pending.get(key)===settled)pending.delete(key);});
    return task;
  };
}
