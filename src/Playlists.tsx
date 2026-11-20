import { useEffect,useRef,useState } from 'react';
import { Plus,Play,Trash2,Copy,Download,Upload,ArrowUp,ArrowDown,Search,RefreshCw,Save,Shuffle,Repeat,ListOrdered,Link2 } from 'lucide-react';
import { api } from './api';
import type { Item,Episode } from './types';
import type { Playlist,PlaylistSummary,PlaylistEntry,PlaylistMode,StargatePreparation } from './playlist';
import {playlistEpisodeCode,resumePlaylistEntry} from './playlist';
import {withLocalPlaylist} from './playlistProgress';

type Props={onPlay:(playlist:Playlist,entry:PlaylistEntry,restart?:boolean)=>void;onMessage:(message:string)=>void};
const modes:{id:PlaylistMode;label:string;icon:typeof Play}[]=[
  {id:'once',label:'Po kolei',icon:ListOrdered},
  {id:'repeat',label:'W pętli',icon:Repeat},
  {id:'shuffle',label:'Losowo',icon:Shuffle}
];
const asEntry=(item:Item,episode?:Episode)=>({
  itemId:item.id,episodeUrl:episode?.url||null,season:episode?.season??null,episode:episode?.number??null,
  label:episode?episode.title:item.title,metadata:{title:episode?.title||item.title,series_title:item.title,season:episode?.season??null,episode:episode?.number??null,episode_end:episode?.lastNumber??null}
});
const display=(entry:PlaylistEntry)=>{
  const info=entry.metadata;
  const name=entry.media?.title||String(info.series_title||'');
  const code=playlistEpisodeCode(entry);
  return [name,code,entry.label].filter(Boolean).join(' · ');
};
export default function Playlists({onPlay,onMessage}:Props){
  const [list,setList]=useState<PlaylistSummary[]>([]),[active,setActive]=useState<Playlist|null>(null);
  const [newName,setNewName]=useState(''),[busy,setBusy]=useState(false),[search,setSearch]=useState(''),[found,setFound]=useState<Item[]>([]);
  const [insertAt,setInsertAt]=useState('end');
  const [candidate,setCandidate]=useState<Item|null>(null),[target,setTarget]=useState<PlaylistEntry|null>(null),[drag,setDrag]=useState<string|null>(null);
  const [preparing,setPreparing]=useState(false),[preparationNotice,setPreparationNotice]=useState('');
  const file=useRef<HTMLInputElement>(null);
  const mounted=useRef(false),operation=useRef(false),preparation=useRef<AbortController|null>(null);
  const loadList=async()=>{const summaries=await api<PlaylistSummary[]>('/playlists');setList(summaries);return summaries;};
  const refresh=async(selected=active?.id)=>{
    const summaries=await loadList();
    if(selected){const chosen=summaries.find(p=>p.id===selected);setActive(chosen?withLocalPlaylist(await api<Playlist>('/playlists/'+selected)):null);}
  };
  useEffect(()=>{
    mounted.current=true;
    void loadList().catch(e=>onMessage(e.message));
    return()=>{mounted.current=false;preparation.current?.abort();};
  },[]);
  const run=async(work:()=>Promise<void>)=>{
    if(operation.current)return;
    operation.current=true;
    setBusy(true);
    try{await work();}catch(e){
      if(!mounted.current)return;
      onMessage((e as Error).message);
      if((e as {status?:number}).status===409)await refresh().catch(()=>{});
    }finally{operation.current=false;setBusy(false);}
  };
  const create=()=>void run(async()=>{const name=newName.trim();if(!name)return;
    const doc=await api<Playlist>('/playlists',{name});setNewName('');await refresh(doc.id);
  });
  const prepare=async(path:string)=>{
    if(!mounted.current)return;
    const controller=new AbortController();
    preparation.current=controller;
    setPreparing(true);setPreparationNotice('');
    try{
      const result=await api<StargatePreparation>(path,{},undefined,{signal:controller.signal,timeoutMs:120000});
      if(controller.signal.aborted)return;
      setActive(withLocalPlaylist(result.playlist));
      setPreparationNotice(result.message??'');
      return withLocalPlaylist(result.playlist);
    }finally{
      if(preparation.current===controller)preparation.current=null;
      if(!controller.signal.aborted)setPreparing(false);
    }
  };
  const prepareIfNeeded=(doc:Playlist)=>doc.entries.some(entry=>entry.needsStargateLink)
    ?prepare('/playlists/'+doc.id+'/resolve-stargate')
    :Promise.resolve(doc);
  const open=(id:string)=>void run(async()=>{
    setPreparationNotice('');setTarget(null);setCandidate(null);
    const doc=withLocalPlaylist(await api<Playlist>('/playlists/'+id));
    if(!mounted.current)return;
    setActive(doc);
    await prepareIfNeeded(doc);
  });
  const playPrepared=(doc:Playlist,entry?:PlaylistEntry,restart=false)=>{
    if(!entry||!mounted.current)return;
    if(entry.needsStargateLink){
      onMessage('Filman nie udostępnił pozycji „'+entry.label+'”. Sprawdź komunikat przy playliście.');
      return;
    }
    onPlay(doc,entry,restart);
  };
  const enterFullscreen=()=>{if(!window.CinemaNative&&!document.fullscreenElement)void document.documentElement.requestFullscreen?.().catch(()=>{});};
  const play=(doc:Playlist,entry?:PlaylistEntry,restart=false)=>{if(!entry)return;enterFullscreen();void run(async()=>{
    if(!entry)return;
    const prepared=await prepareIfNeeded(doc);
    if(prepared)playPrepared(prepared,prepared.entries.find(current=>current.id===entry.id),restart);
  });};
  const playSaved=(id:string)=>{enterFullscreen();void run(async()=>{
    const doc=withLocalPlaylist(await api<Playlist>('/playlists/'+id));
    setActive(doc);
    const prepared=await prepareIfNeeded(doc);
    if(prepared)playPrepared(prepared,resumePlaylistEntry(prepared)??prepared.entries[0],prepared.itemCount>0&&prepared.completedCount===prepared.itemCount);
  });};
  const preset=(name:'full'|'season8'|'avatar')=>{enterFullscreen();void run(async()=>{
    setTarget(null);setCandidate(null);
    const doc=await prepare('/playlists/presets/'+name);
    if(!doc)return;
    void loadList().catch(e=>onMessage(e.message));
    const entry=resumePlaylistEntry(doc)??doc.entries[0];
    playPrepared(doc,entry,doc.itemCount>0&&doc.completedCount===doc.itemCount);
  });};
  const importFile=(source:File)=>void run(async()=>{
    const format=source.name.toLowerCase().endsWith('.csv')?'csv':'json';
    const doc=await api<Playlist>('/playlists/import',{content:await source.text(),format});
    setPreparationNotice('');
    setActive(withLocalPlaylist(doc));
    await Promise.all([loadList(),prepareIfNeeded(doc)]);
    onMessage('Zaimportowano '+doc.entries.length+' pozycji.');
  });
  const update=(patch:Record<string,unknown>)=>void run(async()=>{if(!active)return;const doc=await api<Playlist>('/playlists/'+active.id,{...patch,revision:active.revision},'PATCH');setActive(doc);await refresh(doc.id);});
  const remove=()=>void run(async()=>{if(!active||!window.confirm('Usunąć playlistę „'+active.name+'”?'))return;await api('/playlists/'+active.id,{},'DELETE');setActive(null);await refresh(undefined);});
  const duplicate=()=>void run(async()=>{if(!active)return;const doc=await api<Playlist>('/playlists/'+active.id+'/duplicate',{});await refresh(doc.id);});
  const reorder=(ids:string[])=>void run(async()=>{if(!active)return;const doc=await api<Playlist>('/playlists/'+active.id+'/entries',{ids,revision:active.revision},'PATCH');setActive(doc);});
  const move=(entry:PlaylistEntry,position:number)=>{
    if(!active||position<0||position>=active.entries.length||position===entry.position)return;
    const ids=active.entries.map(e=>e.id);ids.splice(entry.position,1);ids.splice(position,0,entry.id);reorder(ids);
  };
  const removeEntry=(entry:PlaylistEntry)=>void run(async()=>{if(!active)return;
    const doc=await api<Playlist>('/playlists/'+active.id+'/entries/'+entry.id,{revision:active.revision},'DELETE');setActive(doc);
  });
  const addEntry=async(item:Item,episode?:Episode)=>{if(!active)return;
    const entry=asEntry(item,episode);
    const doc=target
      ?await api<Playlist>('/playlists/'+active.id+'/entries/'+target.id,{entry:{...entry,label:target.label,metadata:target.metadata},revision:active.revision},'PATCH')
      :await api<Playlist>('/playlists/'+active.id+'/entries',{entry,position:insertAt==='end'?active.entries.length:Number(insertAt)-1,revision:active.revision});
    setActive(doc);setTarget(null);setCandidate(null);onMessage(target?'Powiązano odcinek z katalogiem.':'Dodano do playlisty.');
  };
  const add=(item:Item,episode?:Episode)=>void run(()=>addEntry(item,episode));
  const pick=(item:Item)=>void run(async()=>{
    const detailed=await api<Item>('/items/'+item.id);
    if(target&&detailed.kind==='series'&&target.season!==null&&target.episode!==null){
      const exact=detailed.episodes?.find(e=>e.season===target.season&&e.number===target.episode);
      if(exact){await addEntry(detailed,exact);return;}
    }
    if(detailed.kind==='series'){setCandidate(detailed);return;}
    await addEntry(detailed);
  });
  useEffect(()=>{
    if(search.trim().length<2){setFound([]);return;}
    let live=true;
    const timer=setTimeout(()=>void api<Item[]>('/playlist-media/search?q='+encodeURIComponent(search)).then(items=>{if(live)setFound(items);}).catch(e=>{if(live)onMessage(e.message);}),350);
    return()=>{live=false;clearTimeout(timer);};
  },[search]);
  const download=(format:'json'|'csv')=>{if(!active)return;const a=document.createElement('a');a.href='/api/playlists/'+active.id+'/export?format='+format;a.download='cinema-playlist-'+active.id+'.'+format;document.body.append(a);a.click();a.remove();};
  const linked=active?.entries.filter(e=>!!e.media&&!e.needsStargateLink).length||0;
  const missingStargate=active?.entries.filter(e=>e.needsStargateLink).length||0;
  return <section className="playlists-page">
    <div className="page-title"><div><h1>Playlisty</h1><p>Filmy i pojedyncze odcinki z różnych seriali w wybranej przez Ciebie kolejności.</p></div>
      <button className="button secondary" onClick={()=>file.current?.click()}><Upload size={17}/>Import JSON / CSV</button>
      <input type="file" ref={file} accept=".json,.csv,application/json,text/csv" hidden onChange={e=>{const value=e.target.files?.[0];if(value)importFile(value);e.target.value='';}}/>
    </div>
    <section className="playlist-creator" aria-labelledby="playlist-create-title">
      <h2 id="playlist-create-title">Tworzenie i edycja playlist</h2>
      <p>Utwórz własną listę lub wybierz gotową chronologię. Wybraną listę edytujesz poniżej.</p>
    <div className="playlist-toolbar">
      <label>Nazwa nowej playlisty<input value={newName} maxLength={120} placeholder="Np. Moja kolejność oglądania" onChange={e=>setNewName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')create();}}/></label>
      <button className="button primary" disabled={busy||!newName.trim()} onClick={create}><Plus size={17}/>Utwórz</button>
    </div>
    <div className="playlist-presets"><strong>Gotowe playlisty z Filmana</strong>
      <button className="button secondary" disabled={busy} onClick={()=>preset('full')}><Play size={16}/>Odtwórz SG-1 + Atlantis + filmy</button>
      <button className="button secondary" disabled={busy} onClick={()=>preset('season8')}><Play size={16}/>Odtwórz od SG-1 S08</button>
      <button className="button secondary" disabled={busy} onClick={()=>preset('avatar')}><Play size={16}/>Odtwórz Avatar — chronologicznie</button>
    </div>
    </section>
    {preparing?<p className="playlist-status" role="status">Dopasowuję filmy i odcinki w Filmanie…</p>:null}
    <section className="playlist-saved" aria-labelledby="playlist-mine-title">
    <h2 id="playlist-mine-title">Moje playlisty</h2>
    <div className="playlist-columns">
      <aside className="playlist-list" aria-label="Twoje playlisty">
        {list.map(p=><article key={p.id} className={'playlist-list-item '+(active?.id===p.id?'active':'')}>
          <button type="button" className="playlist-list-open" disabled={busy} onClick={()=>open(p.id)}>
            <strong>{p.name}</strong><small>{p.itemCount} pozycji · {p.completedCount}/{p.itemCount} obejrzanych · {p.mode==='once'?'Po kolei':p.mode==='repeat'?'W pętli':'Losowo'}</small>
            {p.cursorLabel?<small className="playlist-current-episode">▶ Aktualnie: {p.cursorLabel}{p.cursorTime&&p.cursorTime>0?' · od '+Math.floor(p.cursorTime/60)+' min':''}</small>:null}
            {p.itemCount>0&&p.completedCount===p.itemCount?<span className="playlist-done">✓ Ukończono</span>:p.cursorId?<span className="playlist-resume">● W trakcie</span>:null}
          </button>
          <progress value={p.completedCount} max={Math.max(1,p.itemCount)} aria-label={'Ukończone elementy playlisty '+p.name}/>
          <button className="button primary" disabled={busy||!p.itemCount} onClick={()=>playSaved(p.id)}><Play size={16}/>{p.itemCount>0&&p.completedCount===p.itemCount?'Odtwórz ponownie':p.cursorId?'Kontynuuj oglądanie':'Odtwórz'}</button>
        </article>)}
        {!list.length?<p>Nie masz jeszcze playlist. Możesz utworzyć własną lub wybrać gotową chronologię Stargate albo Avatar.</p>:null}
      </aside>
      {active?<section className="playlist-editor" aria-label="Edycja wybranej playlisty">
        <div className="section-heading"><div><h2>{active.name}</h2><p>{active.description||'Lista prywatna'} · {active.entries.length} pozycji · {active.entries.filter(e=>e.completed).length} ukończonych · {linked} powiązanych z katalogiem</p></div>
          <div className="form-actions"><button className="button secondary" onClick={()=>update({name:window.prompt('Nazwa playlisty',active.name)||active.name,description:window.prompt('Opis',active.description)??active.description})}><Save size={16}/>Edytuj</button><button className="button secondary" onClick={duplicate}><Copy size={16}/>Duplikuj</button><button className="button secondary" onClick={()=>download('json')}><Download size={16}/>JSON</button><button className="button secondary" onClick={()=>download('csv')}><Download size={16}/>CSV</button><button className="button ghost" onClick={remove}><Trash2 size={16}/>Usuń</button></div>
        </div>
        <div className="playlist-modes" aria-label="Tryb odtwarzania">{modes.map(({id,label,icon:Icon})=><button key={id} className={'button '+(active.mode===id?'primary':'secondary')} onClick={()=>update({mode:id})}><Icon size={17}/>{label}</button>)}</div>
        <div className="playlist-media-search">
          <label>Nowy element dodaj na pozycji
            <select value={insertAt} onChange={e=>setInsertAt(e.target.value)}>
              <option value="end">Na końcu</option>
              {Array.from({length:active.entries.length+1},(_,index)=><option key={index} value={index+1}>{index===0?'Na początku (1)':'Przed pozycją '+(index+1)}</option>)}
            </select>
          </label>
          <label><Search size={16}/>Szukaj w zapamiętanym katalogu<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tytuł filmu albo serialu"/></label>
          {target?<p className="form-note">Powiąż „{display(target)}” z tytułem. <button className="button ghost" onClick={()=>setTarget(null)}>Anuluj powiązanie</button></p>:null}
          {candidate?<div><p>Wybierz konkretny odcinek: {candidate.title}</p><div className="playlist-episode-picker">{candidate.episodes?.map(ep=><button className="button secondary" key={ep.url} onClick={()=>add(candidate,ep)}>S{String(ep.season).padStart(2,'0')}E{String(ep.number).padStart(2,'0')} · {ep.title}</button>)}</div><button className="button ghost" onClick={()=>setCandidate(null)}>Zamknij wybór</button></div>:null}
          {found.length?<div className="playlist-search-results">{found.map(item=><button className="button secondary" key={item.id} disabled={busy} onClick={()=>pick(item)}><Plus size={16}/>{item.title} · {item.sourceName}</button>)}</div>:null}
        </div>
        <div className="playlist-actions">
          <button className="button primary" disabled={!active.entries.length||busy} onClick={()=>play(active,resumePlaylistEntry(active)??active.entries[0],active.itemCount>0&&active.completedCount===active.itemCount)}><Play size={16}/>{active.itemCount>0&&active.completedCount===active.itemCount?'Odtwórz ponownie':active.cursorId?'Kontynuuj oglądanie':'Odtwórz playlistę'}</button>
          <button className="button secondary" disabled={!active.entries.length||busy} onClick={()=>play(active,active.entries[0],true)}>Od początku</button>
          {missingStargate>0?<button className="button secondary" disabled={busy} onClick={()=>void run(async()=>{await prepareIfNeeded(active);})}><Link2 size={16}/>Powiąż z Filmanem</button>:null}
          <button className="button secondary" disabled={busy} onClick={()=>open(active.id)}><RefreshCw size={16}/>Odśwież</button>
        </div>
        {missingStargate>0&&!preparing?<p className="source-error" role="status">{preparationNotice||'Powiąż pozostałe pozycje automatycznie przez Filman.'} Gotowe: {linked} z {active.entries.length}.</p>:null}
        {active.entries.length-linked>missingStargate?<p className="source-error">Pozostałe pozycje bez źródła możesz powiązać przyciskiem obok tytułu.</p>:null}
        <ol className="playlist-entries">{active.entries.map((entry,index)=><li key={entry.id} draggable onDragStart={()=>setDrag(entry.id)} onDragEnd={()=>setDrag(null)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!drag||drag===entry.id)return;const ids=active.entries.map(e=>e.id),from=ids.indexOf(drag);if(from===-1)return;ids.splice(from,1);ids.splice(index,0,drag);reorder(ids);setDrag(null);}}>
          <span className="playlist-position">{index+1}</span><div className="playlist-entry-label"><strong>{display(entry)}</strong><small>{entry.completed?'✓ Ukończono · ':''}{entry.needsStargateLink?'Do powiązania z Filmanem':entry.media?.sourceName||(entry.media?'Powiązano z katalogiem':'Brak źródła')}{entry.id===active.cursorId?' · Ostatnio odtwarzane':''}{entry.playbackPosition>0&&!entry.completed?' · Wznowienie od '+Math.floor(entry.playbackPosition/60)+' min':''}</small></div>
          <div className="playlist-entry-actions"><button className="icon-button" aria-label={'Odtwórz: '+display(entry)} title="Odtwórz od tej pozycji" disabled={busy||!entry.media&&!entry.needsStargateLink} onClick={()=>play(active,entry)}><Play size={17}/></button><button className="icon-button" aria-label={'Powiąż z katalogiem: '+display(entry)} title="Powiąż z katalogiem" onClick={()=>{setTarget(entry);setCandidate(null);document.querySelector('.playlist-media-search')?.scrollIntoView({behavior:'smooth'});}}><Link2 size={17}/></button>
            <button className="icon-button" aria-label="Przesuń w górę" disabled={index===0||busy} onClick={()=>move(entry,index-1)}><ArrowUp size={17}/></button><button className="icon-button" aria-label="Przesuń w dół" disabled={index===active.entries.length-1||busy} onClick={()=>move(entry,index+1)}><ArrowDown size={17}/></button><button className="icon-button" title="Przejdź do pozycji" onClick={()=>{const value=Number(window.prompt('Nowy numer pozycji (1–'+active.entries.length+')',String(index+1)));if(Number.isInteger(value))move(entry,value-1);}}>#</button><button className="icon-button" title="Usuń z playlisty" disabled={busy} onClick={()=>removeEntry(entry)}><Trash2 size={17}/></button></div>
        </li>)}</ol>
      </section>:<div className="playlist-editor"><p>Wybierz playlistę z sekcji „Moje playlisty”, aby otworzyć listę odcinków i edytor.</p></div>}
    </div>
    </section>
  </section>;
}
