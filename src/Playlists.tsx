import { useEffect,useRef,useState } from 'react';
import { Plus,Play,Trash2,Copy,Download,Upload,ArrowUp,ArrowDown,Search,RefreshCw,Save,Shuffle,Repeat,ListOrdered,Link2 } from 'lucide-react';
import { api } from './api';
import type { Item,Episode } from './types';
import type { Playlist,PlaylistSummary,PlaylistEntry,PlaylistMode } from './playlist';

type Props={onPlay:(playlist:Playlist,entry:PlaylistEntry,restart?:boolean)=>void;onMessage:(message:string)=>void};
const modes:{id:PlaylistMode;label:string;icon:typeof Play}[]=[
  {id:'once',label:'Po kolei',icon:ListOrdered},
  {id:'repeat',label:'W pętli',icon:Repeat},
  {id:'shuffle',label:'Losowo',icon:Shuffle}
];
const asEntry=(item:Item,episode?:Episode)=>({
  itemId:item.id,episodeUrl:episode?.url||null,season:episode?.season??null,episode:episode?.number??null,
  label:episode?episode.title:item.title,metadata:{title:episode?.title||item.title,series_title:item.title,season:episode?.season??null,episode:episode?.number??null}
});
const display=(entry:PlaylistEntry)=>{
  const info=entry.metadata;
  const name=entry.media?.title||String(info.series_title||'');
  const code=entry.season!==null&&entry.episode!==null?'S'+String(entry.season).padStart(2,'0')+'E'+String(entry.episode).padStart(2,'0'):'';
  return [name,code,entry.label].filter(Boolean).join(' · ');
};
export default function Playlists({onPlay,onMessage}:Props){
  const [list,setList]=useState<PlaylistSummary[]>([]),[active,setActive]=useState<Playlist|null>(null);
  const [newName,setNewName]=useState(''),[busy,setBusy]=useState(false),[search,setSearch]=useState(''),[found,setFound]=useState<Item[]>([]);
  const [insertAt,setInsertAt]=useState('end');
  const [candidate,setCandidate]=useState<Item|null>(null),[target,setTarget]=useState<PlaylistEntry|null>(null),[drag,setDrag]=useState<string|null>(null);
  const file=useRef<HTMLInputElement>(null);
  const refresh=async(selected=active?.id)=>{
    const summaries=await api<PlaylistSummary[]>('/playlists');setList(summaries);
    if(selected){const chosen=summaries.find(p=>p.id===selected);setActive(chosen?await api<Playlist>('/playlists/'+selected):null);}
  };
  useEffect(()=>{void refresh(undefined).catch(e=>onMessage(e.message));},[]);
  const run=async(work:()=>Promise<void>)=>{
    setBusy(true);
    try{await work();}catch(e){onMessage((e as Error).message);if((e as {status?:number}).status===409)await refresh().catch(()=>{});}
    finally{setBusy(false);}
  };
  const create=()=>void run(async()=>{const name=newName.trim();if(!name)return;
    const doc=await api<Playlist>('/playlists',{name});setNewName('');await refresh(doc.id);
  });
  const preset=(path:string)=>void run(async()=>{
    const response=await fetch(path,{credentials:'same-origin'});if(!response.ok)throw Error('Nie znaleziono szablonu Stargate.');
    const doc=await api<Playlist>('/playlists/import',{content:await response.text(),format:'json'});
    await refresh(doc.id);
    onMessage('Zaimportowano '+doc.entries.length+' pozycji. Nierozpoznane tytuły możesz przypisać w edytorze.');
  });
  const importFile=(source:File)=>void run(async()=>{
    const format=source.name.toLowerCase().endsWith('.csv')?'csv':'json';
    const doc=await api<Playlist>('/playlists/import',{content:await source.text(),format});
    await refresh(doc.id);
    onMessage('Zaimportowano '+doc.entries.length+' pozycji. Do powiązania z katalogiem: '+doc.entries.filter(e=>!e.media).length+'.');
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
  const linked=active?.entries.filter(e=>!!e.media).length||0;
  return <section className="playlists-page">
    <div className="page-title"><div><h1>Playlisty</h1><p>Filmy i pojedyncze odcinki z różnych seriali w wybranej przez Ciebie kolejności.</p></div>
      <button className="button secondary" onClick={()=>file.current?.click()}><Upload size={17}/>Import JSON / CSV</button>
      <input type="file" ref={file} accept=".json,.csv,application/json,text/csv" hidden onChange={e=>{const value=e.target.files?.[0];if(value)importFile(value);e.target.value='';}}/>
    </div>
    <div className="playlist-toolbar">
      <label>Nazwa nowej playlisty<input value={newName} maxLength={120} placeholder="Np. Moja kolejność oglądania" onChange={e=>setNewName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')create();}}/></label>
      <button className="button primary" disabled={busy||!newName.trim()} onClick={create}><Plus size={17}/>Utwórz</button>
    </div>
    <div className="playlist-presets"><strong>Gotowe chronologie Stargate</strong>
      <button className="button secondary" disabled={busy} onClick={()=>preset('/playlists/stargate_chronologia_cinema_hub.json')}>SG-1 + Atlantis + filmy (317)</button>
      <button className="button secondary" disabled={busy} onClick={()=>preset('/playlists/stargate_od_s08_cinema_hub.json')}>Od SG-1 S08 (162)</button>
    </div>
    <div className="playlist-columns">
      <aside className="playlist-list" aria-label="Twoje playlisty">
        {list.map(p=><button key={p.id} className={'playlist-list-item '+(active?.id===p.id?'active':'')} onClick={()=>void run(async()=>setActive(await api<Playlist>('/playlists/'+p.id)))}><strong>{p.name}</strong><small>{p.itemCount} pozycji · {p.completedCount}/{p.itemCount} obejrzanych · {p.mode==='once'?'Po kolei':p.mode==='repeat'?'W pętli':'Losowo'}</small>{p.itemCount>0&&p.completedCount===p.itemCount?<span className="playlist-done">✓ Ukończono</span>:p.cursorId?<span className="playlist-resume">● W trakcie</span>:null}</button>)}
        {!list.length?<p>Nie masz jeszcze playlist. Możesz utworzyć własną lub zaimportować Stargate.</p>:null}
      </aside>
      {active?<div className="playlist-editor">
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
        <div className="playlist-actions"><button className="button primary" disabled={!active.entries.length||busy} onClick={()=>{const entry=active.entries.find(e=>e.id===active.cursorId)||active.entries[0];onPlay(active,entry);}}><Play size={16}/>{active.cursorId?'Kontynuuj playlistę':'Odtwórz playlistę'}</button><button className="button secondary" disabled={!active.entries.length} onClick={()=>onPlay(active,active.entries[0],true)}>Od początku</button><button className="button secondary" onClick={()=>void refresh(active.id)}><RefreshCw size={16}/>Odśwież</button></div>
        {linked<active.entries.length?<p className="source-error" role="status">Niepowiązane: {active.entries.length-linked} z {active.entries.length} pozycji. Użyj przycisku powiązania obok wybranego odcinka. Import zachowuje oryginalne opisy i kolejność.</p>:null}
        <ol className="playlist-entries">{active.entries.map((entry,index)=><li key={entry.id} draggable onDragStart={()=>setDrag(entry.id)} onDragEnd={()=>setDrag(null)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!drag||drag===entry.id)return;const ids=active.entries.map(e=>e.id),from=ids.indexOf(drag);if(from===-1)return;ids.splice(from,1);ids.splice(index,0,drag);reorder(ids);setDrag(null);}}>
          <span className="playlist-position">{index+1}</span><div className="playlist-entry-label"><strong>{display(entry)}</strong><small>{entry.completed?'✓ Ukończono · ':''}{entry.media?'Powiązano z katalogiem':'Brak powiązania — wybierz odpowiedni tytuł'}{entry.id===active.cursorId?' · Ostatnio odtwarzane':''}{entry.playbackPosition>0&&!entry.completed?' · Wznowienie od '+Math.floor(entry.playbackPosition/60)+' min':''}</small></div>
          <div className="playlist-entry-actions"><button className="icon-button" title="Odtwórz od tej pozycji" disabled={!entry.media} onClick={()=>onPlay(active,entry)}><Play size={17}/></button><button className="icon-button" title="Powiąż z katalogiem" onClick={()=>{setTarget(entry);setCandidate(null);document.querySelector('.playlist-media-search')?.scrollIntoView({behavior:'smooth'});}}><Link2 size={17}/></button>
            <button className="icon-button" aria-label="Przesuń w górę" disabled={index===0||busy} onClick={()=>move(entry,index-1)}><ArrowUp size={17}/></button><button className="icon-button" aria-label="Przesuń w dół" disabled={index===active.entries.length-1||busy} onClick={()=>move(entry,index+1)}><ArrowDown size={17}/></button><button className="icon-button" title="Przejdź do pozycji" onClick={()=>{const value=Number(window.prompt('Nowy numer pozycji (1–'+active.entries.length+')',String(index+1)));if(Number.isInteger(value))move(entry,value-1);}}>#</button><button className="icon-button" title="Usuń z playlisty" disabled={busy} onClick={()=>removeEntry(entry)}><Trash2 size={17}/></button></div>
        </li>)}</ol>
      </div>:<div className="playlist-editor"><p>Wybierz playlistę z lewej strony.</p></div>}
    </div>
  </section>;
}
