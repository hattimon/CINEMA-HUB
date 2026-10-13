import { chromium } from 'playwright';
import { mkdir,readlink,unlink,lstat,rm } from 'node:fs/promises';
import { hostname } from 'node:os';
import { resolve,dirname } from 'node:path';
import { dataDir,playerRoute } from './store.mjs';
import { sameSourceURL, isAdvertisement, networkURL, verifyMedia } from './net.mjs';
import { assertSourceAvailable,blockSource,parseRetryAfter } from './limits.mjs';
import { isViderVideo,viderURL } from './vider-parser.mjs';
import { viderPageReady } from './vider-page.mjs';

async function clearClickAdvertisements(page,selector,origin) {
  await page.evaluate(({selector,origin})=>{
    const target=document.querySelector(selector);if(!target)return;
    for(const anchor of document.querySelectorAll('a[target="_blank"][href]')){
      let url;try{url=new URL(anchor.href);}catch{continue;}
      if(url.origin===origin||anchor===target||/captcha|recaptcha|challenge|turnstile/i.test(url.href))continue;
      let layer=anchor,advertisement;
      while(layer&&layer!==document.body){
        const style=getComputedStyle(layer),rect=layer.getBoundingClientRect();
        // Remove only a blank external click advertisement covering the page.
        // Login forms, CAPTCHA iframes and access notices do not meet these conditions.
        if(['fixed','absolute'].includes(style.position)&&rect.width>=innerWidth*.8&&rect.height>=innerHeight*.6&&!layer.contains(target)&&!layer.querySelector('input,button,form,iframe,video')&&(layer.textContent||'').trim().length<30)advertisement=layer;
        layer=layer.parentElement;
      }
      advertisement?.remove();
    }
  },{selector,origin});
}

async function hostingDiagnostic(page,selector,pages) {
  const target=await page.evaluate(selector=>{
    const element=document.querySelector(selector);if(!element)return {unavailable:true};
    const rect=element.getBoundingClientRect(),point=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
    const layers=[];for(let node=point;node&&node!==document.body;node=node.parentElement){const style=getComputedStyle(node),box=node.getBoundingClientRect();layers.push({tag:node.tagName,id:node.id,class:node.className,position:style.position,zIndex:style.zIndex,width:Math.round(box.width),height:Math.round(box.height),external:node instanceof HTMLAnchorElement?new URL(node.href,location.href).hostname:undefined});}
    return {target:{width:Math.round(rect.width),height:Math.round(rect.height)},layers};
  },selector).catch(()=>({unavailable:true}));
  const frames=[];for(const target of pages)for(const frame of target.frames()){
    frames.push(await frame.evaluate(()=>({host:location.hostname,title:document.title,notice:location.hostname!=='filman.cc'&&!/google|captcha|tenor/.test(location.hostname)?(document.body?.innerText||'').slice(0,500):undefined,videos:[...document.querySelectorAll('video')].map(v=>({ready:v.readyState,width:v.videoWidth,height:v.videoHeight,duration:v.duration,error:v.error?.code,host:(()=>{try{return new URL(v.currentSrc||v.src).hostname;}catch{return '';}})()})),controls:[...document.querySelectorAll('button,[role="button"],.vjs-big-play-button,.jw-icon-playback')].filter(e=>e.getBoundingClientRect().width>0).slice(0,12).map(e=>({tag:e.tagName,class:e.className,label:e.getAttribute('aria-label')||(e.textContent||'').trim().slice(0,50)}))})).catch(()=>({unavailable:true})));
  }
  const portal=await page.evaluate(()=>({path:location.pathname,loggedIn:/Zalogowany jako:/i.test(document.querySelector('#belt,#dropdown')?.textContent||''),linkCount:document.querySelectorAll('#links a[data-link-id]').length,hosts:[...document.querySelectorAll('#links a[data-link-id]')].slice(0,50).map(a=>({id:a.getAttribute('data-link-id'),host:a.querySelector('img')?.alt,version:a.closest('tr')?.querySelectorAll('td')[1]?.textContent.trim(),quality:a.closest('tr')?.querySelectorAll('td')[2]?.textContent.trim(),visible:a.getBoundingClientRect().width>0})),notice:document.querySelector('#links')?.textContent.trim().slice(0,300)})).catch(()=>({unavailable:true}));
  console.warn('hosting_diagnostic',JSON.stringify({target,portal,frames}));
}

