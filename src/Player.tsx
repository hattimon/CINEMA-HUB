import { useEffect,useRef,useState } from 'react';
import { X,Maximize,Download,SkipBack,SkipForward,PictureInPicture2,Volume2,LoaderCircle,Repeat,ListVideo,Play,Pause,Rewind,FastForward,RotateCcw,Square,MoreHorizontal } from 'lucide-react';
import { api,clock } from './api';
import {BrowserAudioLevel} from './audioLevel';
import { saveProgress,latestProgress,flushProgress } from './progress';
import type { PlaylistMode } from './playlist';
import type { PlayerState,Progress,Settings } from './types';
const effects=[['none','Bez efektu'],['crt','CRT klasyczny'],['crt-warm','CRT ciepły'],['crt-green','Zielony kineskop']] as const;
const profiles=[['natural','Naturalny'],['projector','Projektor — jaśniejszy'],['cinema','Kino — większy kontrast'],['soft','Łagodne SD']] as const;
type Presentation=Pick<Settings,'videoEffect'|'volumeBoost'|'imageProfile'|'audioMode'|'normalizerTargetDb'>;
type PlaybackSnapshot={itemId:string;episode:string;season?:number;number?:number;title?:string;playbackId?:string;native:boolean;restoring:boolean;completed:boolean;finishedNotified:boolean;disposed:boolean;position:number;duration:number};
type Props={imageProfile:Settings['imageProfile'];videoEffect:Settings['videoEffect'];volumeBoost:Settings['volumeBoost'];audioMode:Settings['audioMode'];normalizerTargetDb:number;onPresentationChange:(patch:Partial<Presentation>)=>void;state:PlayerState;onClose:()=>void;onNext?:()=>void;onPrevious?:()=>void;onCompleted?:()=>void;onFinished?:()=>void;finished?:boolean;onReplayPlaylist?:()=>void;playlistLabel?:string;playlistNextLabel?:string;playlistMode?:PlaylistMode;onChangePlaylistMode?:(mode:PlaylistMode)=>void;onOpenPlaylist?:()=>void;onChooseSource:()=>void;onShowDetails:()=>void;detailsOpen:boolean;resumeRequest:number;onToggleAutoplay:(enabled:boolean)=>void;onTogglePreferManualHost:(enabled:boolean)=>void;onError:(text:string)=>void;onSave?:()=>void;autoAdvance?:boolean;preferManualHost?:boolean;fullscreen:boolean;onFullscreenChange:(enabled:boolean)=>void;panelOpen:boolean;panelMode:'sources'|'details'|'save'|'playlist'|'none';pendingMessage?:string;pendingBusy:boolean;retryRemaining:number;blockUnknown:boolean;onStopCheck:()=>void;onRetry:()=>void;onPosition:(value:number,playbackId?:string,force?:boolean)=>void};
export default function Player({imageProfile,videoEffect,volumeBoost,audioMode='manual',normalizerTargetDb=-21,onPresentationChange,state,onClose,onNext,onPrevious,onCompleted,onFinished,finished=false,onReplayPlaylist,playlistLabel,playlistNextLabel,playlistMode,onChangePlaylistMode,onOpenPlaylist,onChooseSource,onShowDetails,detailsOpen,resumeRequest,onToggleAutoplay,onTogglePreferManualHost,onError,onSave,autoAdvance=false,preferManualHost=false,fullscreen,onFullscreenChange,panelOpen,panelMode,pendingMessage,pendingBusy,retryRemaining,blockUnknown,onStopCheck,onRetry,onPosition}:Props){
  const video=useRef<HTMLVideoElement>(null),box=useRef<HTMLDialogElement>(null),last=useRef(0),shortRejected=useRef(false),nativePlayback=useRef(''),playback=useRef<PlaybackSnapshot|null>(null);
  const [notice,setNotice]=useState('');const [menuOpen,setMenuOpen]=useState(false);const audioGraph=useRef<BrowserAudioLevel|null>(null);
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[playing,setPlaying]=useState(false),[position,setPosition]=useState(0),[duration,setDuration]=useState(0);
  const pendingEffectsPanel=useRef(false);
  const actions=useRef({onClose,onNext,onPrevious,onCompleted,onFinished,onOpenPlaylist,onChooseSource,onShowDetails,onToggleAutoplay,onTogglePreferManualHost,onError,onSave,autoAdvance,preferManualHost,fullscreen,onFullscreenChange,onPosition,onRetry,onPresentationChange,imageProfile,videoEffect,volumeBoost,panelOpen,panelMode});
  actions.current={onClose,onNext,onPrevious,onCompleted,onFinished,onOpenPlaylist,onChooseSource,onShowDetails,onToggleAutoplay,onTogglePreferManualHost,onError,onSave,autoAdvance,preferManualHost,fullscreen,onFullscreenChange,onPosition,onRetry,onPresentationChange,imageProfile,videoEffect,volumeBoost,panelOpen,panelMode};
  const native=!!window.CinemaNative&&!!state.source&&!state.localURL&&!state.pending,canNext=!!onNext,canPrevious=!!onPrevious;
  const episodeNumber=state.episode?.lastNumber?state.episode.number+'–'+state.episode.lastNumber:state.episode?.number;
  const command=(action:string,extra:Record<string,unknown>={})=>{if(window.CinemaNative&&state.source)window.CinemaNative.postMessage(JSON.stringify({type:action,playbackId:state.source.playbackId,...extra}));};
  useEffect(()=>{const dialog=box.current;if(detailsOpen)dialog?.close();else if(!dialog?.open)dialog?.showModal();return()=>dialog?.close();},[detailsOpen]);
  useEffect(()=>{if(detailsOpen)return;document.documentElement.classList.add('player-open');return()=>document.documentElement.classList.remove('player-open');},[detailsOpen]);
  useEffect(()=>{if(!finished||detailsOpen)return;const frame=requestAnimationFrame(()=>box.current?.querySelector<HTMLButtonElement>('[data-playlist-finished-focus]')?.focus());return()=>cancelAnimationFrame(frame);},[finished,detailsOpen]);
  useEffect(()=>{const changed=()=>actions.current.onFullscreenChange(!!document.fullscreenElement&&!!box.current&&document.fullscreenElement.contains(box.current));document.addEventListener('fullscreenchange',changed);return()=>document.removeEventListener('fullscreenchange',changed);},[]);
  useEffect(()=>{
    if(native)return;const element=video.current;
    if(!element||audioMode==='manual'&&volumeBoost===100&&!audioGraph.current)return;
    try{
      audioGraph.current??=new BrowserAudioLevel(element);
      audioGraph.current.configure({mode:audioMode,boost:volumeBoost,targetDb:normalizerTargetDb},state.localURL||state.source?.playbackId||state.item.id);
    }catch{setNotice('Ta przeglądarka nie udostępnia przetwarzania dźwięku.');}
  },[native,audioMode,volumeBoost,normalizerTargetDb,state.localURL,state.source?.playbackId,state.item.id]);
  useEffect(()=>()=>audioGraph.current?.destroy(),[]);
  const saveSnapshot=(session:PlaybackSnapshot,completed=false,v=video.current)=>{
    if(session.disposed||session.restoring||session.completed&&!completed)return Promise.resolve();
    const duration=session.native?session.duration:v?.duration;
    const position=session.native?session.position:v?.currentTime;
    if(!Number.isFinite(duration)||!duration||duration<=0||!Number.isFinite(position)||position===undefined||position<0)return Promise.resolve();
    if(completed)session.completed=true;
    return saveProgress(session.itemId,{episode:session.episode,position,duration,completed:session.completed,season:session.season,number:session.number,title:session.title});
  };
  const save=(completed=false)=>{const session=playback.current;return session?saveSnapshot(session,completed):Promise.resolve();};
  useEffect(()=>{const snapshot=()=>{void save();void flushProgress(true);};const hidden=()=>{if(document.hidden)snapshot();};window.addEventListener('pagehide',snapshot);document.addEventListener('visibilitychange',hidden);return()=>{window.removeEventListener('pagehide',snapshot);document.removeEventListener('visibilitychange',hidden);};},[]);
  useEffect(()=>{const v=video.current;if(!v)return;let disposed=false,destroy:()=>void=()=>{};setError('');setLoading(true);setPlaying(false);setDuration(0);setPosition(0);last.current=0;shortRejected.current=false;
    const session:PlaybackSnapshot={itemId:state.item.id,episode:state.episode?.url||'',season:state.episode?.season,number:state.episode?.number,title:state.episode?.title,playbackId:state.source?.playbackId,native,restoring:true,completed:false,finishedNotified:false,disposed:false,position:0,duration:0};
    playback.current=state.pending?null:session;
    if(state.pending)return;
    let receivedMedia=false,nativeWaiting=true,watchPosition=0,watchAt=Date.now(),failed=false;
    const watch=setInterval(()=>{
       if(disposed||failed)return;
       if(document.hidden||actions.current.panelOpen){watchAt=Date.now();if(!native)watchPosition=v.currentTime;return;}
      if(native&&receivedMedia&&!nativeWaiting){watchAt=Date.now();return;}
      if(!native&&v.paused&&v.readyState>=2){watchAt=Date.now();return;}
      if(!native&&Math.abs(v.currentTime-watchPosition)>.1){watchPosition=v.currentTime;watchAt=Date.now();return;}
      if(Date.now()-watchAt<45000)return;
      failed=true;setLoading(false);setPlaying(false);const reason='Odtwarzacz nie zrobił postępu przez 45 sekund. Możesz ponowić próbę lub zmienić hosting.';setError(reason);actions.current.onError(reason);
    },1000);
    const savedPosition=async()=>{
      const matches=(value:Progress)=>value.episode===(state.episode?.url||'')||!!state.episode&&value.season===state.episode.season&&value.number===state.episode.number;
      let saved=state.item.progress&&matches(state.item.progress)?state.item.progress:undefined;
      try{const all=await api<Progress[]>('/items/'+state.item.id+'/progress');saved=all.find(matches)||saved;}catch{}
      const progress=latestProgress(state.item.id,saved,state.episode);
      return state.position??(!progress?.completed?progress?.position||0:0);
    };
    const start=async()=>{
      if(native&&window.CinemaNative&&state.source){
        const bridge=window.CinemaNative,playbackId=state.source.playbackId;
        const listener=(event:{data:string})=>{let result:{playbackId:string;type:string;position?:number;duration?:number;playing?:boolean;completed?:boolean;ended?:boolean;message?:string;enabled?:boolean;value?:string;buffering?:boolean};try{result=JSON.parse(event.data);}catch{return;}if(disposed||session.disposed||playback.current!==session||result.playbackId!==playbackId)return;const current=actions.current;
          if(result.type==='progress'&&Number.isFinite(result.duration)&&Number(result.duration)>0){receivedMedia=true;nativeWaiting=result.buffering===true;session.restoring=false;session.duration=Number(result.duration);session.position=Math.max(0,Number(result.position)||0);if(Math.abs(session.position-watchPosition)>.1){watchPosition=session.position;watchAt=Date.now();}setLoading(nativeWaiting);setDuration(session.duration);setPosition(session.position);if(session.position>0)current.onPosition(session.position,playbackId,!result.playing);setPlaying(!!result.playing);if(session.position>0||result.completed)void saveSnapshot(session,!!result.completed);}
          if(result.type==='closed'){if(result.ended){if(session.finishedNotified)return;session.finishedNotified=true;void saveSnapshot(session,true);current.onCompleted?.();if(current.autoAdvance&&current.onNext)current.onNext();else if(current.onFinished)current.onFinished();else current.onClose();}else{void saveSnapshot(session);current.onClose();}}
          if(result.type==='next')current.onNext?.();if(result.type==='previous')current.onPrevious?.();
          if(result.type==='sources')current.onChooseSource();if(result.type==='playlist')current.onOpenPlaylist?.();if(result.type==='save')current.onSave?.();
          if(result.type==='details')current.onShowDetails();
          if(result.type==='fullscreen')current.onFullscreenChange(!!result.enabled);
          if(result.type==='autoplay')current.onToggleAutoplay(!!result.enabled);
          if(result.type==='hosting')current.onTogglePreferManualHost(!!result.enabled);
          if(result.type==='retry')current.onRetry();
          if(result.type==='profile'&&profiles.some(([value])=>value===result.value))current.onPresentationChange({imageProfile:result.value as Settings['imageProfile']});
          if(result.type==='effect'&&effects.some(([value])=>value===result.value))current.onPresentationChange({videoEffect:result.value as Settings['videoEffect']});
          if(result.type==='boost'&&[100,150,200,250,300].includes(Number(result.value)))current.onPresentationChange({audioMode:'manual',volumeBoost:Number(result.value) as Settings['volumeBoost']});
          if(result.type==='notice')setNotice(result.message||'Funkcja nie jest dostępna na urządzeniu.');
          if(result.type==='error'){failed=true;setLoading(false);setPlaying(false);setError(result.message||'Nie udało się uruchomić źródła.');current.onError(result.message?.includes('60 sekund')?'Materiał krótszy niż 60 sekund — pomijam źródło.':'Błąd odtwarzania na urządzeniu.');}
        };
        bridge.addEventListener('message',listener);destroy=()=>{bridge.removeEventListener('message',listener);if(nativePlayback.current===playbackId){nativePlayback.current='';bridge.postMessage(JSON.stringify({type:'stop',playbackId}));}};
        const seek=await savedPosition();if(disposed)return;
        const current=actions.current;nativePlayback.current=playbackId;
        bridge.postMessage(JSON.stringify({type:'play',playbackId,kind:state.source.kind||'mp4',title:state.item.title,subtitle:state.episode?`S${state.episode.season}E${episodeNumber} · ${state.episode.title}`:state.source.host+' · '+state.source.version+' · '+state.source.quality,position:seek,autoAdvance:current.autoAdvance,preferManualHost:current.preferManualHost,fullscreen:current.fullscreen,imageProfile:current.imageProfile,videoEffect:current.videoEffect,volumeBoost:current.volumeBoost,series:!!state.episode,canNext:!!current.onNext,canPrevious:!!current.onPrevious,hasPlaylist:!!current.onOpenPlaylist}));
        if(pendingEffectsPanel.current){pendingEffectsPanel.current=false;bridge.postMessage(JSON.stringify({type:'panel',playbackId,open:true,mode:'effects'}));}
        bridge.postMessage(JSON.stringify({type:'panel',playbackId,open:current.panelOpen}));return;
      }
      const url=state.localURL||'/api/playback/'+state.source?.playbackId+'/media';
      if(state.source?.kind==='hls'){
        const {default:Hls}=await import('hls.js');
        if(disposed)return;
        if(Hls.isSupported()){
          const hls=new Hls({enableWorker:true,maxBufferLength:30,maxMaxBufferLength:60,backBufferLength:10});
          destroy=()=>hls.destroy();
          hls.on(Hls.Events.ERROR,(_event,data)=>{
            if(!disposed&&data.fatal){setError('Przerwano połączenie ze źródłem.');actions.current.onError('Źródło przestało odpowiadać.');}
          });
          hls.loadSource(url);hls.attachMedia(v);
        }else if(v.canPlayType('application/vnd.apple.mpegurl'))v.src=url;
        else{actions.current.onError('Ten strumień nie jest obsługiwany.');return;}
      }else v.src=url;
      const seek=await savedPosition();if(disposed)return;
      const resume=()=>{if(disposed||session.disposed)return;if(seek&&Number.isFinite(v.duration)&&seek<v.duration-5)v.currentTime=seek;session.restoring=false;void v.play().catch(()=>setPlaying(false));};if(v.readyState>=1)resume();else{v.addEventListener('loadedmetadata',resume,{once:true});const prior=destroy;destroy=()=>{v.removeEventListener('loadedmetadata',resume);prior();};}
    };
    void start().catch(()=>{if(!disposed){setLoading(false);setError('Nie udało się uruchomić odtwarzacza.');actions.current.onError('Nie udało się uruchomić źródła.');}});
    return()=>{void saveSnapshot(session);session.disposed=true;if(playback.current===session)playback.current=null;disposed=true;clearInterval(watch);pendingEffectsPanel.current=false;destroy();v.pause();v.removeAttribute('src');v.load();};
  },[state.localURL,state.source?.playbackId,state.pending]);
  useEffect(()=>{if(native&&state.source&&nativePlayback.current===state.source.playbackId)command('settings',{autoAdvance,preferManualHost,fullscreen,canNext,canPrevious,hasPlaylist:!!onOpenPlaylist,videoEffect,volumeBoost,imageProfile});},[native,autoAdvance,preferManualHost,fullscreen,canNext,canPrevious,onOpenPlaylist,state.source?.playbackId,videoEffect,volumeBoost,imageProfile]);
  useEffect(()=>{if(native&&state.source&&nativePlayback.current===state.source.playbackId)command('panel',{open:panelOpen,mode:panelMode});},[native,panelOpen,panelMode,state.source?.playbackId]);
  useEffect(()=>{if(!resumeRequest||state.pending)return;if(native){if(nativePlayback.current===state.source?.playbackId)command('transport',{action:'play'});}else void video.current?.play().catch(()=>{});},[resumeRequest]);
  const togglePause=()=>{if(native){command('transport',{action:'toggle'});return;}const v=video.current;if(v){if(v.paused){audioGraph.current?.resume();void v.play().catch(()=>{});}else v.pause();}};
  const seek=(delta:number)=>{if(native){command('transport',{action:'seek',delta:delta*1000});return;}const v=video.current;if(v&&Number.isFinite(v.duration))v.currentTime=Math.max(0,Math.min(v.duration-1,v.currentTime+delta));};
  const seekTo=(value:number)=>{if(!Number.isFinite(value)||duration<=0)return;const target=Math.max(0,Math.min(duration-1,value));if(native)command('transport',{action:'seekTo',position:Math.round(target*1000)});else if(video.current)video.current.currentTime=target;setPosition(target);actions.current.onPosition(target,state.source?.playbackId);};
  const toggleFullscreen=()=>{if(native){command('fullscreen',{enabled:!fullscreen});return;}if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen().catch(()=>{});};
  const showEffectsMenu=()=>{if(native){if(nativePlayback.current===state.source?.playbackId)command('panel',{open:true,mode:'effects'});else pendingEffectsPanel.current=true;return;}setMenuOpen(open=>!open);};
  useEffect(()=>{if(native)setMenuOpen(false);},[native]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.defaultPrevented||panelOpen)return;const target=event.target as HTMLElement;if(event.key==='ContextMenu'||event.key==='Menu'||event.key.toLowerCase()==='m'){event.preventDefault();showEffectsMenu();return;}if(event.key==='ArrowUp'&&loading&&!playing&&!target.closest('.player-options')){event.preventDefault();actions.current.onShowDetails();return;}if(event.key==='Escape'){event.preventDefault();if(menuOpen){setMenuOpen(false);return;}if(document.fullscreenElement)void document.exitFullscreen();else actions.current.onClose();return;}if(['BUTTON','INPUT','SELECT','TEXTAREA'].includes(target.tagName))return;if(event.code==='Space'||event.key==='Enter'){event.preventDefault();togglePause();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[native,panelOpen,state.source?.playbackId,loading,playing,menuOpen]);
  return <dialog ref={box} onPointerDown={()=>audioGraph.current?.resume()} onKeyDown={()=>audioGraph.current?.resume()} data-player-waiting={loading&&!playing?'true':undefined} className={'player-overlay effect-'+videoEffect+' profile-'+imageProfile+(fullscreen?' is-fullscreen':'')+(playing?' is-playing':'')+(menuOpen&&!native?' has-player-menu':'')+(native&&(panelMode==='sources'||panelMode==='playlist')?' has-source-drawer':'')} onClick={event=>event.stopPropagation()} onCancel={event=>{event.preventDefault();event.stopPropagation();if(menuOpen&&!native){setMenuOpen(false);return;}void save();onClose();}}>
    <header className="player-header"><div><h2>{state.item.title}</h2><p>{state.episode?`Sezon ${state.episode.season} · ${state.episode.lastNumber?'Odcinki':'Odcinek'} ${episodeNumber} · ${state.episode.title}`:state.source?.host}{state.source?' · '+state.source.version+' · '+state.source.quality:''}</p>{playlistLabel?<p className="player-playlist-context">{playlistLabel}{playlistNextLabel?<><br/>{playlistNextLabel}</>:null}</p>:null}</div><button className="icon-button" aria-label="Zamknij odtwarzacz" onClick={()=>{void save();onClose();}}><X/></button></header>
    {finished?<section className="playlist-finished" role="status" aria-label="Zakończono playlistę"><h2>Playlista zakończona</h2><p>Wszystkie odcinki zostały odtworzone. Możesz rozpocząć od początku albo wrócić do listy.</p><div className="playlist-finished-actions">{onReplayPlaylist?<button type="button" data-playlist-finished-focus className="button primary" onClick={onReplayPlaylist}><RotateCcw size={18}/>Odtwórz od początku</button>:null}{onOpenPlaylist?<button type="button" className="button secondary" onClick={onOpenPlaylist}><ListVideo size={18}/>Lista odcinków</button>:null}<button type="button" className="button secondary" onClick={onClose}>Zamknij</button></div></section>:null}
    <div className="video-stage"><video ref={video} controls={!fullscreen||!playing} playsInline preload="metadata" onClick={event=>{if(fullscreen&&!event.currentTarget.controls)togglePause();}} onLoadedMetadata={()=>{const value=video.current?.duration;if(value&&Number.isFinite(value)){setDuration(value);if(value<60&&!shortRejected.current){shortRejected.current=true;video.current?.pause();onError('Materiał krótszy niż 60 sekund — pomijam źródło.');}}}} onPlaying={()=>{setPlaying(true);setLoading(false);}} onWaiting={()=>setLoading(true)} onCanPlay={()=>setLoading(false)} onPause={()=>{setPlaying(false);const session=playback.current;if(!session||session.native||session.restoring||session.disposed)return;actions.current.onPosition(video.current?.currentTime||0,session.playbackId,true);void save();}} onTimeUpdate={()=>{const v=video.current,session=playback.current;if(v&&session&&!session.native&&!session.restoring&&!session.disposed){setPosition(v.currentTime);actions.current.onPosition(v.currentTime,session.playbackId);if(Math.abs(v.currentTime-last.current)>=5){last.current=v.currentTime;void save();}}}} onSeeked={()=>{const session=playback.current;if(!session||session.native||session.restoring||session.disposed)return;actions.current.onPosition(video.current?.currentTime||0,session.playbackId,true);void save();}} onEnded={()=>{const session=playback.current;if(shortRejected.current||!session||session.native||session.restoring||session.disposed||session.finishedNotified||!video.current?.ended)return;session.finishedNotified=true;void save(true);const current=actions.current;current.onCompleted?.();if(current.autoAdvance){if(current.onNext)current.onNext();else if(current.onFinished)current.onFinished();}}} onError={()=>{if(state.pending||native||!video.current?.error)return;setError('Nie udało się odtworzyć wideo.');actions.current.onError('Błąd odtwarzania wybranego źródła.');}}/>
      {!native&&fullscreen&&playing?<button className="icon-button player-live-menu" aria-label="Menu efektów podczas odtwarzania" onClick={()=>setMenuOpen(open=>!open)}><MoreHorizontal/></button>:null}
      {loading&&!error?<div className="video-loading" role="status">{!state.pending||pendingBusy?<LoaderCircle className="spin"/>:null}<span>{state.pending?retryRemaining>0?'Portal ograniczył dostęp. Ponowna próba za '+clock(retryRemaining)+'.':blockUnknown?'Portal ograniczył dostęp. Termin odblokowania nie jest znany.':pendingMessage||(pendingBusy?'Przygotowuję kolejny odcinek…':'Nie udało się przygotować odcinka. Wybierz hosting ręcznie.'):'Przygotowuję seans…'}</span></div>:null}
      {error?<div className="player-error"><p>{error}</p><button className="button secondary" disabled={retryRemaining>0} title="Ponów odtwarzanie" onClick={onRetry}><RotateCcw size={16}/>Ponów odtwarzanie</button><button className="button secondary" title="Zmień źródło" onClick={onChooseSource}>Wybierz inne źródło</button></div>:null}
    </div>
    <footer className="player-footer"><label className="player-timeline"><span>{clock(position)}</span><input type="range" aria-label="Pozycja odtwarzania" min={0} max={Math.max(0,duration-1)} step={1} value={Math.min(position,Math.max(0,duration-1))} disabled={state.pending||!!error||duration<=0} onChange={event=>seekTo(Number(event.target.value))} onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();event.stopPropagation();seekTo(position+(event.key==='ArrowRight'?10:-10));}}}/><span>{duration>0?clock(duration):'—'}</span></label><span><Volume2 size={15}/>{playing?'Odtwarzanie':'Pauza'}</span><div className="player-actions">
      <button className="button secondary" disabled={state.pending||!!error} onClick={()=>seek(-10)} aria-label="Cofnij 10 sekund"><Rewind size={16}/>10 s</button>
      <button className="button secondary" disabled={state.pending||!!error} title={playing?"Pauza":"Wznów"} onClick={togglePause}>{playing?<Pause size={16}/>:<Play size={16}/>} {playing?'Pauza':'Wznów'}</button>
      <button className="button secondary" disabled={state.pending||!!error} onClick={()=>seek(10)} aria-label="Przewiń 10 sekund"><FastForward size={16}/>10 s</button>
      {onSave?<button className="button secondary" title="Zapisz film" onClick={onSave}><Download size={16}/>Zapisz</button>:null}
      {pendingBusy?<button className="button secondary" title="Zatrzymaj automat" onClick={onStopCheck}><Square size={16}/>Zatrzymaj automat</button>:null}
      <button className="button secondary" disabled={retryRemaining>0} title="Ponów odtwarzanie" onClick={onRetry}><RotateCcw size={16}/>Ponów odtwarzanie</button>
      <button className="button secondary" onClick={onChooseSource}><ListVideo size={16}/>Zmień źródło</button>
      {playlistLabel&&onOpenPlaylist?<button className="button secondary" aria-controls="player-playlist-queue" aria-expanded={panelMode==='playlist'} onClick={onOpenPlaylist}><ListVideo size={16}/>Playlista</button>:null}
      {playlistMode&&onChangePlaylistMode?<label className="player-option playlist-mode-option">Tryb playlisty<select aria-label="Tryb playlisty" value={playlistMode} onChange={event=>onChangePlaylistMode(event.target.value as PlaylistMode)}><option value="once">Po kolei</option><option value="repeat">W pętli</option><option value="shuffle">Losowo</option></select></label>:null}
      <button data-player-details className="button secondary" title="Szczegóły i ulubione" onClick={onShowDetails}><ListVideo size={16}/>Szczegóły i ulubione</button>
      {onPrevious?<button className="button secondary" title="Poprzedni odcinek" onClick={onPrevious}><SkipBack size={16}/>Poprzedni</button>:null}{onNext?<button className="button secondary" title="Następny odcinek" onClick={onNext}><SkipForward size={16}/>Następny</button>:null}
      {state.episode&&!playlistLabel?<button className={autoAdvance?'button primary':'button secondary'} aria-pressed={autoAdvance} title={autoAdvance?"Autoplay włączone":"Autoplay wyłączone"} onClick={()=>onToggleAutoplay(!autoAdvance)}><Repeat size={16}/>Autoplay {autoAdvance?'WŁ.':'WYŁ.'}</button>:null}
      {state.episode&&state.source?<label className="player-option" title="Ten hosting w kolejnych odcinkach"><input type="checkbox" checked={preferManualHost} onChange={event=>onTogglePreferManualHost(event.target.checked)}/>Ten hosting w kolejnych odcinkach</label>:null}
      {!native?<button className="icon-button" aria-label="Obraz w obrazie" onClick={()=>void video.current?.requestPictureInPicture?.().catch(()=>{})}><PictureInPicture2/></button>:null}
      <button className="button secondary" disabled={state.pending} title={fullscreen?"Wróć do menu":"Pełny ekran"} onClick={toggleFullscreen}><Maximize size={16}/>{fullscreen?'Wróć do menu':'Pełny ekran'}</button>
      <button className="icon-button" aria-label="Menu odtwarzacza" title="Obraz i głośność" aria-expanded={!native&&menuOpen} onClick={showEffectsMenu}><MoreHorizontal/></button>
    </div>{menuOpen&&!native?<div className="player-options" role="menu" aria-label="Obraz i głośność"><strong>Korekcja obrazu</strong>{profiles.map(([value,label])=><button role="menuitemradio" aria-label={label} aria-checked={imageProfile===value} key={value} onClick={()=>onPresentationChange({imageProfile:value})}>{label}</button>)}<strong>Efekt retro</strong>{notice?<p role="status">{notice}</p>:null}{effects.map(([value,label])=><button role="menuitemradio" aria-label={label} aria-checked={videoEffect===value} key={value} onClick={()=>onPresentationChange({videoEffect:value})}>{label}</button>)}<strong>Wzmocnienie dźwięku</strong>{([100,150,200,250,300] as const).map(value=><button role="menuitemradio" aria-label={value===100?'Normalnie':value+'%'} aria-checked={audioMode==='manual'&&volumeBoost===value} key={value} onClick={()=>onPresentationChange({audioMode:'manual',volumeBoost:value})}>{value===100?'Normalnie':value+'%'}</button>)}<button role="menuitemradio" aria-label="AUTO" aria-checked={audioMode==='auto'} onClick={()=>onPresentationChange({audioMode:'auto'})}>AUTO — dopasuj do nagrania</button><button role="menuitemradio" aria-label="Normalizer" aria-checked={audioMode==='normalizer'} onClick={()=>onPresentationChange({audioMode:'normalizer'})}>Normalizer — wyrównaj poziom</button>{audioMode==='normalizer'?<label className="normalizer-level">Poziom Normalizera<select aria-label="Poziom Normalizera" value={normalizerTargetDb} onChange={event=>onPresentationChange({normalizerTargetDb:Number(event.target.value)})}>{Array.from({length:19},(_,index)=>index-30).map(value=><option key={value} value={value}>{value} dBFS{value===-21?' — standardowy':''}</option>)}</select><small>Poziom sygnału RMS; −30 ciszej, −12 głośniej. Wzmocnienie maks. 300%.</small></label>:null}<button onClick={()=>setMenuOpen(false)}>Zamknij menu</button></div>:null}</footer>
  </dialog>;
}
