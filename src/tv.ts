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
  const back=()=>{const target=document.activeElement as HTMLElement,group=target?.closest<HTMLElement>('[data-tv-group]');if(group&&target!==group){focus(group);return true;}const current=scope();if(current.matches('.player-overlay')&&document.fullscreenElement){void document.exitFullscreen();return true;}const close=current.querySelector<HTMLButtonElement>('[aria-label="Zamknij odtwarzacz"],[aria-label="Zamknij"]');if(close){close.click();return true;}return false;};
  const handle=(key:string,target=document.activeElement as HTMLElement)=>{
    if(['Escape','BrowserBack'].includes(key))return back();
    if(!target||target.tagName==='SELECT'||target.tagName==='TEXTAREA'||target.tagName==='IFRAME'||target.tagName==='INPUT'&&target.getAttribute('type')!=='checkbox')return false;
    const group=target.closest<HTMLElement>('[data-tv-group]');
    if(group){
      const rows=[...group.querySelectorAll<HTMLButtonElement>('[data-tv-item]')].filter(row=>!row.disabled);
      if(['Enter',' '].includes(key)){if(target===group)enterTVGroup(group);else if(target.matches('[data-tv-item]'))target.click();else return false;return true;}
      if(target!==group&&['ArrowLeft','ArrowRight'].includes(key)){focus(group);return true;}
      if(target!==group&&['ArrowUp','ArrowDown'].includes(key)){const at=rows.indexOf(target as HTMLButtonElement),next=Math.max(0,Math.min(rows.length-1,at+(key==='ArrowDown'?1:-1)));if(rows[next])focus(rows[next]);return true;}
      if(target===group&&key==='ArrowDown'){const sources=scope().querySelector<HTMLElement>('[data-tv-sources]');if(sources){focusTVSources(sources);return true;}}
    }
    const sources=target.closest<HTMLElement>('[data-tv-sources]');
    if(sources){
      if(target===sources&&['Enter',' ','ArrowDown'].includes(key)){focusTVSources(sources);return true;}
      if(key==='ArrowUp'&&(target===sources||target===sourceControls(sources)[0])){const episodes=scope().querySelector<HTMLElement>('[data-tv-group]');if(episodes&&visible(episodes)){focus(episodes);return true;}}
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
  document.addEventListener('keydown',event=>{if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey)return;const target=event.target as HTMLElement;if(event.repeat&&['Enter',' '].includes(event.key)&&target.closest('[data-tv-group]')){event.preventDefault();return;}if(handle(event.key,target))event.preventDefault();});
}