async function clickInterceptingAdvertisement(page,selector) {
  const point=await page.evaluate(selector=>{
    const target=document.querySelector(selector);if(!target)return null;
    const box=target.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;
    const anchor=document.elementFromPoint(x,y)?.closest('a[target="_blank"][href]');if(!anchor||anchor===target)return null;
    let url;try{url=new URL(anchor.href);}catch{return null;}
    if(url.origin===location.origin||/captcha|challenge|turnstile/i.test(url.href)||(anchor.textContent||'').trim().length>30)return null;
    const layer=anchor.parentElement;if(!layer||layer.contains(target)||layer.querySelector('iframe,input,form,button,video'))return null;
    return {x,y};
  },selector);
  if(!point)return false;
  await page.mouse.click(point.x,point.y);return true;
}

export class SourceBrowser {
  contexts=new Map(); locks=new Map(); lease=null; cache=new Map(); retired=new Set();
  async exclusive(id,work) { if(process.env.BROWSER_SERIAL==='true')id='shared';const previous=this.locks.get(id)||Promise.resolve();let release;const lock=new Promise(r=>release=r);const tail=previous.catch(()=>{}).then(()=>lock);this.locks.set(id,tail);await previous.catch(()=>{});try{return await work();}finally{release();if(this.locks.get(id)===tail)this.locks.delete(id);} }
  async context(source,headed=false) {
    if(this.retired.has(source.id))throw Object.assign(new Error('Konfiguracja źródła została usunięta.'),{status:404});
    if(process.env.BROWSER_SERIAL==='true'&&this.lease&&this.lease.sourceId!==source.id)throw Object.assign(new Error('Trwa ręczne logowanie do źródła. Zakończ je przed sprawdzaniem innego konta.'),{status:409});
    if(this.lease && (this.lease.sourceId!==source.id || !headed) && this.lease.sourceId===source.id) throw Object.assign(new Error('Zakończ ręczne logowanie do tego źródła.'),{status:409});
    const existing=this.contexts.get(source.id);if(existing)return existing;
    const directory=resolve(dataDir,'browser',source.id);await mkdir(directory,{recursive:true,mode:0o700});
    // Chromium leaves host/PID symlinks after a container replacement. Remove only stale locks from this source's own profile.
    if(process.platform!=='win32'){try{const lock=await readlink(resolve(directory,'SingletonLock'));const match=/^(.*)-(\d+)$/.exec(lock);let running=false;if(match?.[1]===hostname())try{process.kill(Number(match[2]),0);running=true;}catch{}if(match&&!running)for(const name of ['SingletonLock','SingletonCookie','SingletonSocket'])await unlink(resolve(directory,name)).catch(()=>{});}catch{}}
    const executablePath=process.env.CHROMIUM_PATH;
    // Keep the same normal Chromium mode for login and later portal reads.
    // Xvfb is already available in containers; CAPTCHA remains user-operated.
    const visible=headed||!!process.env.DISPLAY&&['filman','vider'].includes(source.type);
    const context=await chromium.launchPersistentContext(directory,{timeout:30000,headless:!visible,executablePath:executablePath||undefined,viewport:headed?null:{width:1280,height:800},acceptDownloads:false,serviceWorkers:'block',args:['--disable-dev-shm-usage','--disk-cache-size=1','--media-cache-size=1','--autoplay-policy=no-user-gesture-required',...(visible?['--window-size=1600,1160','--window-position=0,0']:[])],userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'});
    await context.route('**/*',async route=>{const address=route.request().url();if(isAdvertisement(address))return route.abort();return route.continue();});
    context.on('page',page=>{if(!headed)page.on('popup',popup=>{if(isAdvertisement(popup.url()))popup.close().catch(()=>{});});});
    this.contexts.set(source.id,context);return context;
  }
  async page(source,url,work) {return this.exclusive(source.id,async()=>{
    assertSourceAvailable(source.id);
    if(source.type==='vider') {if(!viderURL(url,source.url))throw new Error('Adres wykracza poza wybrane źródło Vider.');}
    else sameSourceURL(url,source.url);
    const context=await this.context(source),page=await context.newPage();
    try {
      const response=await page.goto(url,{referer:source.url,waitUntil:'domcontentloaded',timeout:30000});
      if(source.type==='vider'&&!viderURL(page.url(),source.url))throw new Error('Vider przekierował poza skonfigurowany portal.');
      if(response?.status()>=400||new URL(page.url()).pathname!==new URL(url).pathname){const redirects=[];for(let request=response?.request();request;request=request.redirectedFrom())redirects.push({host:new URL(request.url()).hostname,path:new URL(request.url()).pathname});console.warn('portal_navigation',JSON.stringify({status:response?.status(),expectedPath:new URL(url).pathname,redirects}));}
      if(response?.status()===429){const retryAfter=blockSource(source.id,parseRetryAfter(response.headers()['retry-after']));throw Object.assign(new Error('Portal ograniczył liczbę zapytań.'+(retryAfter?'':' Nie podał terminu odblokowania.')),{status:429,retryAfter});}
      await page.locator('body').waitFor();
      // Wait for actual AJAX content, not the account menu's collection link.
      if(source.type==='vider')try{await page.waitForFunction(viderPageReady,null,{timeout:25000});}catch{throw Object.assign(new Error('Vider nie załadował listy filmów. Otwórz logowanie / CAPTCHA i sprawdź stronę źródła.'),{status:409});}
      if(/(?:zbyt (?:wiele|dużo).{0,35}(?:zapyt|źród)|too many requests|czasow.{0,25}blokad)/i.test((await page.locator('body').innerText()).slice(0,16000))){throw Object.assign(new Error('Portal zgłosił ograniczenie dostępu bez podania terminu odblokowania.'),{status:429});}
      return await work(page,context);
    }finally{await page.close().catch(()=>{});if(process.env.BROWSER_CLOSE_AFTER_WORK==='true'&&this.lease?.sourceId!==source.id){this.contexts.delete(source.id);await context.close().catch(()=>{});}}
  });}
  async html(source,url) {assertSourceAvailable(source.id);if(this.retired.has(source.id))throw Object.assign(new Error('Konfiguracja źródła została usunięta.'),{status:404});const key=source.id+':'+url;const cached=this.cache.get(key);if(cached?.expires>Date.now())return cached.value;return this.page(source,url,async page=>{if(source.type!=='vider')await page.waitForFunction(()=>!!document.querySelector('#item-list,#single-info,.item-list,#links,[id^="filter-"],input[type="password"],video') || /Just a moment|Verify you are human/.test(document.title),null,{timeout:5000}).catch(()=>{});const value=await page.content();const challenge=await page.evaluate(()=>/Just a moment|Verify you are human|captcha/i.test(document.title)||[...document.querySelectorAll('.g-recaptcha,iframe[src*="captcha"],#cf-challenge-running')].some(e=>e.getBoundingClientRect().width>0));if(!challenge&&!this.retired.has(source.id)){if(this.cache.size>150)this.cache.delete(this.cache.keys().next().value);this.cache.set(key,{value,expires:Date.now()+5*60000});}return value;});}
  async openLogin(source,userId) {
    if(this.lease && this.lease.userId!==userId)throw Object.assign(new Error('Inny użytkownik kończy logowanie. Spróbuj później.'),{status:409});
    if(this.lease?.sourceId===source.id)return {url:'/connect',expires:this.lease.expires};
    if(this.lease)await this.finishLogin(userId);
    return this.exclusive(source.id,async()=>{const old=this.contexts.get(source.id);if(old){await old.close();this.contexts.delete(source.id);} const context=await this.context(source,true);const pages=context.pages();const page=pages[0]||await context.newPage();
      this.lease={userId,sourceId:source.id,expires:Date.now()+15*60*1000};
      try {await page.goto(source.url,{waitUntil:'domcontentloaded',timeout:35000});const login=page.locator('a[href]').filter({hasText:/Zaloguj|Logowanie|Log in|Sign in/i}).first();if(await login.count()){const href=await login.getAttribute('href');if(href){const url=new URL(href,page.url());if(url.origin===new URL(source.url).origin||source.type==='vider'&&viderURL(url.href,source.url))await page.goto(url.href,{waitUntil:'domcontentloaded'});}}} catch { /* The user can navigate or complete a challenge in the visible browser. */ }
      return {url:'/connect',expires:this.lease.expires};});
  }
  async finishLogin(userId) {if(!this.lease||this.lease.userId!==userId)return false;const id=this.lease.sourceId;const context=this.contexts.get(id);this.lease=null;this.contexts.delete(id);for(const key of this.cache.keys())if(key.startsWith(id+':'))this.cache.delete(key);if(context)await context.close().catch(()=>{});return true;}
  async removeSource(id,removeConfiguration) {
    if(!/^[a-f0-9]{32}$/.test(id))throw new Error('Nieprawidłowy identyfikator źródła.');
    const root=resolve(dataDir,'browser'),directory=resolve(root,id);
    if(dirname(directory)!==root)throw new Error('Nieprawidłowa ścieżka profilu.');
    for(const path of [root,directory]){
      const entry=await lstat(path).catch(error=>{if(error.code!=='ENOENT')throw error;});
      if(entry?.isSymbolicLink()||entry&&!entry.isDirectory())throw new Error('Profil źródła nie jest zwykłym katalogiem.');
    }
    this.retired.add(id);
    try{return await this.exclusive(id,async()=>{
      if(this.lease?.sourceId===id){this.lease=null;}
      const context=this.contexts.get(id);this.contexts.delete(id);
      if(context)await context.close();
      for(const key of this.cache.keys())if(key.startsWith(id+':'))this.cache.delete(key);
      await rm(directory,{recursive:true,force:true});
      return removeConfiguration();
    });}catch(error){this.retired.delete(id);throw error;}
  }
  async resolveVider(source,pageURL,link,onProgress=()=>{}) {
    const video=viderURL(pageURL,source.url);
    if(!video||!isViderVideo(video.href)||link.id!=='vider-video')throw new Error('Nieprawidłowe wideo lub hosting Vider.');
    onProgress('Odczytuję odtwarzacz Vider…');
    return this.page(source,video.href,async(page,context)=>{
      const found=new Map(),popups=new Set();let blocked=false,blockedUntil;
      const add=(address,referer,headers={},format='')=>{
        let url;try{url=networkURL(address);}catch{return;}
        if(isAdvertisement(url.href)||!(/\.(?:mp4|m4v|webm|m3u8)(?:[?#]|$)/i.test(url.href)||/mp4|webm|mpegurl|hls|video-element/i.test(format)))return;
        found.set(url.href,{url:url.href,kind:/\.m3u8(?:[?#]|$)|mpegurl|hls/i.test(url.href+' '+format)?'hls':/\.webm(?:[?#]|$)|webm/i.test(url.href+' '+format)?'webm':'mp4',referer,origin:headers.origin});
      };
      const observe=response=>{
        if(response.status()===429&&new URL(response.url()).origin===new URL(source.url).origin){blocked=true;blockedUntil=blockSource(source.id,parseRetryAfter(response.headers()['retry-after']));return;}
        if(response.status()>=400||isAdvertisement(response.url()))return;
        const type=response.headers()['content-type']||'';
        if(!/video\/mp4|video\/webm|mpegurl|\.m3u8(?:[?#]|$)|\.mp4(?:[?#]|$)/i.test(type+' '+response.url()))return;
        const request=response.request(),headers=request.headers();
        add(response.url(),headers.referer||page.url(),headers,type);
      };
      const onPopup=popup=>popups.add(popup);
      context.on('response',observe);page.on('popup',onPopup);
      const collect=async()=>{
        for(const current of [page,...popups]){
          if(current.isClosed())continue;
          for(const frame of current.frames()){
            const urls=await frame.evaluate(()=>{
              const entries=[...document.querySelectorAll('video,video source')].map(node=>node.currentSrc||node.src||node.getAttribute('src')).filter(Boolean);
              try{if(typeof window.jwplayer==='function'){
                const player=window.jwplayer();const playlist=player.getPlaylist?.()||[];
                for(const media of playlist)if(!media.drm)for(const stream of media.allSources||media.sources||(media.file?[{file:media.file}]:[]))if(!stream.drm&&stream.file)entries.push(stream.file);
              }}catch{}
              return entries.map(address=>{try{return new URL(address,location.href).href;}catch{return ''}}).filter(Boolean);
            }).catch(()=>[]);
            for(const url of urls)add(url,frame.url(),{},'video-element');
          }
        }
      };
      try{
        await collect();
        if(!found.size){
          // Only the player's ordinary Play control may be activated.
          // Access gates, subscriptions, CAPTCHA and adverts remain manual.
          const clicked=new Set();
          for(let attempt=0;attempt<40&&!found.size;attempt++){
            // The embedded player can arrive after the detail heading. Activate
            // each ordinary player once when ready, leaving access gates manual.
            for(const frame of page.frames()){
              if(clicked.has(frame))continue;
              const button=frame.getByRole('button',{name:/^(Play|Odtwórz|Start video|Play video|Start Playback)$/i}).or(frame.locator('.jw-icon-display,.vjs-big-play-button,.plyr__control[data-plyr="play"]')).filter({visible:true}).first();
              if(await button.isVisible().catch(()=>false))try{await button.click({timeout:1500});clicked.add(frame);}catch{}
            }
            await new Promise(resolve=>setTimeout(resolve,500));await collect();
          }
        }
        if(blocked)throw Object.assign(new Error('Vider ograniczył liczbę zapytań.'),{status:429,retryAfter:blockedUntil});
        if(!found.size)throw new Error('Vider nie udostępnił strumienia MP4/HLS. Zaloguj się lub otwórz film na stronie źródła.');
        onProgress('Sprawdzam rzeczywistą jakość i dostępność wideo…');
        for(const candidate of [...found.values()].slice(0,5)){
          try{
            const target=new URL(candidate.url),cookies=await context.cookies(target.href);
            // Never copy Vider cookies to a different streaming host.
            const headers={'User-Agent':await page.evaluate(()=>navigator.userAgent),Referer:candidate.referer};
            if(cookies.length)headers.Cookie=cookies.map(cookie=>`${cookie.name}=${cookie.value}`).join('; ');
            if(candidate.origin)headers.Origin=candidate.origin;
            const media={url:candidate.url,kind:candidate.kind,headers,allowedOrigins:[new URL(source.url).origin]};
            await verifyMedia(media);const {probeMedia}=await import('./media.mjs');const meta=await probeMedia(media);
            if(Number(meta.duration)>0&&Number(meta.duration)<60)continue;
            return {...media,host:'Vider',version:'Oryginał',quality:meta.height?meta.height+'p':'Automatyczna',audioCodec:meta.audioCodec,duration:Number(meta.duration)||undefined};
          }catch(error){console.warn('vider_media_probe',String(error.message).replace(/https?:\/\/\S+/g,'[adres]').slice(0,160));}
        }
        throw new Error('Nie udało się potwierdzić strumienia Vider.');
      }finally{context.off('response',observe);page.off('popup',onPopup);for(const popup of popups)await popup.close().catch(()=>{});}
    });
  }
  async resolve(source,pageURL,link,onProgress=()=>{}) {
    onProgress('Odczytuję stronę wybranego filmu…');
    return this.page(source,pageURL,async(page,context)=>{
      const candidates=[];let selected=false,playerClick=false,portalRequest=false,blocked=false,blockedUntil;const pages=new Set([page]),requests=[],responses=[],playerTargets=new Set(),followedTargets=new Set();
      const sourceOrigin=new URL(source.url).origin;
      const controller=new AbortController();const timer=setTimeout(()=>{controller.abort();for(const target of pages)void target.close().catch(()=>{});},75000);
      const observe=target=>{pages.add(target);target.on('response',response=>{if(!selected||response.status()>=400)return;const url=response.url(),type=response.headers()['content-type']||'';if(isAdvertisement(url))return;if(/\.m3u8(?:[?#]|$)/i.test(url)||/mpegurl/i.test(type)||/video\/mp4/i.test(type))candidates.push({url,kind:/m3u8|mpegurl/i.test(url+' '+type)?'hls':'mp4',referer:response.request().headers().referer||target.url(),headers:response.request().headers()});});};
      const responseObserver=response=>{
        if(!selected)return;const url=new URL(response.url());if(url.origin!==sourceOrigin)return;
        if(response.status()===429){blocked=true;blockedUntil=blockSource(source.id,parseRetryAfter(response.headers()['retry-after']));controller.abort();}
        if(!/\/link\//.test(url.pathname))return;
        const record={status:response.status(),type:response.headers()['content-type']||'',path:url.pathname};responses.push(record);
        if(response.headers().location)try{record.redirectHost=new URL(response.headers().location,url).hostname;}catch{}
        void response.text().then(body=>{
          if(body.length>65536)return;let data;try{data=JSON.parse(body);}catch{return;}
          record.keys=Object.keys(data);record.ok=data.ok;
          if(data.ok===false||typeof data.url!=='string')return;
          let address=data.url;
          // Filman's normal player button decodes resp.url with atob().
          if(!/^https?:\/\//i.test(address)&&address.length<=8192&&/^[A-Za-z0-9+/_=-]+$/.test(address))address=Buffer.from(address,'base64').toString('utf8');
          let target;try{target=networkURL(address);}catch{return;}
          record.urlKind='player';
          record.targetHost=target.hostname;
          // Use only a player address returned by this already completed portal request.
          // Never request another /link/go or /link/token to recover a failed player.
          if(!isAdvertisement(target.href)&&((target.origin===sourceOrigin&&!/^\/link\/(?:go|token)(?:\/|$)/.test(target.pathname))||target.hostname==='embed.tmp-url.pro'||target.hostname===link.host)){playerTargets.add(target.href);playerRoute(source.id,pageURL,link,target.href);}
        }).catch(()=>{});
      };
      const requestObserver=request=>{
        if(!selected)return;let url;try{url=new URL(request.url());}catch{return;}
        if(request.resourceType()==='document'&&url.origin!==sourceOrigin)requests.push({host:url.hostname,type:'document'});
        if(url.origin===sourceOrigin&&['xhr','fetch'].includes(request.resourceType())){portalRequest=true;requests.push({method:request.method(),path:url.pathname});}
        if(request.resourceType()==='document'&&!isAdvertisement(url.href)&&!/google|captcha|turnstile/i.test(url.hostname)&&url.origin!==sourceOrigin){
          // A popup navigation can arrive before Chromium has created its frame.
          // It must never escape this event handler and terminate the server.
          let frame;try{frame=request.frame();}catch{}
          if(frame?.parentFrame())portalRequest=true;
        }
      };
      observe(page);const newPage=target=>{observe(target);let trusted=false;const allowed=address=>{try{const u=new URL(address);return u.origin===sourceOrigin||u.hostname===link.host||u.hostname==='embed.tmp-url.pro';}catch{return false;}};target.on('request',request=>{if(request.isNavigationRequest()&&allowed(request.url()))trusted=true;});target.on('framenavigated',frame=>{if(frame!==target.mainFrame())return;const url=frame.url();if(allowed(url))trusted=true;if(isAdvertisement(url)||(!trusted&&/^https?:/.test(url)))void target.close().catch(()=>{});});if(playerClick)void target.close().catch(()=>{});};context.on('page',newPage);context.on('request',requestObserver);context.on('response',responseObserver);
      try {
        let selectedId=link.id;
        // On slower devices DOMContentLoaded can precede the portal's hosting table.
        // Waiting for its links reads the page without consuming another hosting token.
        try{await page.locator('#links tbody a[data-link-id]').first().waitFor({state:'attached',timeout:15000});}catch{await hostingDiagnostic(page,'#links',pages);throw new Error('Portal nie załadował listy hostingów. Sprawdź sesję i otwórz ponownie szczegóły.');}
        const matches=await page.locator('#links tbody a[data-link-id]').evaluateAll((anchors,link)=>{
          const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
          return anchors.filter(a=>{const row=a.closest('tr'),cells=row?.querySelectorAll('td');return clean(a.querySelector('img')?.alt||a.textContent.split(' dodane ')[0])===link.host&&clean(cells?.[1]?.textContent)===link.version&&clean(cells?.[2]?.textContent)===link.quality&&!row?.classList.contains('visible-0')&&!row?.classList.contains('disabled');}).map(a=>a.getAttribute('data-link-id'));
        },link);
        if(matches.length===1)selectedId=matches[0];else if(!matches.includes(selectedId)){await hostingDiagnostic(page,'#links',pages);throw new Error('Lista hostingów uległa zmianie. Odśwież szczegóły tytułu i wybierz jeden link.');}
        const selector=`#links a[data-link-id="${selectedId}"]`,button=page.locator(selector).filter({visible:true}).first();
        await clearClickAdvertisements(page,'#links',new URL(source.url).origin);
        onProgress('Otwieram wybrany hosting…');
        if(!await button.isVisible()){
          const all=page.locator('#links a.select-version').filter({hasText:/^Wszystkie$/}).first();
          if(await all.isVisible())await all.evaluate(element=>element.click());
          try{await button.waitFor({state:'visible',timeout:5000});}catch{await hostingDiagnostic(page,selector,pages);throw new Error('Portal ukrywa ten link. Sprawdź zalogowanie albo otwórz źródło ręcznie.');}
        }
        await button.scrollIntoViewIfNeeded({timeout:3000});
        // The portal's fixed account bar can cover a link scrolled to the top edge.
        // Centre the selected row rather than removing genuine portal navigation.
        await button.evaluate(element=>element.scrollIntoView({behavior:'instant',block:'center',inline:'center'}));
        await clearClickAdvertisements(page,selector,new URL(source.url).origin);selected=true;
        if(await button.getAttribute('data-mp4')!==null)throw new Error('Źródło premium wymaga odtworzenia w odtwarzaczu portalu.');
        const savedPlayer=playerRoute(source.id,pageURL,link);
        if(savedPlayer){playerTargets.add(savedPlayer);portalRequest=true;onProgress('Otwieram zapamiętany odtwarzacz bez ponownego pytania portalu…');}
        for(let attempt=0;attempt<5&&!portalRequest&&!controller.signal.aborted;attempt++){
          await button.evaluate(element=>element.scrollIntoView({behavior:'instant',block:'center',inline:'center'}));
          try{await button.click({timeout:1200});}catch(error){
            if(!/intercepts pointer events/.test(error.message)||!await clickInterceptingAdvertisement(page,selector)){await hostingDiagnostic(page,selector,pages);throw error;}
          }
          await new Promise(r=>setTimeout(r,650));
          if(candidates.length||await page.locator('iframe[src]').evaluateAll(frames=>frames.some(f=>/embed\.tmp-url\.pro/.test(f.src))))break;
        }
        onProgress('Uruchamiam odtwarzacz hostingu…');
        const deadline=Date.now()+32000;let started=false,providerSource=false;const passedGates=new Set(),openedRedirects=new Set();
        while(Date.now()<deadline) {
          for(const url of playerTargets){if(followedTargets.has(url)||followedTargets.size>=1)continue;followedTargets.add(url);if([...pages].some(p=>!p.isClosed()&&p.frames().some(f=>f.url()===url)))continue;const target=await context.newPage();await target.goto(url,{referer:pageURL,waitUntil:'domcontentloaded',timeout:10000}).catch(()=>{});}
          for(const target of pages) for(const frame of target.frames()) {
            if(frame.parentFrame()&&new URL(frame.url()||'about:blank').hostname===link.host&&!openedRedirects.has(frame.url())&&/redirecting/i.test(await frame.title().catch(()=>''))){
              openedRedirects.add(frame.url());const player=await context.newPage();
              await player.goto(frame.url(),{referer:frame.parentFrame().url(),waitUntil:'domcontentloaded',timeout:10000}).catch(()=>{});
            }
            const frameURL=new URL(frame.url()||'about:blank');
            const playlist=await frame.evaluate(()=>{
              try{
                if(typeof window.jwplayer!=='function')return [];
                const item=window.jwplayer().getPlaylist()?.[0];if(!item||item.drm)return [];
                const sources=item.allSources||item.sources||(item.file?[{file:item.file}]:[]);
                return sources.filter(s=>!s.drm&&typeof s.file==='string'&&!/dash|mpd/i.test(s.type||'')).map(s=>({url:new URL(s.file,location.href).href,kind:/hls|mpegurl|m3u8/i.test((s.type||'')+' '+s.file)?'hls':'mp4'})).filter(s=>/^https?:/.test(s.url));
              }catch{return [];}
            }).catch(()=>[]);
            for(const stream of playlist)if(!isAdvertisement(stream.url)){providerSource=true;candidates.push({...stream,provider:true,referer:frame.url(),headers:{}});}
            if((frameURL.hostname==='embed.tmp-url.pro'||process.env.NODE_ENV==='test'&&frameURL.origin===process.env.FIXTURE_ORIGIN&&frameURL.pathname==='/player-fixture')&&!passedGates.has(frame)){
              const gate=frame.getByRole('button',{name:/^Rozumiem, przejdź dalej/i}).first();
              if(await gate.isVisible().catch(()=>false)&&await gate.isEnabled().catch(()=>false)){
                const notice=await frame.locator('body').innerText({timeout:1000}).catch(()=>'');
                if(!/captcha|recaptcha|turnstile|regulamin|terms of service|EULA|license agreement|akceptuj.*warunki/i.test(notice)){
                  await clearClickAdvertisements(frame,'.btn-ok',new URL(frame.url()).origin);
                  try{await gate.click({timeout:1000});passedGates.add(frame);}catch(error){
                    console.warn('player_gate_click',String(error.message).split('\n')[0]);
                    // The portal's blank advertisement layer may cover this informational button.
                    // Activate the same legitimate button, without following the advertisement.
                    if(/intercepts pointer events|Timeout/.test(error.message)){await gate.evaluate(button=>button.click()).catch(()=>{});passedGates.add(frame);}
                  }
                }
              }
            }
            let found=[];try{found=await frame.locator('video').evaluateAll(videos=>videos.map(v=>({url:v.currentSrc||v.src,duration:v.duration,width:v.videoWidth,height:v.videoHeight,ready:v.readyState,advertisement:!!v.closest('.ad,.ads,.video-ad,.jw-flag-ads')})));}catch{}
            for(const video of found)if(!video.advertisement&&video.ready>=1&&video.width>=160&&(video.duration>=120||video.duration===Infinity)) {started=true;if(/^https?:/.test(video.url))candidates.push({url:video.url,kind:/m3u8/i.test(video.url)?'hls':'mp4',referer:frame.url(),headers:{}});}
            if(!started) {const play=frame.getByRole('button',{name:/^(Play|Odtwórz|Play video|Start video)$/i}).filter({visible:true}).or(frame.locator('.jw-icon-display,.jw-icon-playback,.vjs-big-play-button,.plyr__control[data-plyr="play"]').filter({visible:true})).first();try{if(await play.isVisible()){
                playerClick=true;
                await clearClickAdvertisements(frame,'.jw-icon-display,.vjs-big-play-button',new URL(frame.url()||'about:blank').origin);
                try{await play.click({timeout:800});}catch(error){
                  console.warn('player_play_click',new URL(frame.url()||'about:blank').hostname,String(error.message).split('\n')[0]);
                  if(/Timeout|intercepts pointer events/.test(error.message))await play.evaluate(button=>button.click()).catch(()=>{});
                }
              }}catch{}finally{playerClick=false;}
              if(found.length)try{await frame.locator('video').first().evaluate(v=>{if(v.readyState>=1&&v.duration>=120){v.muted=true;v.play().catch(()=>{});}},{},{timeout:1000});}catch{} }
          }
          if(candidates.length)break;await new Promise(r=>setTimeout(r,600));
        }
        if(blocked)throw Object.assign(new Error('Portal ograniczył liczbę zapytań.'+(blockedUntil?'':' Nie podał terminu odblokowania.')),{status:429,retryAfter:blockedUntil});
        if(!candidates.length){console.warn('hosting_requests',JSON.stringify({requests,responses}));await hostingDiagnostic(page,selector,pages);throw new Error('Nie wykryto strumienia wideo w wybranym hostingu.');}
        onProgress('Potwierdzam obraz, dźwięk i rzeczywistą jakość…');
        const unique=[...new Map(candidates.reverse().map(c=>[c.url,c])).values()].sort((a,b)=>Number(!!b.provider)-Number(!!a.provider)||Number(b.kind==='hls')-Number(a.kind==='hls')).slice(0,3);
        for(const found of unique) { if(controller.signal.aborted)break;try {
          networkURL(found.url);const cookies=await context.cookies(found.url);const headers={'User-Agent':await page.evaluate(()=>navigator.userAgent),Referer:found.referer};if(cookies.length)headers.Cookie=cookies.map(c=>`${c.name}=${c.value}`).join('; ');if(found.headers.origin)headers.Origin=found.headers.origin;
          const candidate={url:found.url,kind:found.kind,headers,allowedOrigins:[new URL(source.url).origin]};await verifyMedia(candidate,{signal:controller.signal});const {probeMedia}=await import('./media.mjs');const meta=await probeMedia(candidate,{signal:controller.signal});if(Number(meta.duration)>0&&Number(meta.duration)<60)throw new Error('Materiał krótszy niż minuta — pomijam wstawkę.');return {...candidate,host:link.host,quality:meta.height+'p',version:link.version,audioCodec:meta.audioCodec,duration:Number(meta.duration)||undefined};
        }catch(error){console.warn('media_probe_failure',JSON.stringify({kind:found.kind,host:new URL(found.url).hostname,message:String(error.message).replace(/https?:\/\/\S+/g,'[adres]').slice(0,200)}));}}
        throw new Error('Nie udało się potwierdzić działającego strumienia.');
      }finally{clearTimeout(timer);context.off('page',newPage);context.off('request',requestObserver);context.off('response',responseObserver);for(const target of pages)if(target!==page)await target.close().catch(()=>{});}
    });
  }
  async close() {for(const context of this.contexts.values())await context.close().catch(()=>{});this.contexts.clear();}
}
export const sourceBrowser=new SourceBrowser();
