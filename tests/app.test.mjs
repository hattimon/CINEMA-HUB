import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync,spawn } from 'node:child_process';
import { mkdtempSync,readdirSync,readFileSync,rmSync,mkdirSync,writeFileSync,existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve,dirname,basename } from 'node:path';
const directory=mkdtempSync(resolve(tmpdir(),'cinema-hub-test-'));
process.env.DATA_DIR=directory;process.env.NODE_ENV='test';
const store=await import('../server/store.mjs');
const {parseCatalog,parseDetail,parseFilters,buildFilterURL}=await import('../server/filman-parser.mjs');
const {safePath}=await import('../server/rclone.mjs');
const {publicAddress,isAdvertisement,safeRequest,readBounded}=await import('../server/net.mjs');
const {assertSourceAvailable,parseRetryAfter,blockSource,limits}=await import('../server/limits.mjs');
const media=await import('../server/media.mjs');
const {app,server}=await import('../server/index.mjs');
const {sourceBrowser}=await import('../server/browser.mjs');
const {totp}=await import('../server/totp.mjs');
const filters='<ul id="filter-sort" class="single-select"><li data-sort="sort:rate"><a>Ocena</a></li></ul><ul id="filter-category" class="multiple-select"><li data-id="1"><a>Akcja</a></li><li data-id="12"><a>Dramat</a></li></ul><ul id="filter-year"><li data-id="2025"><a>2025</a></li></ul><ul id="filter-quality"><li data-id="3"><a>720p</a></li></ul><ul id="filter-version"><li data-id="3"><a>Lektor</a></li></ul>';
const tile=(url,title)=>`<li><a class="textOverImage2" href="${url}" title="${title}" data-text="Prawdziwy opis"><img src="/poster.jpg"><span class="rate">4.77 (8)</span><span class="quality-version">Lektor|720p</span></a><h1>${title}</h1><span class="year">2025</span></li>`;
const table='<table id="links"><tbody><tr><td><a href="#" data-link-id="101"><img alt="Działający hosting"></a></td><td>Lektor</td><td>720p</td></tr><tr><td><a href="#" data-link-id="102"><img alt="Uszkodzony hosting"></a></td><td>Napisy</td><td>1080p</td></tr></tbody></table>';
const movie=`<div id="single-info"><h1>Film próbny<span>ONLINE PL</span></h1><a href="/filmy/category:1/">Akcja</a><a href="/filmy/category:12/">Dramat</a><p>2025</p></div><div id="single-poster"><img class="main-poster" src="/poster.jpg">OCENA UŻYTKOWNIKÓW 4.77 /5 IMDB 8.3 /10</div><div id="item-content"><p>Pełny opis filmu</p></div>${table}`;
let fixture,origin,base,admin,other,source,item,playback,filmBuffer,tsBuffer,portalSource,hostingClicks=0,movieVisits=0,viderCatalogVisits=0,viderPlayerClicks=0,playerPauseClicks=0;
const cloudFiles=new Map();
const hasTools=spawnSync('ffmpeg',['-version']).status===0&&spawnSync('ffprobe',['-version']).status===0;
let slowFilmFirstRequest=true;
const sendFilm=(req,res)=>{if(!filmBuffer)return res.writeHead(404).end();const match=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');const start=match?Number(match[1]):0,end=match?.[2]?Math.min(Number(match[2]),filmBuffer.length-1):filmBuffer.length-1;if(start>=filmBuffer.length)return res.writeHead(416).end();res.writeHead(match?206:200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1,...(match?{'Content-Range':`bytes ${start}-${end}/${filmBuffer.length}`}:{})});return res.end(filmBuffer.subarray(start,end+1));};
before(async()=>{
  if(hasTools){const generated=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=10','-f','lavfi','-i','anullsrc=r=44100:cl=mono','-t','130','-c:v','libx264','-threads','2','-preset','ultrafast','-c:a','aac','-movflags','frag_keyframe+empty_moov','-f','mp4','pipe:1'],{maxBuffer:20*1024*1024});assert.equal(generated.status,0);filmBuffer=generated.stdout;const converted=spawnSync('ffmpeg',['-v','error','-i','pipe:0','-c','copy','-f','mpegts','pipe:1'],{input:filmBuffer,maxBuffer:20*1024*1024});assert.equal(converted.status,0);tsBuffer=converted.stdout;}
  fixture=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://fixture');res.setHeader('Content-Type','text/html; charset=utf-8');
    if(url.pathname.startsWith('/cloud/')&&req.method==='PUT'){
      if(req.headers.authorization!=='Basic '+Buffer.from('viewer:Fixture-cloud-9').toString('base64')){req.resume();return res.writeHead(401).end();}
      if(req.headers['if-none-match']==='*'&&cloudFiles.has(url.pathname)){req.resume();return res.writeHead(412).end();}
      const chunks=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{cloudFiles.set(url.pathname,Buffer.concat(chunks));res.writeHead(201).end();});return;
    }
    if(url.pathname==='/stream.m3u8')return res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl'}).end('#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:131\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:130.0,\nsegment.ts\n#EXT-X-ENDLIST\n');
    if(url.pathname==='/segment.ts')return res.writeHead(200,{'Content-Type':'video/mp2t','Content-Length':tsBuffer.length}).end(tsBuffer);
    if(url.pathname==='/film.mp4')return sendFilm(req,res);
    if(url.pathname==='/slow-film.mp4'){const delay=slowFilmFirstRequest?1800:0;slowFilmFirstRequest=false;return setTimeout(()=>{if(!res.destroyed)sendFilm(req,res);},delay);}
    if(url.pathname==='/player-pause-click'){playerPauseClicks++;return res.end('ok');}
    if(url.pathname==='/bad.mp4')return res.writeHead(200,{'Content-Type':'text/html'}).end('<html>Reklama / błąd</html>');
    if(url.pathname==='/dir/+delayed'){
      viderCatalogVisits++;
      return res.end('<a href="/dir/+account">Kolekcja główna</a><form hidden><input type="password"></form><div id="LoadGeneralContent"><span>Ładowanie…</span></div><script>setTimeout(()=>document.querySelector("#LoadGeneralContent").innerHTML='+JSON.stringify('<article class="video-item"><a href="/vid/+delayed"><span class="txt_md">Film Vider po zalogowaniu</span></a></article><a href="/dir/+child">Folder filmów</a>')+',900);</script>');
    }
    if(url.pathname==='/vid/+delayed')return res.end('<div id="LoadGeneralContent"><div class="video_meta"><h1>Film Vider po zalogowaniu</h1></div></div><script>setTimeout(()=>{const frame=document.createElement("iframe");frame.src="/embed/video/delayed";document.querySelector("#LoadGeneralContent").append(frame);},1600);</script>');
    if(url.pathname==='/embed/video/delayed')return res.end('<button aria-label="Start Playback">Odtwórz</button><script>document.querySelector("button").onclick=()=>{fetch("/vider-player-click");const video=document.createElement("video");video.src="/film.mp4";video.muted=true;video.controls=true;document.body.append(video);document.querySelector("button").remove();video.play().catch(()=>{});};</script>');
    if(url.pathname==='/vider-player-click'){viderPlayerClicks++;return res.end('ok');}
    if(url.pathname==='/folder/'||url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(`<div id="belt">Zalogowany jako: test</div><meta name="csrf-token" content="test-token">${filters}<ul id="item-list">${tile('/m/test','Film próbny')}${tile('/s/1/serial','Serial próbny')}</ul>`);}
    if(url.pathname==='/szukam'){req.resume();return res.end(`<ul>${tile('/m/test','Film próbny')}${tile('/s/1/serial','Serial próbny')}</ul>`);}
    if(url.pathname==='/link/token'){hostingClicks++;return res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({ok:true,url:Buffer.from(origin+'/player-fixture').toString('base64')}));}
    if(url.pathname==='/link/episode-token')return res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({ok:true,url:Buffer.from(origin+'/episode-player').toString('base64')}));
    if(url.pathname==='/episode-player')return res.end('<video src="/film.mp4" autoplay muted controls></video>');
    if(url.pathname==='/empty-frame')return res.end('<html><body></body></html>');
    if(url.pathname==='/player-fixture')return res.end('<button class="btn-ok" disabled>Rozumiem, przejdź dalej</button><div id="player" hidden><button aria-label="Play video">Play video</button></div><script>const gate=document.querySelector(".btn-ok");setTimeout(()=>gate.disabled=false,1500);gate.onclick=()=>{gate.remove();document.querySelector("#player").hidden=false;};let count=0;document.querySelector("[aria-label]").onclick=()=>{if(++count<3){window.open("/popup-ad","_blank");return;}const video=document.createElement("video");video.src="/slow-film.mp4";video.muted=true;video.controls=true;document.body.append(video);document.querySelector("[aria-label]").remove();const toggle=document.createElement("button");toggle.className="jw-icon-playback jw-icon-pause";toggle.onclick=()=>{fetch("/player-pause-click");video.pause();};document.body.append(toggle);video.play().catch(()=>{});};</script>');
    if(url.pathname==='/popup-ad')return res.end('<html>Advertisement popup</html>');
    if(url.pathname==='/s/1/serial')return res.end(movie.replace('Film próbny','Serial próbny')+'<div class="episode-list"><a href="/e/first">[s01e01] Pierwszy</a><a href="/e/second">[s01e02] Drugi</a></div>');
    // Episode navigation uses a minimal real player; the separate resolver test exercises popups and gates.
    if(['/e/first','/e/second'].includes(url.pathname))return res.end(movie+'<script>document.querySelectorAll("[data-link-id]").forEach(link=>link.onclick=async event=>{event.preventDefault();const data=await(await fetch("/link/episode-token")).json();const player=document.createElement("a");player.href=atob(data.url);player.target="_blank";player.textContent="Przejdź do Odtwarzacza";document.body.append(player);});</script>');
    if(url.pathname==='/m/test'){
      // The detail cache has old IDs; the next browser page hydrates a fresh table later.
      const delayed=++movieVisits>1,fresh=table.replace('data-link-id="101"','data-link-id="301"').replace('<td>Lektor</td>','<td>\n Lektor \n</td>');
      const page=delayed?movie.replace(table,'<table id="links"><tbody></tbody></table>'):movie;
      return res.end(page+'<div style="position:fixed;inset:0;z-index:100000"><a target="_blank" href="https://unknown-advert.invalid/pop" style="position:absolute;inset:0;z-index:100001"></a></div><script>const bind=()=>{let gate=0;document.querySelectorAll("[data-link-id]").forEach(a=>a.onclick=async e=>{e.preventDefault();if(++gate<3){window.open("/popup-ad");return;}const data=await (await fetch("/link/token")).json();const link=document.createElement("a");link.href=atob(data.url);link.target="_blank";link.textContent="Przejdź do Odtwarzacza";const empty=document.createElement("iframe");empty.src="/empty-frame";document.body.append(empty,link);});};'+(delayed?'setTimeout(()=>{document.querySelector("#links").outerHTML='+JSON.stringify(fresh)+';bind();},900);':'bind();')+'</script>');
    }
    if(url.pathname.startsWith('/filmy/'))return res.end(`${filters}<ul id="item-list">${tile('/m/test','Film próbny')}</ul>`);
    if(url.pathname.startsWith('/seriale/'))return res.end(`${filters}<ul id="item-list">${tile('/s/1/serial','Serial próbny')}</ul>`);
    if(url.pathname==='/nginx/')return res.end('<a href="clip.mp4">Film lokalny.mp4</a><a href="sub/">Folder</a><a href="../">Parent</a>');
    if(url.pathname==='/nginx/clip.mp4'){res.writeHead(302,{Location:'/film.mp4'});return res.end();}
    if(url.pathname==='/api/list'){
      const listing={
        '':[{name:'FILMY',path:'FILMY',kind:'folder'},{name:'Zwiastun.mp4',path:'Zwiastun.mp4',kind:'video',size:100}],
        FILMY:[{name:'Film lokalny.mp4',path:'FILMY/Film lokalny.mp4',kind:'video',size:filmBuffer?.length||100},{name:'Archiwum',path:'FILMY/Archiwum',kind:'folder'}],
        'FILMY/Archiwum':[{name:'Archiwalny.webm',path:'FILMY/Archiwum/Archiwalny.webm',kind:'video',size:200}],
        BADPATH:[{name:'Sekret.mp4',path:'../private/Sekret.mp4',kind:'video'}],
        FLAT:[{name:'Za głęboko.mp4',path:'FLAT/podfolder/Za głęboko.mp4',kind:'video'}],
      };
      if(url.searchParams.get('path')==='INVALID')return res.end(JSON.stringify({entries:{unexpected:true}}));
      const entries=listing[url.searchParams.get('path')||''];
      return entries?res.end(JSON.stringify({entries})):res.writeHead(404).end();
    }
    if(url.pathname==='/media'){
      if(!['FILMY/Film lokalny.mp4','FILMY/Archiwum/Archiwalny.webm','Zwiastun.mp4'].includes(url.searchParams.get('path')))return res.writeHead(404).end();
      res.writeHead(302,{Location:'/film.mp4'});return res.end();
    }
    res.writeHead(404).end();
  });await new Promise(r=>fixture.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${fixture.address().port}`;process.env.FIXTURE_ORIGIN=origin;
  await new Promise(r=>server.listen(0,'127.0.0.1',r));process.env.PORT=String(server.address().port);base=`http://127.0.0.1:${process.env.PORT}`;
});
// Avoid stale undici sockets after CPU-heavy ARM video probes; never retry a POST.
async function request(path,body,cookie=admin,method) {const response=await fetch(base+'/api'+path,{method:method|| (body?'POST':'GET'),headers:{'Content-Type':'application/json',Connection:'close',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});let value;try{value=await response.json();}catch{}return {status:response.status,value,response};}
after(async()=>{clearInterval(media.mediaTimer);await sourceBrowser.close();await new Promise(r=>server.close(r));await new Promise(r=>fixture.close(r));store.db.close();assert.equal(dirname(directory),resolve(tmpdir()));assert.match(basename(directory),/^cinema-hub-test-/);rmSync(directory,{recursive:true,force:true});});

test('Parsers preserve real filter IDs, multiple selections, ratings and episode order',()=>{
  const schema=parseFilters(filters);assert.equal(schema.length,5);assert.equal(buildFilterURL('https://filman.cc/','movies',{category:['1','12'],version:['3'],quality:['3'],sort:['rate']},2,schema),'https://filman.cc/filmy/sort:rate/category:1,12/quality:3/version:3/?page=2');
  assert.throws(()=>buildFilterURL('https://filman.cc/','movies',{category:['999']},1,schema));
  const c=parseCatalog(`<ul>${tile('/m/test','Test film')}</ul>`,'https://filman.cc/');assert.equal(c.items[0].year,2025);assert.equal(c.items[0].rating,4.77);assert.equal(c.items[0].description,'Prawdziwy opis');
  const d=parseDetail(movie+'<div class="episode-list"><a href="/e/second">[s02e01] Trzeci</a><a href="/e/first">[s01e01] Pierwszy</a></div>','https://filman.cc/m/test');assert.equal(d.rating,4.77);assert.equal(d.imdb,8.3);assert.deepEqual(d.filterIds.category,['1','12']);assert.equal(d.sources[0].quality,'720p');assert.equal(d.sources[0].version,'Lektor');assert.equal(parseDetail(movie.replace('<tr>','<tr class="visible-0">'),'https://filman.cc/m/test').sources.length,1);assert.equal(d.episodes[0].season,1);
  assert.match(store.filenameFor({title:'Film / tytuł'}, {season:2,number:3,title:'Odcinek'},'720p'),/S02E03 - Odcinek - 720p\.mp4$/);assert.throws(()=>safePath('../private'));assert.throws(()=>safePath('C:/../private'));assert.equal(isAdvertisement('https://ads.doubleclick.net/test'),true);assert.equal(publicAddress('127.0.0.1'),false);assert.equal(publicAddress('192.168.0.170'),false);
});
test('App login, remember cookie, authentication and independent accounts',async()=>{
  assert.equal((await request('/sources',null,null)).status,401);assert.equal((await request('/auth/login',{username:'admin',password:'bad'},null)).status,401);
  const login=await request('/auth/login',{username:'admin',password:'admin',remember:true},null);assert.equal(login.status,200);admin=login.response.headers.get('set-cookie').split(';')[0];assert.match(login.response.headers.get('set-cookie'),/HttpOnly/i);assert.match(login.response.headers.get('set-cookie'),/SameSite=Strict/i);assert.match(login.response.headers.get('set-cookie'),/Max-Age=2592000/);
  const newUser=await request('/users',{username:'viewer',password:'Viewer-test-9'});assert.equal(newUser.status,201);const otherLogin=await request('/auth/login',{username:'viewer',password:'Viewer-test-9'},null);other=otherLogin.response.headers.get('set-cookie').split(';')[0];assert.equal((await request('/users',null,other)).status,403);
  const own=(await request('/sources')).value, theirs=(await request('/sources',null,other)).value;assert.equal(own.length,1);assert.equal(theirs.length,1);assert.notEqual(own[0].id,theirs[0].id);
  const settings=(await request('/settings')).value;assert.equal(settings.autoplay,false);await request('/settings',{...settings,theme:'cyan'},admin,'PUT');assert.equal((await request('/settings',null,other)).value.theme,'violet');assert.equal((await request('/settings',{...settings,defaultSources:[own[0].id]},other,'PUT')).status,404);
  const attacker=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:'https://external.invalid','Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'admin'})});assert.equal(attacker.status,403);
});
test('Vider is optional, validates its paths and uses the owner-only manual login session',async()=>{
  const invalid={name:'Vider',type:'vider',credentials:{},enabled:true};
  assert.equal((await request('/sources',{...invalid,url:'https://external.invalid/vid/+sample'})).status,400);
  assert.equal((await request('/sources',{...invalid,url:'https://vider.info/account'})).status,400);
  assert.equal((await request('/sources',{...invalid,url:'http://vider.info/'})).status,400);
  const created=await request('/sources',{...invalid,url:'https://vider.info/dir/+sample',enabled:false});
  assert.equal(created.status,201);
  const sourceId=created.value.id;
  assert.equal((await request('/sources',null,other)).value.some(source=>source.id===sourceId),false);
  assert.equal((await request('/sources/'+sourceId+'/login',{},other)).status,404);
  const original=sourceBrowser.openLogin;
  try {
    sourceBrowser.openLogin=async(source,userId)=>{
      assert.equal(source.id,sourceId);
      assert.equal(source.type,'vider');
      assert.equal(userId,(await request('/auth/me')).value.id);
      return {url:'/connect',expires:Date.now()+900000};
    };
    const login=await request('/sources/'+sourceId+'/login',{});
    assert.equal(login.status,200);
    assert.equal(login.value.url,'/connect');
  } finally {sourceBrowser.openLogin=original;}
  assert.equal((await request('/sources/'+sourceId,{name:'Vider',type:'vider',url:'https://vider.info/vid/+sample',credentials:{},enabled:true},admin,'PUT')).status,200);
  const saved=(await request('/sources')).value.find(source=>source.id===sourceId);
  assert.equal(saved.url,'https://vider.info/vid/+sample');
  assert.equal(saved.enabled,true);
});
test('Vider folder, detail and automatic playback check are routed through its own adapter',async()=>{
  const vider=(await request('/sources')).value.find(source=>source.type==='vider');
  assert.ok(vider);
  const originalHTML=sourceBrowser.html,originalResolve=sourceBrowser.resolveVider;
  let challenge=false;
  try {
    sourceBrowser.html=async(source,url)=>{
      if(source.id!==vider.id)return originalHTML.call(sourceBrowser,source,url);
      if(url.endsWith('/dir/+sample'))return '<article class="video-item"><a href="/vid/+sample" title="Test Vider"><img src="/poster.jpg"></a><p class="description">Przykładowy film</p></article>';
      if(challenge&&url.endsWith('/vid/+sample'))return '<title>Verify you are human</title><div class="g-recaptcha"></div>';
      if(url.endsWith('/vid/+sample'))return '<h1>Test Vider</h1><meta property="og:description" content="Przykładowy film"><video poster="/poster.jpg"></video>';
      throw new Error('Nieoczekiwana strona Vider: '+url);
    };
    sourceBrowser.resolveVider=async(source,url,link)=>{
      assert.equal(source.id,vider.id);
      assert.equal(url,'https://vider.info/vid/+sample');
      assert.equal(link.id,'vider-video');
      return {url:origin+'/film.mp4',kind:'mp4',headers:{},allowedOrigins:[origin],host:'Vider',version:'Oryginał',quality:'720p',duration:130};
    };
    const result=await request('/catalog',{sources:[vider.id],kind:'all',filters:{},page:1,query:'',folder:'dir/+sample'});
    assert.equal(result.status,200);
    assert.equal(result.value.errors.length,0);
    assert.equal(result.value.groups[0].items[0].title,'Test Vider');
    const itemId=result.value.groups[0].items[0].id;
    const detail=await request('/items/'+itemId);
    assert.equal(detail.status,200);
    assert.equal(detail.value.description,'Przykładowy film');
    const links=await request('/items/'+itemId+'/links');
    assert.deepEqual(links.value,[{id:'vider-video',host:'Vider',version:'Oryginał',quality:'Automatyczna'}]);
    const started=await request('/items/'+itemId+'/check',{auto:true});
    assert.equal(started.status,200);
    let checked;
    for(let tries=0;tries<20;tries++){
      checked=await request('/checks/'+started.value.id);
      if(checked.value.status!=='checking')break;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.equal(checked.value.status,'done');
    assert.equal(checked.value.ready.length,1);
    assert.equal(checked.value.ready[0].quality,'720p');
    assert.equal((await request('/checks/'+started.value.id,null,other)).status,404);
    challenge=true;
    assert.equal((await request('/items/'+itemId)).status,409);
    challenge=false;
    const owner=(await request('/auth/me')).value.id;
    await assert.rejects(media.freshPlayback({playbackId:'expired',sourceId:vider.id,userId:owner}),{status:410});
  } finally {sourceBrowser.html=originalHTML;sourceBrowser.resolveVider=originalResolve;}
});
test('Vider waits for delayed AJAX films after login without caching the account menu',{skip:!process.env.CHROMIUM_PATH},async()=>{
  const {parseViderCatalog}=await import('../server/vider-parser.mjs');
  const account={id:store.uid(),type:'vider',url:origin+'/'};
  const before=viderCatalogVisits;
  const html=await sourceBrowser.html(account,origin+'/dir/+delayed');
  const result=parseViderCatalog(html,origin+'/dir/+delayed');
  assert.deepEqual(result.items.map(item=>item.title),['Film Vider po zalogowaniu']);
  assert.deepEqual(result.folders,[{title:'Folder filmów',path:'dir/+child'}]);
  assert.equal(await sourceBrowser.html(account,origin+'/dir/+delayed'),html);
  assert.equal(viderCatalogVisits-before,1,'Only the loaded catalog may be cached');
});

test('Vider waits for the delayed iframe and starts its ordinary player once',{skip:!hasTools||!process.env.CHROMIUM_PATH},async()=>{
  const account={id:store.uid(),type:'vider',url:origin+'/'};
  const before=viderPlayerClicks;
  const candidate=await sourceBrowser.resolveVider(account,origin+'/vid/+delayed',{id:'vider-video'});
  assert.equal(candidate.url,origin+'/film.mp4');
  assert.equal(candidate.quality,'180p');
  assert.ok(candidate.duration>=120);
  assert.equal(viderPlayerClicks-before,1);
});

test('Przystań settings, folder inspection and catalog use each account and source independently',async()=>{
  const payload={name:'Przystań LAN',type:'przystan',url:origin+'/',credentials:{username:'viewer',password:'fixture-secret'},options:{startFolder:'FILMY',recursive:false},enabled:true};
  const created=await request('/sources',payload);
  assert.equal(created.status,201);
  const id=created.value.id;
  assert.equal((await request('/sources/'+id+'/inspect?path=',null,other)).status,404);
  assert.equal((await request('/catalog',{sources:[id]},other)).status,404);
  let saved=(await request('/sources')).value.find(s=>s.id===id);
  assert.deepEqual(saved.options,{startFolder:'FILMY',recursive:false});
  assert.equal(saved.hasCredentials,true);
  assert.equal(saved.enabled,true);

  const root=await request('/sources/'+id+'/inspect?path=');
  assert.equal(root.status,200);
  assert.deepEqual(root.value,{path:'',folders:[{title:'FILMY',path:'FILMY'}],videos:1});
  const nested=await request('/sources/'+id+'/inspect?path=FILMY');
  assert.equal(nested.status,200);
  assert.deepEqual(nested.value,{path:'FILMY',folders:[{title:'Archiwum',path:'FILMY/Archiwum'}],videos:1});

  const list=async(folder='')=>{
    const result=await request('/catalog',{sources:[id],kind:'all',filters:{},page:1,query:'',folder});
    assert.equal(result.status,200);
    assert.deepEqual(result.value.errors,[]);
    assert.equal(result.value.groups.length,1);
    return result.value.groups[0];
  };
  let group=await list();
  assert.deepEqual(group.items.map(i=>i.title),['Film lokalny']);
  assert.deepEqual(group.folders,[{title:'Archiwum',path:'FILMY/Archiwum'}]);
  assert.match(group.items[0].url,/\/media\?path=FILMY%2FFilm\+lokalny\.mp4$/);
  assert.equal((await request('/items/'+group.items[0].id+'/links')).value[0].id,'file');
  assert.equal((await request('/items/'+group.items[0].id,null,other)).status,404);
  group=await list('FILMY/Archiwum');
  assert.deepEqual(group.items.map(i=>i.title),['Archiwalny']);

  // Updating only the enabled flag must preserve the source-specific options and encrypted credentials.
  assert.equal((await request('/sources/'+id,{name:payload.name,type:payload.type,url:payload.url,credentials:{},enabled:false},admin,'PUT')).status,200);
  saved=(await request('/sources')).value.find(s=>s.id===id);
  assert.deepEqual(saved.options,{startFolder:'FILMY',recursive:false});
  assert.equal(saved.hasCredentials,true);
  assert.equal(saved.enabled,false);
  assert.equal((await request('/sources/'+id,{...payload,credentials:{},options:{startFolder:'',recursive:true},enabled:true},admin,'PUT')).status,200);
  group=await list();
  assert.deepEqual(group.items.map(i=>i.title).sort(),['Archiwalny','Film lokalny','Zwiastun']);
  assert.deepEqual(group.folders,[{title:'FILMY',path:'FILMY'}]);
  const searched=await request('/catalog',{sources:[id],kind:'all',filters:{},page:1,query:'lokalny',folder:''});
  assert.deepEqual(searched.value.groups[0].items.map(i=>i.title),['Film lokalny']);

  const second=await request('/sources',{...payload,name:'Przystań innego użytkownika',options:{startFolder:'FILMY/Archiwum',recursive:false}},other);
  assert.equal(second.status,201);
  assert.equal((await request('/sources',null,other)).value.some(s=>s.id===id),false);
  assert.equal((await request('/sources')).value.some(s=>s.id===second.value.id),false);
  const otherCatalog=await request('/catalog',{sources:[second.value.id],kind:'all',filters:{},page:1,query:'',folder:''},other);
  assert.deepEqual(otherCatalog.value.groups[0].items.map(i=>i.title),['Archiwalny']);
  assert.equal((await request('/sources/'+id,{...payload},other,'PUT')).status,404);
});

test('Przystań rejects traversal, malformed lists and flattened nested items',async()=>{
  const {przystanEntries}=await import('../server/adapters.mjs');
  const mock={type:'przystan',url:origin+'/',credentials:{}};
  assert.deepEqual((await przystanEntries(mock,'FLAT')).entries,[]);
  await assert.rejects(przystanEntries(mock,'BADPATH'),/Nieprawidłowa ścieżka/);
  await assert.rejects(przystanEntries(mock,'INVALID'),/nieprawidłową listę/);
  await assert.rejects(przystanEntries(mock,'../private'),/Nieprawidłowa ścieżka/);
  await assert.rejects(przystanEntries(mock,'FILMY/../private'),/Nieprawidłowa ścieżka/);
  const source=(await request('/sources')).value.find(s=>s.type==='przystan');
  const bad=await request('/catalog',{sources:[source.id],kind:'all',filters:{},page:1,query:'',folder:'../private'});
  assert.equal(bad.value.groups.length,0);
  assert.equal(bad.value.errors.length,1);
});

test('Przystań media passes through verification and owner-restricted playback',{skip:!hasTools},async()=>{
  const source=(await request('/sources')).value.find(s=>s.type==='przystan');
  const listing=await request('/catalog',{sources:[source.id],kind:'all',filters:{},page:1,query:'lokalny',folder:'FILMY'});
  const file=listing.value.groups[0].items[0];
  const checked=await request('/items/'+file.id+'/check',{auto:true});
  assert.equal(checked.status,200);
  let result;
  for(let attempt=0;attempt<80;attempt++){
    result=(await request('/checks/'+checked.value.id)).value;
    if(result.status!=='checking')break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(result.status,'done',result.lastError);
  assert.equal(result.ready.length,1,result.lastError);
  const playbackId=result.ready[0].playbackId;
  const response=await fetch(base+'/api/playback/'+playbackId+'/media',{headers:{Cookie:admin,Range:'bytes=100-199'}});
  assert.equal(response.status,206);
  assert.equal((await response.arrayBuffer()).byteLength,100);
  assert.equal((await fetch(base+'/api/playback/'+playbackId+'/media',{headers:{Cookie:other}})).status,410);
});
test('Local registration and offline Authenticator recovery are isolated, encrypted and replay protected',async()=>{
  const created=await request('/auth/register',{username:'local-new',password:'Local-account-9',role:'admin',remember:true},null);assert.equal(created.status,201);assert.equal(created.value.role,'user');const cookie=created.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/users',null,cookie)).status,403);assert.equal((await request('/auth/register',{username:'local-new',password:'Local-account-9'},null)).status,400);
  assert.equal((await request('/sources',null,cookie)).value.length,1);assert.deepEqual((await request('/settings',null,cookie)).value.preferredHosts,['voe.sx','','']);
  assert.equal((await request('/auth/authenticator/setup',{password:'wrong'},cookie)).status,403);
  const setup=await request('/auth/authenticator/setup',{password:'Local-account-9'},cookie);assert.equal(setup.status,200);assert.match(setup.value.secret,/^[A-Z2-7]{32}$/);assert.match(setup.value.uri,/^otpauth:\/\/totp\//);
  const row=store.db.prepare('SELECT * FROM authenticator WHERE user_id=?').get(created.value.id);assert.equal(row.secret,'');assert.equal(row.pending.includes(setup.value.secret),false);assert.equal((await request('/auth/authenticator',null,cookie)).value.enabled,false);
  const confirmation=totp(setup.value.secret);assert.equal((await request('/auth/authenticator/confirm',{code:confirmation},cookie)).status,200);
  assert.equal((await request('/auth/recover-authenticator',{username:'local-new',code:confirmation,password:'Local-replaced-9'},null)).status,401,'Enrollment code cannot be replayed for recovery');
  const realNow=Date.now,future=realNow()+60000;try{Date.now=()=>future;const code=totp(setup.value.secret,future);
    assert.equal((await request('/auth/recover-authenticator',{username:'viewer',code,password:'Viewer-unauthorized-9'},null)).status,401);
    assert.equal((await request('/auth/recover-authenticator',{username:'local-new',code,password:'Local-replaced-9'},null)).status,200);
    assert.equal((await request('/auth/recover-authenticator',{username:'local-new',code,password:'Local-replayed-9'},null)).status,401);
  }finally{Date.now=realNow;}
  assert.equal((await request('/auth/me',null,cookie)).status,401);assert.equal((await request('/auth/me',null,admin)).status,200);
  const login=await request('/auth/login',{username:'local-new',password:'Local-replaced-9'},null),newCookie=login.response.headers.get('set-cookie').split(';')[0];assert.equal(login.status,200);
  assert.deepEqual((await request('/auth/authenticator',null,newCookie)).value,{enabled:true});assert.equal((await request('/auth/authenticator/disable',{password:'Local-replaced-9'},newCookie)).status,200);
});

test('Per-user host preferences are stored separately and concurrent setting patches preserve fields',async()=>{
  const original=(await request('/settings')).value;
  assert.deepEqual(original.preferredHosts,['voe.sx','','']);
  const hostSelection=['savefiles.com','voe.sx','luluvdo.com'];
  const writes=await Promise.all([
    request('/settings',{preferredHosts:hostSelection},admin,'PATCH'),
    request('/settings',{autoplay:true},admin,'PATCH')
  ]);
  assert.deepEqual(writes.map(r=>r.status),[200,200]);
  const settings=(await request('/settings')).value;
  assert.deepEqual(settings.preferredHosts,hostSelection);
  assert.equal(settings.autoplay,true);
  assert.deepEqual((await request('/settings',null,other)).value.preferredHosts,['voe.sx','','']);
  assert.equal((await request('/settings',{preferredHosts:['voe.sx','VOE.SX','']},admin,'PATCH')).status,400);
  await request('/settings',{autoplay:false},admin,'PATCH');
});

test('Offline recovery codes belong to one account, are one-use and invalidate old sessions',async()=>{
  assert.equal((await request('/auth/recovery-codes',{password:'wrong'})).status,403);
  const generated=await request('/auth/recovery-codes',{password:'admin'});
  assert.equal(generated.status,200);
  assert.equal(generated.value.codes.length,8);
  const code=generated.value.codes[0];
  assert.equal(code.length,24);
  const id=(await request('/auth/me')).value.id;
  const stored=store.db.prepare('SELECT code_hash FROM recovery_codes WHERE user_id=?').all(id);
  assert.equal(stored.length,8);
  assert.equal(stored.some(row=>row.code_hash.includes(code)),false);
  assert.equal((await request('/auth/recover',{username:'viewer',code,password:'Viewer-imposter-9'},null)).status,401);
  assert.equal((await request('/auth/recover',{username:'admin',code:'A'.repeat(24),password:'Admin-replaced-9'},null)).status,401);
  assert.equal((await request('/auth/recover',{username:'admin',code,password:'Admin-replaced-9'},null)).status,200);
  assert.equal((await request('/auth/me')).status,401);
  assert.equal((await request('/auth/recover',{username:'admin',code,password:'Admin-replaced-10'},null)).status,401);
  const login=await request('/auth/login',{username:'admin',password:'Admin-replaced-9'},null);
  assert.equal(login.status,200);
  admin=login.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/auth/recovery-codes',{password:'Admin-replaced-9'})).status,200);
  assert.equal((await request('/auth/recover',{username:'admin',code:generated.value.codes[1],password:'Admin-replaced-10'},null)).status,401);
  const refreshed=await request('/auth/recovery-codes',{password:'Admin-replaced-9'});
  assert.equal(refreshed.status,200);
  assert.equal((await request('/auth/password',{current:'Admin-replaced-9',password:'Admin-replaced-11'})).status,200);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM recovery_codes WHERE user_id=?').get(id).count,0);
  assert.equal((await request('/auth/recover',{username:'admin',code:refreshed.value.codes[0],password:'Admin-replaced-12'},null)).status,401);
  assert.equal((await request('/auth/me')).status,200);
});
test('Source secrets are encrypted, redacted and preserved during partial edits',async()=>{
  const created=await request('/sources',{name:'Test HTTP',type:'http',url:origin+'/nginx/',credentials:{username:'fixture',password:'Fixture-secret-9'}});assert.equal(created.status,201);source=created.value;assert.equal(source.credentials,undefined);const ownUser=(await request('/auth/me')).value;const raw=store.db.prepare('SELECT secret FROM sources WHERE id=?').get(source.id);assert.equal(raw.secret.includes('Fixture-secret-9'),false);
  await request('/sources/'+source.id,{name:'Test HTTP edited',type:'http',url:origin+'/nginx/',credentials:{username:'fixture-new'}},admin,'PUT');assert.equal(store.getSource(source.id,ownUser.id).credentials.password,'Fixture-secret-9');assert.equal((await request('/sources/'+source.id,{name:'Hijack',type:'http',url:origin+'/',credentials:{}},other,'PUT')).status,404);
  const group=(await request('/catalog',{sources:[source.id]})).value.groups[0];assert.equal(group.items.length,1);assert.equal(group.folders.length,1);item=(await request('/items/'+group.items[0].id)).value;assert.equal((await request('/items/'+item.id,null,other)).status,404);
  assert.equal((await request('/catalog',{sources:[source.id]},other)).status,404);
});
test('Favorites, watch history, local metadata and downloads remain isolated',async()=>{
  await request('/items/'+item.id+'/favorite',{kind:'favorite',active:true},admin,'PUT');assert.equal((await request('/library/favorite')).value.length,1);assert.equal((await request('/library/favorite',null,other)).value.length,0);
  await request('/items/'+item.id+'/progress',{position:42,duration:130},admin,'PUT');assert.equal((await request('/items/'+item.id+'/progress')).value[0].position,42);assert.equal((await request('/items/'+item.id+'/progress',null,other)).status,404);assert.equal((await request('/items/'+item.id+'/progress',{episode:'unowned',position:1,duration:130},admin,'PUT')).status,400);
  const local=(await request('/sources',{name:'Urządzenie',type:'device',url:'device:',credentials:{}})).value;const indexed=await request('/sources/'+local.id+'/device-index',{files:[{name:'Prawdziwy film.mp4',path:'Filmy/Prawdziwy film.mp4'}]});assert.equal(indexed.status,200);assert.equal(indexed.value[0].title,'Prawdziwy film');assert.equal((await request('/sources/'+local.id+'/device-index',{files:[]},other)).status,404);
  assert.equal((await request('/downloads')).value.length,0);assert.equal((await request('/downloads',null,other)).value.length,0);
});
test('Confirmed MP4 playback, seeking, correct quality and manual device download without disk file',{skip:!hasTools},async()=>{
  const started=await request('/items/'+item.id+'/check',{});assert.equal(started.status,200);let check;
  for(let i=0;i<80;i++){check=(await request('/checks/'+started.value.id)).value;if(check.status!=='checking')break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(check.status,'done');assert.equal(check.ready.length,1,check.lastError);assert.equal(check.ready[0].quality,'180p');playback=check.ready[0];assert.equal((await request('/checks/'+started.value.id,null,other)).status,404);
  const remembered=await request('/items/'+item.id+'/ready');assert.equal(remembered.status,200);assert.equal(remembered.value[0].playbackId,playback.playbackId);assert.equal((await request('/items/'+item.id+'/ready',null,other)).status,404);
  const response=await fetch(base+'/api/playback/'+playback.playbackId+'/media',{headers:{Cookie:admin,Range:'bytes=500-999'}});assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,500);assert.equal((await fetch(base+'/api/playback/'+playback.playbackId+'/media',{headers:{Cookie:other}})).status,410);
  const queued=await request('/downloads',{playbackId:playback.playbackId,destination:'device'});assert.equal(queued.status,201);assert.match(queued.value.filename,/Film lokalny - 180p\.mp4/);assert.equal((await request('/downloads',null,other)).value.length,0);
  const saved=await fetch(base+'/api/downloads/'+queued.value.id+'/file',{headers:{Cookie:admin}});assert.match(saved.headers.get('content-disposition'),/filename\*=UTF-8/);assert.deepEqual(Buffer.from(await saved.arrayBuffer()),filmBuffer);const job=(await request('/downloads')).value.find(j=>j.id===queued.value.id);assert.equal(job.status,'ready');assert.equal(job.bytes,filmBuffer.length);assert.equal((await fetch(base+'/api/downloads/'+job.id+'/file',{headers:{Cookie:other}})).status,404);
  const files=readdirSync(directory,{recursive:true}).map(String);assert.equal(files.some(f=>/\.(mp4|mkv|webm|ts)$/i.test(f)),false);
});
test('DNS checks, safe range validation and playlist rewriting prevent private network leakage',async()=>{
  delete process.env.FIXTURE_ORIGIN;await assert.rejects(safeRequest(origin+'/'),/wewnętrzny/);const r=await safeRequest(origin+'/',{allowedOrigins:[origin]});assert.equal(r.statusCode,200);await readBounded(r);process.env.FIXTURE_ORIGIN=origin;
  const rewritten=media.rewritePlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\npart.ts','https://media.invalid/film/master.m3u8',u=>'asset:'+u);assert.match(rewritten,/URI="asset:https:\/\/media.invalid\/film\/key"/);assert.match(rewritten,/asset:https:\/\/media.invalid\/film\/part.ts/);
  assert.equal(parseRetryAfter('45'),45000);assert.equal(parseRetryAfter('0'),undefined);assert.equal(parseRetryAfter('invalid'),undefined);assert.equal(parseRetryAfter(''),undefined);assert.equal(parseRetryAfter(undefined),undefined);
  assert.ok(Math.abs(parseRetryAfter(new Date(Date.now()+60000).toUTCString())-60000)<2000);
  assert.equal(blockSource('fixture-limit'),undefined);assert.doesNotThrow(()=>assertSourceAvailable('fixture-limit'));
  const until=blockSource('fixture-limit',60000);assert.throws(()=>assertSourceAvailable('fixture-limit'),error=>error.status===429&&error.retryAfter===until);
  limits.clear();
});
test('Automatic mode tries sources sequentially, stops on success, and preserves genuine limits',async()=>{
  const original=sourceBrowser.resolve,attempts=[];
  const owner=(await request('/auth/me')).value;
  const item={id:'sequence-fixture',url:origin+'/m/test'};
  const sources=[{id:'bad',host:'broken',version:'Napisy',quality:'720p'},{id:'good',host:'working',version:'Lektor',quality:'1080p'},{id:'unused',host:'unused',version:'Lektor',quality:'480p'}];
  assert.deepEqual(media.orderHostingLinks([
    {id:'captions',host:'voe.sx',version:'Napisy',quality:'1080p'},
    {id:'secondary',host:'vidmoly.me',version:'Lektor',quality:'1080p'},
    {id:'priority',host:'voe.sx',version:'Lektor',quality:'720p'}
  ],'Lektor').map(l=>l.id),['secondary','priority','captions']);
  assert.deepEqual(media.orderHostingLinks([
    {id:'english',host:'voe.sx',version:'English',quality:'1080p'},
    {id:'subs',host:'voe.sx',version:'Napisy PL',quality:'1080p'},
    {id:'ai',host:'voe.sx',version:'Lektor AI',quality:'720p'},
    {id:'dub',host:'voe.sx',version:'Dubbing PL',quality:'480p'},
    {id:'voice-low',host:'voe.sx',version:'Lektor PL',quality:'480p'},
    {id:'voice-high',host:'vidmoly.me',version:'Lektor PL',quality:'720p'}
  ],'Lektor').map(l=>l.id),['voice-high','voice-low','dub','ai','subs','english']);
  assert.equal(media.orderHostingLinks([
    {id:'voice',host:'other',version:'Lektor PL',quality:'1080p'},
    {id:'manual',host:'chosen',version:'Napisy PL',quality:'720p'}
  ],'Lektor','chosen')[0].id,'voice');
  assert.deepEqual(media.orderHostingLinks([
    {id:'subtitles-on-voe',host:'voe.sx',version:'Napisy PL',quality:'1080p'},
    {id:'dubbing-on-savefiles',host:'savefiles.com',version:'Dubbing PL',quality:'720p'},
    {id:'dubbing-on-luluvdo',host:'luluvdo.com',version:'Dubbing PL',quality:'720p'},
    {id:'lektor-on-other',host:'other',version:'Lektor PL',quality:'480p'}
  ],'Lektor',['voe.sx','luluvdo.com','savefiles.com']).map(l=>l.id),['lektor-on-other','dubbing-on-luluvdo','dubbing-on-savefiles','subtitles-on-voe']);
  const poll=async id=>{for(let i=0;i<20;i++){const check=media.checkFor(id,owner.id);if(check.status!=='checking')return check;await new Promise(r=>setTimeout(r,10));}throw new Error('Automatyczna weryfikacja nie zakończyła się.');};
  try{
    sourceBrowser.resolve=async(_source,_page,link)=>{attempts.push(link.id);if(link.id==='bad')throw new Error('Hosting nie działa.');return {kind:'mp4',url:origin+'/film.mp4',headers:{},host:link.host,quality:'180p'};};
    const id=media.beginCheck(owner.id,{id:'sequence-source',type:'filman'},item,undefined,sources,{stopOnSuccess:true});
    const check=await poll(id);assert.equal(check.status,'done');assert.deepEqual(attempts,['bad','good']);assert.deepEqual(check.attempted,['bad','good']);assert.equal(check.checked,2);assert.equal(check.ready.length,1);assert.equal(check.ready[0].id,'good');
    attempts.length=0;
    const retry=await poll(media.beginCheck(owner.id,{id:'sequence-source',type:'filman'},item,undefined,[sources[2]],{stopOnSuccess:true}));
    assert.deepEqual(attempts,['unused']);assert.equal(retry.ready[0].id,'unused');
    attempts.length=0;const deadline=Date.now()+30000;
    sourceBrowser.resolve=async(_source,_page,link)=>{attempts.push(link.id);throw Object.assign(new Error('Ograniczenie portalu'),{status:429,retryAfter:deadline});};
    const blocked=await poll(media.beginCheck(owner.id,{id:'sequence-source',type:'filman'},{id:'other-sequence-item',url:item.url},undefined,sources,{stopOnSuccess:true}));
    assert.equal(blocked.status,'blocked');assert.equal(blocked.retryAfter,deadline);assert.deepEqual(attempts,['bad']);
    sourceBrowser.resolve=async()=>{throw Object.assign(new Error('Limit bez terminu'),{status:429});};
    const unknown=await poll(media.beginCheck(owner.id,{id:'sequence-source',type:'filman'},{id:'unknown-limit-item',url:item.url},undefined,[sources[0]],{stopOnSuccess:true}));
    assert.equal(unknown.status,'blocked');assert.equal(unknown.retryAfter,undefined);
  }finally{sourceBrowser.resolve=original;}
});
test('Manual portal probing uses one hosting and excludes dead or ad content',{skip:!hasTools||!process.env.CHROMIUM_PATH},async()=>{
  const result=await request('/sources',{name:'Portal fixture',type:'filman',url:origin+'/',credentials:{}});portalSource=result.value;const cat=(await request('/catalog',{sources:[result.value.id],kind:'movies',query:'Film',filters:{category:['1','12'],quality:['3']}})).value;assert.equal(cat.errors.length,0,JSON.stringify(cat.errors));assert.equal(cat.groups[0].items.length,1);
  const detail=(await request('/items/'+cat.groups[0].items[0].id)).value;assert.equal(detail.sources.length,2);assert.equal((await request('/items/'+detail.id+'/check',{})).status,400);
  const startedAt=Date.now(),clicksBefore=hostingClicks,pauseClicksBefore=playerPauseClicks;const started=await request('/items/'+detail.id+'/check',{linkId:'retired-link-id',link:detail.sources[0]});assert.equal(started.status,200,JSON.stringify(started.value));assert.equal(started.value.selectedLinkId,'101');let check;const probeDeadline=Date.now()+(process.arch==='arm64'?90000:24000);while(Date.now()<probeDeadline){check=(await request('/checks/'+started.value.id)).value;if(check.status!=='checking')break;await new Promise(r=>setTimeout(r,150));}assert.equal(check.ready.length,1,check.lastError);assert.equal(check.total,1);assert.equal(hostingClicks-clicksBefore,1);assert.equal(playerPauseClicks-pauseClicksBefore,0,'A buffering video must not be toggled into pause by the resolver');assert.ok(Date.now()-startedAt<(process.arch==='arm64'?90000:20000),'Empty frames must not incur 30-second locator waits');
  const automatic=await request('/items/'+detail.id+'/check',{auto:true,preferredVersion:'Lektor'});assert.equal(automatic.status,200);const autoCheck=(await request('/checks/'+automatic.value.id)).value;assert.equal(autoCheck.status,'done');assert.equal(autoCheck.total,2);assert.equal(autoCheck.checked,1);assert.equal(hostingClicks-clicksBefore,1);
  const owner=(await request('/auth/me')).value;media.playbacks.delete(check.ready[0].playbackId);await assert.rejects(media.freshPlayback({playbackId:check.ready[0].playbackId,userId:owner.id,sourceId:result.value.id,pageURL:detail.url,link:detail.sources[0]}),/ręcznie/);assert.equal(hostingClicks-clicksBefore,1,'An expired download must not click Filman again');
  const cached=store.db.prepare('SELECT secret FROM player_routes WHERE source_id=?').get(result.value.id);assert.ok(cached);assert.equal(cached.secret.includes(origin),false);
  limits.clear();const retry=await request('/items/'+detail.id+'/check',{linkId:'101'});assert.equal(retry.status,200);
  let retried;const retryDeadline=Date.now()+(process.arch==='arm64'?90000:24000);while(Date.now()<retryDeadline){retried=(await request('/checks/'+retry.value.id)).value;if(retried.status!=='checking')break;await new Promise(r=>setTimeout(r,150));}
  assert.equal(retried.ready.length,1,retried.lastError);assert.equal(hostingClicks-clicksBefore,1,'A manual retry reuses its encrypted player route without another portal token request');
});
test('HLS segments are proxied and manual download produces playable MP4',{skip:!hasTools},async()=>{
  const own=(await request('/auth/me')).value;const data=store.saveItem(source.id,{url:origin+'/stream.m3u8',title:'Strumień HLS',kind:'movie',sources:[{id:'hls',url:origin+'/stream.m3u8',host:'Fixture',version:'Lektor',quality:'180p'}]});
  const candidate={kind:'hls',url:origin+'/stream.m3u8',headers:{},allowedOrigins:[origin]};const probed=await media.probeMedia(candidate);assert.equal(probed.height,180);candidate.audioCodec=probed.audioCodec;
  const id=media.rememberPlayback(own.id,candidate,{sourceId:source.id,itemId:data.id,pageURL:data.url,link:data.sources[0]});const playlist=await fetch(base+'/api/playback/'+id+'/media',{headers:{Cookie:admin}});const text=await playlist.text();assert.match(text,/\/api\/playback\/.*\/asset\//);assert.equal(text.includes(origin),false);
  const job=(await request('/downloads',{playbackId:id,destination:'device'})).value;
  const file=await fetch(base+'/api/downloads/'+job.id+'/file',{headers:{Cookie:admin}});
  const buffer=Buffer.from(await file.arrayBuffer());assert.equal(file.status,200);assert.ok(buffer.length>filmBuffer.length*.7);assert.ok(buffer.subarray(0,64).includes(Buffer.from('ftyp')));
  // A pipe cannot seek to the final MP4 index. Decode every frame to verify the complete 130 seconds.
  const probe=spawnSync('ffprobe',['-v','error','-count_frames','-of','json','-show_entries','stream=codec_type,width,height,sample_rate,nb_read_frames','pipe:0'],{input:buffer});
  assert.equal(probe.status,0);const metadata=JSON.parse(probe.stdout);const video=metadata.streams.find(s=>s.codec_type==='video');assert.equal(video.width,320);assert.ok(Number(video.nb_read_frames)>=1299,probe.stdout.toString());assert.equal(metadata.streams.find(s=>s.codec_type==='audio').sample_rate,'44100');
  const decoded=spawnSync('ffmpeg',['-v','error','-i','pipe:0','-ss','125','-frames:v','1','-f','image2pipe','-vcodec','mjpeg','pipe:1'],{input:buffer,maxBuffer:2*1024*1024});assert.equal(decoded.status,0);assert.ok(decoded.stdout.length>1000);
  assert.equal((await request('/downloads')).value.find(j=>j.id===job.id).status,'ready');assert.equal(readdirSync(directory,{recursive:true}).some(f=>/\.(mp4|ts)$/i.test(String(f))),false);
});
test('Manual cloud queue streams the complete film directly to authenticated WebDAV',{skip:!hasTools},async()=>{
  const destination=(await request('/destinations',{name:'Cloud fixture',type:'webdav',config:{url:origin+'/cloud/',prefix:''},credentials:{username:'viewer',password:'Fixture-cloud-9'}}));assert.equal(destination.status,201);assert.equal(destination.value.credentials,undefined);
  const queue=(await request('/downloads',{playbackId:playback.playbackId,destination:destination.value.id}));assert.equal(queue.status,201);assert.equal((await request('/downloads',{playbackId:playback.playbackId,destination:destination.value.id},other)).status,410);
  await media.cloudQueue();const job=(await request('/downloads')).value.find(j=>j.id===queue.value.id);assert.equal(job.status,'ready',JSON.stringify(job));assert.match(job.remotePath,/Film lokalny - 180p - [a-f0-9]{8}\.mp4/);assert.equal(cloudFiles.size,1);const buffer=[...cloudFiles.values()][0];assert.equal(job.bytes,buffer.length);
  const decoded=spawnSync('ffmpeg',['-v','error','-i','pipe:0','-ss','125','-frames:v','1','-f','image2pipe','-vcodec','mjpeg','pipe:1'],{input:buffer,maxBuffer:2*1024*1024});assert.equal(decoded.status,0);assert.ok(decoded.stdout.length>1000);assert.equal(readdirSync(directory,{recursive:true}).some(f=>/\.(mp4|ts)$/i.test(String(f))),false);
});
test('TV client navigation and native player preserve progress without a second web stream',{skip:!process.env.CHROMIUM_PATH},async()=>{
  const settings=(await request('/settings')).value;await request('/settings',{...settings,defaultSources:[source.id]},admin,'PUT');
  const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--disable-dev-shm-usage']});
  try {
    const context=await browser.newContext({viewport:{width:1280,height:720},userAgent:'Mozilla/5.0 Chrome/140.0.0.0 CinemaHubTV/1.0'});
    const equals=admin.indexOf('=');await context.addCookies([{name:admin.slice(0,equals),value:admin.slice(equals+1),url:base,httpOnly:true,sameSite:'Strict'}]);
    // Model only the Android message boundary; the rendered app and API are real.
    await context.addInitScript(()=>{window.nativeCalls=[];const listeners=new Set();window.nativeEmit=value=>{for(const listener of listeners)listener({data:JSON.stringify(value)});};window.nativeSession={};window.CinemaNative={addEventListener:(_type,listener)=>listeners.add(listener),removeEventListener:(_type,listener)=>listeners.delete(listener),postMessage:message=>{const payload=JSON.parse(message);window.nativeCalls.push(payload);if(payload.type==='play'){window.nativeSession={type:'progress',playbackId:payload.playbackId,position:77,duration:130,playing:true};setTimeout(()=>{if(window.nativeSession.playbackId===payload.playbackId)window.nativeEmit(window.nativeSession);},100);}if(payload.type==='fullscreen')window.nativeEmit({...payload,type:'fullscreen'});if(payload.type==='transport'){const current=window.nativeSession;if(payload.action==='toggle')current.playing=!current.playing;if(payload.action==='seek')current.position=Math.max(0,Math.min(129,current.position+payload.delta/1000));if(payload.action==='seekTo')current.position=Math.max(0,Math.min(129,payload.position/1000));window.nativeEmit(current);}}};});
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(base,{waitUntil:'domcontentloaded'});
    const card=page.getByRole('button',{name:'Zobacz Film lokalny',exact:true});await card.waitFor({timeout:30000});assert.equal(await page.locator('html').getAttribute('data-tv'),'true');
    await card.focus();await page.keyboard.press('ArrowLeft');assert.equal(await card.evaluate(el=>el===document.activeElement),false,'D-pad moves focus between real controls');
    await card.click();await page.locator('.playable-row').getByRole('button',{name:'Odtwórz',exact:true}).click({timeout:20000});await page.getByText('1:17',{exact:true}).waitFor({timeout:15000});
    const calls=await page.evaluate(()=>window.nativeCalls);assert.equal(calls.filter(c=>c.type==='play').length,1);assert.equal(calls[0].type,'play','Native settings must follow player creation');assert.ok(calls[0].playbackId);assert.equal(calls[0].position,42);assert.equal(await page.locator('video').evaluate(v=>v.currentSrc),'','Native playback must not also start a WebView stream');
    assert.equal(calls[0].fullscreen,false,'Android starts with the menu visible');
    const overlay=page.locator('.player-overlay');await overlay.getByRole('button',{name:'Pełny ekran',exact:true}).click();await page.locator('.player-footer').waitFor({state:'hidden'});
    await page.evaluate(()=>{window.nativeSession.playing=false;window.nativeEmit(window.nativeSession);});await overlay.getByRole('button',{name:'Wznów',exact:true}).waitFor({state:'visible'});
    await overlay.getByRole('button',{name:'Cofnij 10 sekund',exact:true}).click();await page.getByText('1:07',{exact:true}).waitFor();
    const timeline=overlay.getByRole('slider',{name:'Pozycja odtwarzania',exact:true});assert.equal(await timeline.isVisible(),true,'Pause exposes a seekable timeline');const timelineBox=await timeline.boundingBox();assert.ok(timelineBox.width>900,'The timeline spans the screen');await timeline.click({position:{x:timelineBox.width/2,y:timelineBox.height/2}});assert.ok(Math.abs(await page.evaluate(()=>window.nativeSession.position)-65)<3,'One click seeks to the chosen point');await timeline.fill('100');assert.equal(await page.evaluate(()=>window.nativeSession.position),100);assert.equal(await page.evaluate(()=>window.nativeSession.playing),false,'Seeking must preserve pause');await timeline.press('ArrowLeft');assert.equal(await page.evaluate(()=>window.nativeSession.position),90);await timeline.press('ArrowRight');assert.equal(await page.evaluate(()=>window.nativeSession.position),100);
    if(process.env.QA_SCREENSHOT_DIR)await page.screenshot({path:resolve(process.env.QA_SCREENSHOT_DIR,'cinema-paused-timeline.png'),fullPage:false});
    await overlay.getByRole('button',{name:'Wznów',exact:true}).click();await page.locator('.player-footer').waitFor({state:'hidden'});assert.equal(await overlay.isVisible(),true);
    await page.evaluate(()=>{window.nativeSession.playing=false;window.nativeEmit(window.nativeSession);});await overlay.getByRole('button',{name:'Wróć do menu',exact:true}).click();
    await overlay.getByRole('button',{name:'Zapisz',exact:true}).click();const saveDialog=page.locator('.modal').filter({has:page.getByRole('heading',{name:'Zapisz film',exact:true})});await saveDialog.waitFor();await saveDialog.getByRole('button',{name:'Zamknij',exact:true}).click();assert.equal(await overlay.isVisible(),true);
    await overlay.getByRole('button',{name:'Zmień źródło',exact:true}).click();const sourceDialog=page.locator('.modal').filter({has:page.getByRole('heading',{name:'Zmień źródło odtwarzania',exact:true})});await sourceDialog.waitFor();await page.keyboard.press('Escape');await sourceDialog.waitFor({state:'detached'});assert.equal(await overlay.isVisible(),true);
    assert.equal(await page.evaluate(()=>window.nativeCalls.filter(value=>value.type==='play').length),1);assert.equal(await page.evaluate(()=>window.nativeCalls.some(value=>value.type==='stop')),false,'Menu interactions preserve the active native stream');
    let saved;for(let attempt=0;attempt<25;attempt++){saved=(await request('/items/'+item.id+'/progress')).value.find(p=>p.episode==='');if(saved?.position===100)break;await new Promise(r=>setTimeout(r,100));}assert.equal(saved.position,100);
    await page.getByRole('button',{name:'Zamknij odtwarzacz',exact:true}).click();await page.locator('.player-overlay').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.nativeCalls.some(c=>c.type==='stop')),true);
    await request('/settings',{...settings,defaultSources:[portalSource.id]},admin,'PUT');await page.reload();await page.getByRole('button',{name:'Zobacz Serial próbny',exact:true}).click({timeout:30000});
    const episodes=page.getByRole('group',{name:'Lista odcinków sezonu 1',exact:true});await episodes.waitFor({timeout:20000});const autoSource=page.getByRole('button',{name:'Odtwórz automatycznie',exact:true});await autoSource.waitFor();await page.waitForFunction(()=>!document.querySelector('[data-tv-source-primary]').disabled);await episodes.focus();await page.keyboard.press('ArrowDown');assert.equal(await autoSource.evaluate(element=>element===document.activeElement),true,'Down on the frame selects autoplay without entering episodes');await page.keyboard.press('ArrowUp');assert.equal(await episodes.evaluate(element=>element===document.activeElement),true,'Up from sources selects the episode frame');await page.keyboard.press('ArrowUp');assert.equal(await page.getByRole('button',{name:'Do źródeł',exact:true}).evaluate(element=>element===document.activeElement),true,'Up from the frame selects the buttons above it');await page.keyboard.press('Enter');assert.equal(await autoSource.evaluate(element=>element===document.activeElement),true,'Do sources transfers actual focus without collapsing episodes');assert.equal(await episodes.isVisible(),true);await page.keyboard.press('ArrowDown');assert.equal(await page.locator('.manual-host button').first().evaluate(element=>element===document.activeElement),true,'The user can select a manual source below autoplay');await page.keyboard.press('ArrowUp');assert.equal(await autoSource.evaluate(element=>element===document.activeElement),true);await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');assert.equal(await episodes.locator('[data-tv-item]').first().evaluate(element=>element===document.activeElement),true,'Only OK enters the episode list');assert.equal(await page.locator('.modal').isVisible(),true);
    await page.keyboard.press('ArrowDown');assert.equal(await episodes.locator('[data-tv-item]').nth(1).evaluate(element=>element===document.activeElement),true);await page.keyboard.press('ArrowUp');assert.equal(await episodes.locator('[data-tv-item]').first().evaluate(element=>element===document.activeElement),true);
    await page.keyboard.press('ArrowRight');assert.equal(await episodes.evaluate(element=>element===document.activeElement),true,'Right leaves row selection and highlights the whole frame');assert.equal(await page.locator('.modal').isVisible(),true);
    assert.equal(await page.evaluate(()=>window.CinemaHubTV.key('ArrowDown')),true);assert.equal(await autoSource.evaluate(element=>element===document.activeElement),true,'Android Down selects sources from the frame');await page.evaluate(()=>window.CinemaHubTV.key('ArrowUp'));await page.evaluate(()=>window.CinemaHubTV.key('ArrowUp'));assert.equal(await page.evaluate(()=>window.CinemaHubTV.key('Enter')),false,'Ordinary buttons retain the WebView click fallback');await page.keyboard.press('Enter');assert.equal(await autoSource.evaluate(element=>element===document.activeElement),true,'Android OK on Do sources selects autoplay');await page.evaluate(()=>window.CinemaHubTV.key('ArrowUp'));assert.equal(await page.evaluate(()=>window.CinemaHubTV.key('Enter')),true);assert.equal(await page.evaluate(()=>window.CinemaHubTV.key('ArrowDown')),true);await page.evaluate(()=>window.CinemaHubTV.key('ArrowLeft'));assert.equal(await episodes.evaluate(element=>element===document.activeElement),true,'Native left leaves row selection and highlights the whole frame');
    await episodes.focus();await page.evaluate(()=>window.CinemaHubTV.key('Enter'));await page.evaluate(()=>window.CinemaHubTV.back());assert.equal(await episodes.evaluate(element=>element===document.activeElement),true,'Back exits the row selection without closing series details');
    if(process.env.QA_SCREENSHOT_DIR)await page.screenshot({path:resolve(process.env.QA_SCREENSHOT_DIR,'cinema-episode-navigation.png'),fullPage:false});
    await page.getByRole('button',{name:'02 Drugi Sezon 1 · Odcinek 2',exact:true}).click({timeout:20000});assert.equal(await page.locator('.episode-list').isVisible(),true,'Selecting an episode keeps the TV list open');
    await page.getByRole('button',{name:'Odtwórz automatycznie',exact:true}).waitFor({state:'visible',timeout:20000});await page.locator('.source-section h3').waitFor({state:'visible'});assert.match(await page.locator('.source-section h3').innerText(),/S01E02/);
    await page.getByRole('button',{name:'Zwiń odcinki',exact:true}).click();await page.getByRole('button',{name:'Pokaż odcinki',exact:true}).click();assert.equal(await page.locator('.episode-list').isVisible(),true);
    await page.getByRole('button',{name:'Odtwórz automatycznie',exact:true}).click();await page.locator('.player-overlay').getByRole('button',{name:'Autoplay WYŁ.',exact:true}).waitFor({timeout:45000});
    const started=await page.evaluate(()=>window.nativeCalls.filter(value=>value.type==='play').length);await page.getByRole('button',{name:'Autoplay WYŁ.',exact:true}).click();await page.getByRole('button',{name:'Autoplay WŁ.',exact:true}).waitFor();await page.getByLabel('Ten hosting w kolejnych odcinkach').check();assert.equal(await page.locator('.player-overlay').isVisible(),true);assert.equal(await page.evaluate(()=>window.nativeCalls.filter(value=>value.type==='play').length),started);
    await page.getByRole('button',{name:'Pełny ekran',exact:true}).click();await page.locator('.player-footer').waitFor({state:'hidden'});await page.evaluate(()=>{window.nativeSession.playing=false;window.nativeEmit(window.nativeSession);});
    await page.getByRole('button',{name:'Poprzedni',exact:true}).click();await page.locator('.player-overlay').waitFor({state:'visible'});await page.waitForFunction(value=>window.nativeCalls.filter(call=>call.type==='play').length>value,started,{timeout:45000});
    assert.equal(await page.evaluate(()=>window.nativeCalls.filter(value=>value.type==='play').at(-1).fullscreen),true,'Episode changes preserve fullscreen');
    const oldId=await page.evaluate(()=>window.nativeCalls.filter(value=>value.type==='play').at(-2).playbackId);await page.evaluate(id=>window.nativeEmit({type:'error',playbackId:id,message:'Old stream error'}),oldId);assert.equal(await page.locator('.player-overlay').isVisible(),true);
    const beforeAdvance=await page.evaluate(()=>window.nativeCalls.filter(value=>value.type==='play').length);await page.evaluate(()=>window.nativeEmit({type:'closed',playbackId:window.nativeSession.playbackId,ended:true}));await page.waitForFunction(value=>window.nativeCalls.filter(call=>call.type==='play').length>value,beforeAdvance,{timeout:45000});assert.equal(await page.evaluate(()=>window.nativeCalls.filter(value=>value.type==='play').at(-1).fullscreen),true,'Autoplay preserves fullscreen');
    await page.evaluate(()=>{window.nativeSession.playing=false;window.nativeEmit(window.nativeSession);});await page.getByRole('button',{name:'Wróć do menu',exact:true}).click();
    await page.getByRole('button',{name:'Zamknij odtwarzacz',exact:true}).click();await page.locator('.modal').getByRole('button',{name:'Zamknij',exact:true}).click();
    await page.getByRole('button',{name:'Ustawienia',exact:true}).click();await page.getByRole('heading',{name:'Priorytety hostingów — maksymalnie 3',exact:true}).waitFor();assert.equal(await page.locator('label').filter({hasText:/Hosting numer [123]/}).count(),3);
    await page.getByLabel('Hosting numer 1',{exact:true}).selectOption('voe.sx');await page.getByText('Ustawienia zapisane.',{exact:true}).waitFor();const hosts=(await request('/settings')).value.preferredHosts;assert.equal(hosts[0],'voe.sx');assert.equal(hosts.filter(host=>host==='voe.sx').length,1,'Selecting an existing preferred host swaps priorities');
    if(process.env.QA_SCREENSHOT_DIR)await page.screenshot({path:resolve(process.env.QA_SCREENSHOT_DIR,'cinema-hosting-settings.png'),fullPage:false});assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});

test('Registration, backup codes and Authenticator pairing are available in the rendered account UI',{skip:!process.env.CHROMIUM_PATH},async()=>{
  const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--disable-dev-shm-usage']});
  try{
    const context=await browser.newContext({viewport:{width:1280,height:900}});await context.route('**/api/catalog',route=>route.fulfill({json:{groups:[],errors:[]}}));
    const page=await context.newPage(),errors=[],external=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',req=>{if(new URL(req.url()).origin!==base)external.push(req.url());});await page.goto(base);
    await page.getByRole('button',{name:'Odzyskaj hasło',exact:true}).click();await page.getByLabel('Sposób odzyskiwania').selectOption('authenticator');assert.equal(await page.getByLabel('Kod z Google Authenticator',{exact:true}).getAttribute('maxlength'),'6');assert.equal(await page.getByText('Kod nie jest wysyłany mailem.',{exact:false}).isVisible(),true);
    await page.getByRole('button',{name:'Wróć do logowania',exact:true}).click();await page.getByRole('button',{name:'Załóż nowe konto',exact:true}).click();await page.getByLabel('Użytkownik',{exact:true}).fill('ui-recovery');await page.getByLabel('Hasło',{exact:true}).fill('Fixture-local-987');await page.getByLabel('Powtórz hasło',{exact:true}).fill('Fixture-local-987');await page.getByRole('button',{name:'Utwórz konto',exact:true}).click();
    await page.getByRole('button',{name:'Ustawienia',exact:true}).click();assert.equal(await page.getByLabel('Hosting numer 1',{exact:true}).inputValue(),'voe.sx');await page.getByRole('button',{name:'Konto',exact:true}).click();
    await page.getByRole('heading',{name:'Lokalne kody odzyskiwania',exact:true}).waitFor();const authenticator=page.locator('.settings-form').filter({has:page.getByRole('heading',{name:'Google Authenticator — odzyskiwanie hasła',exact:true})});await authenticator.getByLabel('Potwierdź aktualne hasło',{exact:true}).fill('Fixture-local-987');const setupResponse=page.waitForResponse(response=>response.url()===base+'/api/auth/authenticator/setup');await page.getByRole('button',{name:'Sparuj Google Authenticator',exact:true}).click();const setup=await (await setupResponse).json();assert.match(setup.secret,/^[A-Z2-7]{32}$/);assert.equal(await page.locator('.authenticator-secret').innerText(),setup.secret);
    await page.getByLabel('Kod potwierdzający z aplikacji',{exact:true}).fill(totp(setup.secret));await page.getByRole('button',{name:'Potwierdź parowanie',exact:true}).click();await page.getByText('Odzyskiwanie kodem z aplikacji jest włączone.',{exact:false}).waitFor();assert.equal(await page.locator('.authenticator-secret').count(),0);
    if(process.env.QA_SCREENSHOT_DIR)await page.screenshot({path:resolve(process.env.QA_SCREENSHOT_DIR,'cinema-account-recovery.png'),fullPage:false});assert.deepEqual(errors,[]);assert.deepEqual(external,[],'Account creation and recovery use only the local server');
  }finally{await browser.close();}
});

test('Fullscreen browser menu dialogs retain the active movie',{skip:!hasTools||!process.env.CHROMIUM_PATH},async()=>{
  const settings=(await request('/settings')).value;await request('/settings',{defaultSources:[source.id]},admin,'PATCH');const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
  try{
    const context=await browser.newContext({viewport:{width:1280,height:720}});const equals=admin.indexOf('=');await context.addCookies([{name:admin.slice(0,equals),value:admin.slice(equals+1),url:base,httpOnly:true,sameSite:'Strict'}]);const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(base);await page.getByRole('button',{name:'Zobacz Film lokalny',exact:true}).click({timeout:30000});await page.locator('.playable-row').getByRole('button',{name:'Odtwórz',exact:true}).click({timeout:20000});await page.waitForFunction(()=>{const video=document.querySelector('.player-overlay video');return video&&!video.paused&&video.currentTime>0;});
    await page.getByRole('button',{name:'Pełny ekran',exact:true}).click();await page.locator('.player-footer').waitFor({state:'hidden'});await page.locator('.player-overlay video').click();await page.getByRole('button',{name:'Wznów',exact:true}).waitFor();const stream=await page.locator('.player-overlay video').evaluate(video=>video.currentSrc);
    const timeline=page.getByRole('slider',{name:'Pozycja odtwarzania',exact:true});await timeline.fill('80');assert.equal(await page.locator('.player-overlay video').evaluate(video=>video.currentTime),80);assert.equal(await page.locator('.player-overlay video').evaluate(video=>video.paused),true);await timeline.press('ArrowLeft');assert.equal(await page.locator('.player-overlay video').evaluate(video=>video.currentTime),70);
    await page.getByRole('button',{name:'Zmień źródło',exact:true}).click();const dialog=page.locator('.modal').filter({has:page.getByRole('heading',{name:'Zmień źródło odtwarzania',exact:true})});await dialog.waitFor();assert.equal(await dialog.evaluate(el=>document.fullscreenElement?.contains(el)),true);await dialog.getByRole('button',{name:'Zamknij',exact:true}).click();assert.equal(await page.locator('.player-overlay video').evaluate(video=>video.currentSrc),stream);
    await page.getByRole('button',{name:'Zapisz',exact:true}).click();const save=page.locator('.modal').filter({has:page.getByRole('heading',{name:'Zapisz film',exact:true})});await save.waitFor();assert.equal(await save.evaluate(el=>document.fullscreenElement?.contains(el)),true);await save.getByRole('button',{name:'Zamknij',exact:true}).click();await page.getByRole('button',{name:'Wznów',exact:true}).click();await page.locator('.player-footer').waitFor({state:'hidden'});assert.equal(await page.locator('.player-overlay video').evaluate(video=>video.paused),false);assert.deepEqual(errors,[]);
  }finally{await browser.close();await request('/settings',{defaultSources:settings.defaultSources},admin,'PATCH');}
});

test('Deleting a source removes only its owner configuration, profile and linked data',async()=>{
  const owner=(await request('/auth/me')).value;
  const created=await request('/sources',{name:'Disposable configuration',type:'http',url:origin+'/nginx/',credentials:{password:'synthetic-secret'}});
  const id=created.value.id,profile=resolve(directory,'browser',id),foreignProfile=resolve(directory,'browser',store.uid());
  mkdirSync(profile,{recursive:true});writeFileSync(resolve(profile,'test-cookie'),'synthetic session');
  mkdirSync(foreignProfile,{recursive:true});writeFileSync(resolve(foreignProfile,'keep'),'other source');
  const data=store.saveItem(id,{url:origin+'/film.mp4',title:'Disposable film',kind:'movie'});
  store.db.prepare('INSERT INTO favorites VALUES(?,?,?,?)').run(owner.id,data.id,'favorite',store.now());
  store.db.prepare('INSERT INTO progress VALUES(?,?,?,?,?)').run(owner.id,data.id,'',JSON.stringify({position:10}),store.now());
  const downloadId=store.uid();store.db.prepare('INSERT INTO downloads VALUES(?,?,?,?,?)').run(downloadId,owner.id,JSON.stringify({sourceId:id}),'queued',store.now());
  const playbackId=media.rememberPlayback(owner.id,{url:origin+'/film.mp4',kind:'mp4'},{sourceId:id,itemId:data.id});
  const controller=new AbortController();media.playbacks.get(playbackId).controllers=new Set([controller]);
  const checkId=store.uid(),check={sourceId:id,userId:owner.id,ready:[{playbackId}],cancelled:false};media.checks.set(checkId,check);
  let cancelled=false,closed=false;media.activeDownloads.set(downloadId,()=>cancelled=true);
  sourceBrowser.contexts.set(id,{close:async()=>{closed=true;}});
  sourceBrowser.cache.set(id+':url',{value:'source session',expires:store.now()+60000});
  const priorLease=sourceBrowser.lease,foreignLease={sourceId:store.uid(),userId:owner.id,expires:store.now()+100000};sourceBrowser.lease=foreignLease;
  const settings=store.getSettings(owner.id);store.saveSettings(owner.id,{...settings,defaultSources:[id,source.id]});
  try{
    assert.equal((await request('/sources/'+id,undefined,null,'DELETE')).status,401);
    assert.equal((await request('/sources/'+id,undefined,other,'DELETE')).status,404);
    assert.equal(existsSync(profile),true);
    assert.equal((await request('/sources/'+id,undefined,admin,'DELETE')).status,200);
    assert.equal(closed,true);assert.equal(cancelled,true);assert.equal(controller.signal.aborted,true);assert.equal(check.cancelled,true);
    assert.equal(existsSync(profile),false);assert.equal(existsSync(resolve(foreignProfile,'keep')),true);
    assert.equal(sourceBrowser.lease,foreignLease);assert.equal(sourceBrowser.cache.has(id+':url'),false);
    assert.equal(media.playbacks.has(playbackId),false);assert.equal(media.checks.has(checkId),false);
    assert.deepEqual(store.getSettings(owner.id).defaultSources,[source.id]);
    for(const table of ['sources','items','downloads'])assert.equal(store.db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE id=?`).get(table==='sources'?id:table==='items'?data.id:downloadId).count,0);
    assert.equal(store.db.prepare('PRAGMA foreign_key_check').all().length,0);
    assert.equal((await request('/sources/'+id,undefined,admin,'DELETE')).status,404);
    assert.equal((await request('/sources',null,other)).value.length>0,true);
    assert.equal(media.downloadActive({id:downloadId,userId:owner.id}),false);
  }finally{sourceBrowser.lease=priorLease;store.saveSettings(owner.id,settings);media.activeDownloads.delete(downloadId);}
});

test('Source deletion confirmation and selection refresh work in the rendered UI',{skip:!process.env.CHROMIUM_PATH},async()=>{
  const account=store.addUser('source-delete-ui','Synthetic-ui-9');
  const login=await request('/auth/login',{username:account.username,password:'Synthetic-ui-9'},null),cookie=login.response.headers.get('set-cookie').split(';')[0];
  const first=(await request('/sources',null,cookie)).value[0];
  await request('/sources/'+first.id,{name:first.name,type:first.type,url:first.url,credentials:{},enabled:false},cookie,'PUT');
  const created=await request('/sources',{name:'Źródło do usunięcia',type:'http',url:origin+'/nginx/',enabled:true},cookie);
  const sourceId=created.value.id;
  await request('/settings',{defaultSources:[sourceId]},cookie,'PATCH');
  const {chromium}=await import('playwright');const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const context=await browser.newContext();await context.addCookies([{name:'cinema_session',value:cookie.slice('cinema_session='.length),url:base}]);
    const page=await context.newPage();await page.goto(base);await page.getByRole('button',{name:'Ustawienia',exact:true}).click();await page.getByRole('button',{name:'Źródła',exact:true}).click();
    const remove=page.getByRole('button',{name:'Usuń konfigurację Źródło do usunięcia',exact:true});await remove.click();
    const dialog=page.getByRole('dialog');assert.equal(await dialog.isVisible(),true);await dialog.getByRole('button',{name:'Anuluj',exact:true}).click();assert.equal(await remove.count(),1);
    await remove.click();await dialog.getByRole('button',{name:'Usuń konfigurację',exact:true}).click();await remove.waitFor({state:'detached'});
    assert.equal((await request('/settings',null,cookie)).value.defaultSources.includes(sourceId),false);
    await page.getByRole('button',{name:'Biblioteka',exact:true}).click();await page.getByRole('heading',{name:'Brak pozycji dla tego wyboru',exact:true}).waitFor();
    assert.equal(await page.locator('.source-error').count(),0,'Disabled sources and deleted selections must not be queried');
    assert.equal(await page.locator('.movie-card').count(),0);
  }finally{await browser.close();}
});

test('Password reset CLI invalidates only the selected user sessions',async()=>{
  const child=spawn(process.execPath,['server/cli.mjs','reset-password','--user','viewer'],{env:process.env,stdio:['pipe','pipe','pipe']});child.stderr.resume();let pending='';child.stdout.on('data',chunk=>{pending+=chunk;if(pending.includes('Nowe hasło')){pending='';child.stdin.write('Viewer-replaced-9\n');}else if(pending.includes('Powtórz')){pending='';child.stdin.write('Viewer-replaced-9\n');}});assert.equal(await new Promise((r,j)=>{child.once('error',j);child.once('exit',r);}),0);assert.equal((await request('/auth/me',null,other)).status,401);assert.equal((await request('/auth/me')).status,200);assert.equal((await request('/auth/login',{username:'viewer',password:'Viewer-replaced-9'},null)).status,200);
});
