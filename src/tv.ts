declare global {interface Window {CinemaHubTV?:{back:()=>boolean;key:(key:string)=>boolean};CinemaNative?:{postMessage:(message:string)=>void;addEventListener:(type:string,listener:(event:{data:string})=>void)=>void;removeEventListener:(type:string,listener:(event:{data:string})=>void)=>void}}}

const focusControl=(element:HTMLElement)=>{element.focus({preventScroll:true});element.scrollIntoView({block:'nearest',inline:'nearest'});};
const visible=(element:HTMLElement)=>!element.hasAttribute('disabled')&&!element.closest('[hidden],[aria-hidden="true"],[inert]')&&element.getBoundingClientRect().width>0&&element.getBoundingClientRect().height>0;
const sourceControls=(section:HTMLElement)=>[...section.querySelectorAll<HTMLElement>('button,a[href],input:not([type=hidden]),select')].filter(visible);
export function focusTVSources(section:HTMLElement){const primary=section.querySelector<HTMLElement>('[data-tv-source-primary]'),target=primary&&visible(primary)?primary:sourceControls(section)[0]||section;section.scrollIntoView({block:'start',behavior:'instant'});focusControl(target);}
export function enterTVGroup(group:HTMLElement){const rows=[...group.querySelectorAll<HTMLButtonElement>('[data-tv-item]')].filter(row=>!row.disabled);const selected=rows.find(row=>row.classList.contains('active'));if(selected||rows[0])focusControl(selected||rows[0]);}

