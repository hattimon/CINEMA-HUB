import {useEffect,useRef,useState} from 'react';
import {Play,Search} from 'lucide-react';
import {Modal} from './components';
import type {Playlist,PlaylistEntry} from './playlist';
import {playlistEpisodeCode} from './playlist';

type Props={
  playlist:Playlist;
  onClose:()=>void;
  onSelect:(entry:PlaylistEntry)=>void;
};

function label(entry:PlaylistEntry) {
  const title=entry.media?.title||String(entry.metadata.series_title||'');
  const episode=playlistEpisodeCode(entry);
  return [title,episode,entry.label!==title?entry.label:''].filter(Boolean).join(' · ');
}

export default function PlaylistQueue({playlist,onClose,onSelect}:Props) {
  const [query,setQuery]=useState('');
  const list=useRef<HTMLOListElement>(null);
  const titles=playlist.entries.map(entry=>({entry,title:label(entry)}));
  const visible=titles.filter(({title})=>title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  useEffect(()=>{
    list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({block:'center'});
  },[playlist.cursorId]);

  return <Modal title="Lista odtwarzania" className="source-drawer playlist-drawer"
    portalTarget={document.querySelector('.player-overlay')} onClose={onClose}>
    <div id="player-playlist-queue" className="playlist-queue-content">
      <p className="playlist-queue-name">{playlist.name}</p>
      <label className="playlist-queue-search"><Search size={17}/>
        <input aria-label="Znajdź w playliście" placeholder="Znajdź film lub odcinek"
          value={query} onChange={event=>setQuery(event.target.value)}/>
      </label>
      <ol className="playlist-queue-items" ref={list}>
        {visible.map(({entry,title})=><li key={entry.id}>
          <button type="button" aria-current={entry.id===playlist.cursorId?'true':undefined}
            data-modal-autofocus={entry.id===playlist.cursorId?true:undefined}
            disabled={!entry.media||entry.needsStargateLink}
            onClick={()=>onSelect(entry)}>
            <span className="playlist-queue-position">{entry.position+1}</span>
            <span><strong>{title}</strong><small>{entry.id===playlist.cursorId?'Teraz odtwarzane':entry.completed?'Obejrzane':entry.needsStargateLink||!entry.media?'Źródło niedostępne':entry.media.sourceName||''}</small></span>
            <Play size={16}/>
          </button>
        </li>)}
      </ol>
      {!visible.length?<p role="status">Brak pasujących pozycji.</p>:null}
    </div>
  </Modal>;
}