export function installTV() {
  if(!/CinemaHubTV\//.test(navigator.userAgent)&&new URLSearchParams(location.search).get('tv')!=='1')return;
  document.documentElement.dataset.tv='true';
  const scope=()=>document.activeElement?.closest('dialog[open]')||[...document.querySelectorAll('dialog[open]')].at(-1)||document.body;
  const controls=()=>[...scope().querySelectorAll<HTMLElement>('button,a[href],input:not([type=hidden]),select,textarea,summary,[tabindex="0"]')].filter(el=>visible(el)&&(!el.matches('[data-tv-item]')||document.activeElement?.matches('[data-tv-item]')&&!!el.closest('[data-tv-group]')?.contains(document.activeElement))&&(!el.matches('[data-tv-sources]')||el===document.activeElement||!el.contains(document.activeElement)));
  const focus=focusControl;
  const focusDetails=(element:HTMLElement)=>{focus(element);element.closest('dialog')?.scrollTo({top:0,behavior:'instant'});};
  const back=()=>{const target=document.activeElement as HTMLElement;if(target?.matches('input[data-tv-range][data-tv-editing="true"]')){target.click();return true;}const group=target?.closest<HTMLElement>('[data-tv-group]');if(group&&target!==group){focus(group);return true;}const current=scope();if(current.matches('.player-overlay')&&document.fullscreenElement){void document.exitFullscreen();return true;}const close=current.querySelector<HTMLButtonElement>('[aria-label="Zamknij odtwarzacz"],[aria-label="Zamknij"]');if(close){close.click();return true;}return false;};
  const handle=(key:string,target=document.activeElement as HTMLElement)=>{
    if(['Escape','BrowserBack'].includes(key))return back();
    if(key==='ArrowUp'&&target?.closest('.player-overlay[data-player-waiting="true"]')&&!target.closest('.player-options')){const details=target.closest('.player-overlay')?.querySelector<HTMLButtonElement>('[data-player-details]');if(details){details.click();return true;}}
    const range=target?.matches('input[type="range"][data-tv-range]');
    if(range){
      if(['Enter',' '].includes(key)){target.click();return true;}
      // The WebView and keyboard share this path; native range keys run only after OK.
      if(target.dataset.tvEditing==='true')return false;
      if(['Home','End','PageUp','PageDown'].includes(key))return true;
    }
    const searchInput=target?.matches('.search-box input')?target as HTMLInputElement:null;
    if(searchInput&&key==='ArrowRight'&&searchInput.selectionStart===searchInput.value.length&&searchInput.selectionEnd===searchInput.value.length){const next=searchInput.parentElement?.querySelector<HTMLElement>('button');if(next){focus(next);return true;}}
    const leaveSearch=searchInput&&(['ArrowUp','ArrowDown'].includes(key)||key==='ArrowLeft'&&searchInput.selectionStart===0&&searchInput.selectionEnd===0);
    if(!target||target.tagName==='SELECT'||target.tagName==='TEXTAREA'||target.tagName==='IFRAME'||target.tagName==='INPUT'&&target.getAttribute('type')!=='checkbox'&&!range&&!leaveSearch)return false;
    const group=target.closest<HTMLElement>('[data-tv-group]');
    if(key==='ArrowUp'&&target.matches('[data-tv-exit-left],[data-tv-exit-right]')){const favorite=scope().querySelector<HTMLElement>('[data-tv-detail-primary]');if(favorite&&visible(favorite)){focusDetails(favorite);return true;}}
    if(group){
      const rows=[...group.querySelectorAll<HTMLButtonElement>('[data-tv-item]')].filter(row=>!row.disabled);
      if(['Enter',' '].includes(key)){if(target===group)enterTVGroup(group);else if(target.matches('[data-tv-item]'))target.click();else return false;return true;}
      if(target!==group&&['ArrowLeft','ArrowRight'].includes(key)){focus(group);return true;}
      if(target!==group&&['ArrowUp','ArrowDown'].includes(key)){const at=rows.indexOf(target as HTMLButtonElement);if(key==='ArrowUp'&&at===0){const shortcut=scope().querySelector<HTMLElement>('[data-tv-exit-right]');focus(shortcut&&visible(shortcut)?shortcut:group);return true;}const next=Math.max(0,Math.min(rows.length-1,at+(key==='ArrowDown'?1:-1)));if(rows[next])focus(rows[next]);return true;}
      if(target===group&&key==='ArrowDown'){const sources=scope().querySelector<HTMLElement>('[data-tv-sources]');if(sources){focusTVSources(sources);return true;}}
      if(target===group&&key==='ArrowUp'){const shortcut=scope().querySelector<HTMLElement>('[data-tv-exit-right]');if(shortcut&&visible(shortcut)){focus(shortcut);return true;}}
    }
    const sources=target.closest<HTMLElement>('[data-tv-sources]');
    if(sources){
      if(target===sources&&['Enter',' ','ArrowDown'].includes(key)){focusTVSources(sources);return true;}
      if(key==='ArrowUp'&&(target===sources||target===sourceControls(sources)[0]||target.matches('[data-tv-source-primary]'))){const episodes=scope().querySelector<HTMLElement>('[data-tv-group]'),favorite=scope().querySelector<HTMLElement>('[data-tv-detail-primary]');if(episodes&&visible(episodes)){focus(episodes);return true;}if(favorite&&visible(favorite)){focusDetails(favorite);return true;}}
    }
    if(!key.startsWith('Arrow'))return false;
    const video=document.querySelector<HTMLVideoElement>('.player-overlay video');
    if(video&&(target===video||target===document.body)&&['ArrowLeft','ArrowRight'].includes(key)){
      if(Number.isFinite(video.duration))video.currentTime=Math.max(0,Math.min(video.duration-1,video.currentTime+(key==='ArrowRight'?10:-10)));return true;
    }
    const list=controls();if(!list.length)return false;
    if(!list.includes(target)){focus(list[0]);return true;}
    const box=target.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2,horizontal=['ArrowLeft','ArrowRight'].includes(key),positive=['ArrowRight','ArrowDown'].includes(key);
    const candidates=list.filter(el=>el!==target).map(el=>{const r=el.getBoundingClientRect(),dx=r.x+r.width/2-x,dy=r.y+r.height/2-y,along=horizontal?dx:dy,crossOffset=horizontal?dy:dx,overlap=horizontal?Math.min(box.bottom,r.bottom)-Math.max(box.top,r.top):Math.min(box.right,r.right)-Math.max(box.left,r.left);return {el,along,score:Math.abs(along)+Math.abs(crossOffset)*(overlap>0?.5:2.5)};}).filter(c=>positive?c.along>8:c.along< -8).sort((a,b)=>a.score-b.score);
    if(candidates.length)focus(candidates[0].el);return true;
  };
  window.CinemaHubTV={back,key:handle};
  document.addEventListener('keydown',event=>{if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey)return;const target=event.target as HTMLElement;if(event.repeat&&['Enter',' '].includes(event.key)&&target.closest('[data-tv-group],[data-tv-range]')){event.preventDefault();return;}if(handle(event.key,target))event.preventDefault();});
}
