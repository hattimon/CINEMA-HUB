import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'node:http';
import httpProxy from 'http-proxy';
import { randomBytes } from 'node:crypto';
import { installAccountRoutes } from './account-routes.mjs';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { dataDir,db,uid,hashId,now,passwordMatches,passwordHash,encrypt,addUser,getSettings,saveSettings,getSource,listSources,deleteSource,saveItem,getItem,decorateItem,getDestination,filenameFor } from './store.mjs';
import { catalog,detail,przystanEntries } from './adapters.mjs';
import { combineCatalog } from './catalog-match.mjs';
import { itemLinks } from './catalog-links.mjs';
import { sourceBrowser } from './browser.mjs';
import { beginCheck,cancelCheck,orderHostingLinks,checkFor,playbackFor,playbacks,relay,serveInternal,exportToDevice,downloadFor,updateDownload,freshPlayback,cancelDownload,activeDownloads,forgetSource,downloadActive } from './media.mjs';
import { sourceErrorMessage } from './source-errors.mjs';
import { basicHeaders,textRequest,networkURL,safeRequest,readBounded } from './net.mjs';
import { remoteList,safePath } from './rclone.mjs';
import { assertSourceAvailable } from './limits.mjs';
import { isViderOrigin } from './vider-parser.mjs';

export const app=express();app.disable('x-powered-by');app.use(cookieParser());app.use(express.json({limit:'128kb'}));
app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff').set('Referrer-Policy','same-origin').set('X-Frame-Options','SAMEORIGIN');if(req.path.startsWith('/api'))res.set('Cache-Control','no-store');next();});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const asyncRoute=handler=>(req,res,next)=>Promise.resolve(handler(req,res)).catch(next);
function originAllowed(req) {if(!req.headers.origin)return !req.headers['sec-fetch-site']||['same-origin','same-site','none'].includes(req.headers['sec-fetch-site']);try{return new URL(req.headers.origin).host===req.headers.host || req.headers.origin===process.env.PUBLIC_ORIGIN;}catch{return false;}}
app.use((req,res,next)=>{if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!originAllowed(req))return res.status(403).json({error:'Żądanie pochodzi z innej strony.'});next();});
function sessionUser(req) {const token=req.cookies.cinema_session;if(!token)return null;return db.prepare('SELECT u.id,u.username,u.role,u.initial FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?').get(hashId(token),now())||null;}
function auth(req,res,next) {const user=sessionUser(req);if(!user)return res.status(401).json({error:'Zaloguj się do Cinema Hub.'});req.user=user;next();}
const cookieOptions={httpOnly:true,sameSite:'strict',secure:process.env.COOKIE_SECURE==='true',path:'/'};
installAccountRoutes(app,auth,cookieOptions);
const loginSchema=z.object({username:z.string().min(1).max(40),password:z.string().min(1).max(256),remember:z.boolean().default(false)});
const loginLimits=new Map();
app.get('/api/health',(_req,res)=>res.json({status:'ok',service:'cinema-hub',version:'1.3.7',localRevision:'release-1.3.7'}));
app.get('/download/cinema-hub.apk',(_req,res,next)=>{res.type('application/vnd.android.package-archive');res.download(existsSync(resolve('clients/CinemaHub-AndroidTV-v1.3.6.apk'))?resolve('clients/CinemaHub-AndroidTV-v1.3.6.apk'):resolve(dataDir,'clients','cinema-hub.apk'),'CinemaHub-AndroidTV-v1.3.6.apk',error=>{if(error&&!res.headersSent)next(error);});});
app.post('/api/auth/login',asyncRoute(async(req,res)=>{const value=loginSchema.parse(req.body);const ip=req.socket.remoteAddress;let limit=loginLimits.get(ip);if(limit&&limit.reset<now()){loginLimits.delete(ip);limit=null;}if(limit&&limit.count>=8)throw fail('Za wiele prób. Spróbuj za 5 minut.',429);const user=db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE').get(value.username);
  if(!user||!passwordMatches(value.password,user.password)){loginLimits.set(ip,{count:(limit?.count||0)+1,reset:limit?.reset||now()+5*60000});throw fail('Nieprawidłowy login lub hasło.',401);}loginLimits.delete(ip);const token=uid()+uid();const ttl=(value.remember?30:1)*86400000;db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hashId(token),user.id,now()+ttl);res.cookie('cinema_session',token,{...cookieOptions,...(value.remember?{maxAge:ttl}:{})});res.json({id:user.id,username:user.username,role:user.role,initial:!!user.initial});}));
app.get('/api/auth/me',auth,(req,res)=>res.json({...req.user,initial:!!req.user.initial}));
app.post('/api/auth/logout',auth,asyncRoute(async(req,res)=>{db.prepare('DELETE FROM sessions WHERE token=?').run(hashId(req.cookies.cinema_session));await sourceBrowser.finishLogin(req.user.id);res.clearCookie('cinema_session',cookieOptions).json({ok:true});}));
app.post('/api/auth/password',auth,(req,res,next)=>{try{const b=z.object({current:z.string().max(256),password:z.string().min(8).max(256)}).parse(req.body);const u=db.prepare('SELECT password FROM users WHERE id=?').get(req.user.id);if(!passwordMatches(b.current,u.password))throw fail('Obecne hasło jest nieprawidłowe.');db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE users SET password=?,initial=0 WHERE id=?').run(passwordHash(b.password),req.user.id);db.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').run(req.user.id,hashId(req.cookies.cinema_session));db.prepare('DELETE FROM recovery_codes WHERE user_id=?').run(req.user.id);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}res.json({ok:true});}catch(e){next(e);}});
// Recovery codes are high entropy secrets; only their account-scoped hashes are persisted.
app.post('/api/auth/recovery-codes',auth,(req,res,next)=>{try{const b=z.object({password:z.string().min(1).max(256)}).parse(req.body);const u=db.prepare('SELECT password FROM users WHERE id=?').get(req.user.id);if(!passwordMatches(b.password,u.password))throw fail('Hasło jest nieprawidłowe.',403);
  const codes=Array.from({length:8},()=>randomBytes(12).toString('hex').toUpperCase());db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM recovery_codes WHERE user_id=?').run(req.user.id);for(const code of codes)db.prepare('INSERT INTO recovery_codes VALUES(?,?,?)').run(req.user.id,hashId(req.user.id+':'+code),now());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}res.json({codes});
}catch(e){next(e);}});
const recoveryLimits=new Map();
app.post('/api/auth/recover', (req,res,next)=>{try{const b=z.object({username:z.string().min(1).max(40),code:z.string().min(20).max(40),password:z.string().min(8).max(256)}).parse(req.body);const ip=req.socket.remoteAddress||'unknown';let limit=recoveryLimits.get(ip);if(limit&&limit.reset<now()){recoveryLimits.delete(ip);limit=null;}if(limit?.count>=8)throw fail('Za wiele prób. Spróbuj za 5 minut.',429);
  const user=db.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE').get(b.username);const normalized=b.code.toUpperCase().replace(/[-\s]/g,'');const key=user?hashId(user.id+':'+normalized):'';const found=user&&db.prepare('SELECT 1 FROM recovery_codes WHERE user_id=? AND code_hash=?').get(user.id,key);
  if(!found){recoveryLimits.set(ip,{count:(limit?.count||0)+1,reset:limit?.reset||now()+5*60000});throw fail('Nieprawidłowe dane odzyskiwania.',401);}
  db.exec('BEGIN IMMEDIATE');try{const removed=db.prepare('DELETE FROM recovery_codes WHERE user_id=? AND code_hash=?').run(user.id,key);if(removed.changes!==1)throw fail('Kod został już wykorzystany.',401);db.prepare('UPDATE users SET password=?,initial=0 WHERE id=?').run(passwordHash(b.password),user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}recoveryLimits.delete(ip);res.json({ok:true});
}catch(e){next(e);}});
app.get('/api/users',auth,(req,res)=>{if(req.user.role!=='admin')return res.status(403).end();res.json(db.prepare('SELECT id,username,role,created FROM users ORDER BY created').all());});
app.post('/api/users',auth,(req,res,next)=>{try{if(req.user.role!=='admin')throw fail('Wymagane konto administratora.',403);const b=z.object({username:z.string().regex(/^[\p{L}\p{N}_.-]{3,40}$/u),password:z.string().min(8).max(256),role:z.enum(['user','admin']).default('user')}).parse(req.body);if(db.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE').get(b.username))throw fail('Taki użytkownik już istnieje.');res.status(201).json(addUser(b.username,b.password,b.role));}catch(e){next(e);}});
const settingsSchema=z.object({theme:z.enum(['violet','cyan','amber','rose']),style:z.enum(['cinematic','compact','classic','dense','wall','list']),posterScale:z.number().int().min(60).max(140).default(100),combineSources:z.boolean().default(false),videoEffect:z.enum(['none','crt','crt-warm','crt-green']).default('none'),imageProfile:z.enum(['natural','projector','cinema','soft']).default('natural'),volumeBoost:z.union([z.literal(100),z.literal(150),z.literal(200)]).default(100),sounds:z.boolean(),soundVolume:z.number().int().min(0).max(100).default(50),soundStyle:z.enum(['soft','arcade','minimal','retro','cinematic','wind','glass','futuristic']),autoplay:z.boolean(),autoFallback:z.boolean(),preferredVersion:z.string().max(60),preferredHosts:z.array(z.string().trim().max(200)).max(3).default(['voe.sx','','']),defaultSources:z.array(z.string().regex(/^[a-f0-9]{32}$/)).max(30),defaultDestination:z.string().max(60)});
app.get('/api/settings',auth,(req,res)=>res.json(getSettings(req.user.id)));
function updateSettings(req,res,next,partial=false){try{const patch=(partial?settingsSchema.partial():settingsSchema).parse(req.body);const value=settingsSchema.parse({...getSettings(req.user.id),...patch});if(new Set(value.preferredHosts.filter(Boolean).map(h=>h.toLowerCase())).size!==value.preferredHosts.filter(Boolean).length)throw fail('Hosting nie może występować kilka razy.');for(const id of value.defaultSources)getSource(id,req.user.id);if(value.defaultDestination!=='device')getDestination(value.defaultDestination,req.user.id);saveSettings(req.user.id,value);res.json(value);}catch(e){next(e);}}
app.put('/api/settings',auth,(req,res,next)=>updateSettings(req,res,next));
app.patch('/api/settings',auth,(req,res,next)=>updateSettings(req,res,next,true));
const sourceOptionsSchema=z.object({startFolder:z.string().max(512).default(''),recursive:z.boolean().default(true)});
const sourceSchema=z.object({name:z.string().trim().min(1).max(80),type:z.enum(['filman','vider','plex','http','przystan','ftp','webdav','s3','device']),url:z.string().max(2048),credentials:z.record(z.string().max(4096)).default({}),options:sourceOptionsSchema.optional(),enabled:z.boolean().default(true)});
function validatedSource(body) {
  const value=sourceSchema.parse(body);
  value.options=value.type==='przystan'?sourceOptionsSchema.parse(value.options||{}):{};
  if(value.type==='przystan')value.options.startFolder=safePath(value.options.startFolder).replace(/^\/+|\/+$/g,'');
  if(value.type==='device'){value.url='device:';return value;}
  if(value.type==='ftp'){
    const u=new URL(value.url);
    if(!['ftp:','ftps:'].includes(u.protocol)||u.username||u.password)throw fail('Podaj FTP/FTPS i wpisz dane osobno.');
  }else{
    const u=networkURL(value.url);
    value.url=value.type==='vider'?u.href:u.href.replace(/\/?$/,'/');
    if(value.type==='filman'&&!(u.protocol==='https:'&&/^(www\.)?filman\.cc$/.test(u.hostname))&&value.url!==process.env.FIXTURE_ORIGIN+'/')throw fail('Adapter Filman wymaga adresu https://filman.cc/.');
    if(value.type==='vider'){
      if(!isViderOrigin(u)&&value.url!==process.env.FIXTURE_ORIGIN+'/')throw fail('Adapter Vider wymaga adresu https://vider.info/ lub https://vider.pl/.');
      if(!['/',''].includes(u.pathname)&&!/^\/(?:vid|dir)\/[+a-z0-9_-]+\/?$/i.test(u.pathname))throw fail('Wskaż stronę główną Vider albo adres /dir/... lub /vid/...');
    }
  }
  return value;
}
app.get('/api/sources',auth,(req,res)=>res.json(listSources(req.user.id)));
app.post('/api/sources',auth,(req,res,next)=>{try{const b=validatedSource(req.body);const id=uid();db.prepare('INSERT INTO sources(id,user_id,name,type,url,secret,enabled,options) VALUES(?,?,?,?,?,?,?,?)').run(id,req.user.id,b.name,b.type,b.url,encrypt(b.credentials),b.enabled?1:0,JSON.stringify(b.options));res.status(201).json({id,...b,credentials:undefined});}catch(e){next(e);}});
app.put('/api/sources/:id',auth,asyncRoute(async(req,res)=>{const old=getSource(req.params.id,req.user.id);const b=validatedSource(req.body);if(sourceBrowser.lease?.sourceId===old.id)await sourceBrowser.finishLogin(req.user.id);const credentials=old.type===b.type?{...old.credentials,...b.credentials}:b.credentials;const options=old.type===b.type&&!req.body.options?old.options:b.options;db.prepare('UPDATE sources SET name=?,type=?,url=?,secret=?,enabled=?,options=? WHERE id=? AND user_id=?').run(b.name,b.type,b.url,encrypt(credentials),b.enabled?1:0,JSON.stringify(options),old.id,req.user.id);res.json({ok:true});}));
app.delete('/api/sources/:id',auth,asyncRoute(async(req,res)=>{
  const source=getSource(req.params.id,req.user.id);
  forgetSource(source.id,req.user.id);
  await sourceBrowser.removeSource(source.id,()=>deleteSource(source.id,req.user.id));
  res.json({ok:true});
}));
app.get('/api/sources/:id/inspect',auth,asyncRoute(async(req,res)=>{
  const source=getSource(req.params.id,req.user.id);
  if(source.type!=='przystan')throw fail('Przeglądanie folderów jest dostępne dla Przystani.',400);
  const path=z.string().max(512).parse(req.query.path||'');
  const result=await przystanEntries(source,path);
  res.json({path:result.path,folders:result.entries.filter(e=>e.kind==='folder').map(e=>({path:e.path,title:e.name})),videos:result.entries.filter(e=>e.kind==='video').length});
}));
app.post('/api/sources/:id/device-index',auth,(req,res,next)=>{try{const source=getSource(req.params.id,req.user.id);if(source.type!=='device')throw fail('Wymagane źródło urządzenia.');const b=z.object({files:z.array(z.object({name:z.string().max(255),path:z.string().max(1024)})).max(1000)}).parse(req.body);res.json(b.files.map(f=>{safePath(f.path);return decorateItem(saveItem(source.id,{url:'device:'+f.path,title:f.name.replace(/\.[^.]+$/,''),kind:'movie',poster:'',description:'Plik na Twoim urządzeniu',rating:null,ratingScale:10,year:null,sourceName:source.name}),req.user.id);}));}catch(e){next(e);}});
app.post('/api/sources/:id/login',auth,asyncRoute(async(req,res)=>{const source=getSource(req.params.id,req.user.id);if(!['filman','vider'].includes(source.type))throw fail('Ten typ źródła używa danych wpisanych w ustawieniach.');res.json(await sourceBrowser.openLogin(source,req.user.id));}));
app.get('/api/browser/session',auth,(req,res)=>res.json({active:sourceBrowser.lease?.userId===req.user.id,expires:sourceBrowser.lease?.userId===req.user.id?sourceBrowser.lease.expires:null}));
app.post('/api/browser/finish',auth,asyncRoute(async(req,res)=>res.json({ok:await sourceBrowser.finishLogin(req.user.id)})));
app.get('/api/destinations',auth,(req,res)=>res.json(db.prepare('SELECT id,name,type,config FROM destinations WHERE user_id=?').all(req.user.id).map(d=>({...d,config:JSON.parse(d.config)}))));
const destinationSchema=z.object({name:z.string().trim().min(1).max(80),type:z.enum(['ftp','webdav','s3']),config:z.object({url:z.string().max(2048),prefix:z.string().max(512).default(''),bucket:z.string().max(160).default(''),region:z.string().max(80).default('us-east-1')}),credentials:z.record(z.string().max(4096)).default({})});
app.post('/api/destinations',auth,(req,res,next)=>{try{const b=destinationSchema.parse(req.body);safePath(b.config.prefix);if(b.type==='ftp'){const u=new URL(b.config.url);if(!['ftp:','ftps:'].includes(u.protocol)||u.username||u.password)throw fail('Nieprawidłowy adres FTP/FTPS.');}else networkURL(b.config.url);if(b.type==='s3'&&!b.config.bucket)throw fail('Podaj nazwę bucketu.');const id=uid();db.prepare('INSERT INTO destinations VALUES(?,?,?,?,?,?)').run(id,req.user.id,b.name,b.type,JSON.stringify(b.config),encrypt(b.credentials));res.status(201).json({id,name:b.name,type:b.type,config:b.config});}catch(e){next(e);}});
app.put('/api/destinations/:id',auth,(req,res,next)=>{try{const old=getDestination(req.params.id,req.user.id),b=destinationSchema.parse(req.body);safePath(b.config.prefix);if(b.type==='ftp'){const u=new URL(b.config.url);if(!['ftp:','ftps:'].includes(u.protocol)||u.username||u.password)throw fail('Nieprawidłowy adres FTP.');}else networkURL(b.config.url);if(b.type==='s3'&&!b.config.bucket)throw fail('Podaj nazwę bucketu.');db.prepare('UPDATE destinations SET name=?,type=?,config=?,secret=? WHERE id=? AND user_id=?').run(b.name,b.type,JSON.stringify(b.config),encrypt(old.type===b.type?{...old.credentials,...b.credentials}:b.credentials),old.id,req.user.id);res.json({ok:true});}catch(e){next(e);}});
const catalogSchema=z.object({sources:z.array(z.string()).max(30).default([]),kind:z.enum(['all','movies','series','children','hd']).default('all'),filters:z.record(z.array(z.string()).max(20)).default({}),query:z.string().max(120).default(''),page:z.number().int().min(1).max(10000).default(1),folder:z.string().max(512).default('')});
app.post('/api/catalog',auth,asyncRoute(async(req,res)=>{
  const b=catalogSchema.parse(req.body);const sources=(b.sources.length?b.sources:listSources(req.user.id).filter(s=>s.enabled).map(s=>s.id)).map(id=>getSource(id,req.user.id)).filter(source=>source.enabled);
  const results=await Promise.allSettled(sources.map(async source=>{const result=await catalog(source,{...b,kind:b.kind==='hd'?'movies':b.kind,filters:b.kind==='hd'?{...b.filters,quality:['4']}:b.filters});return {...result,sourceId:source.id,sourceName:source.name,items:result.items.map(item=>decorateItem(saveItem(source.id,{...item,sourceName:source.name}),req.user.id))};}));
  const groups=[],errors=[];results.forEach((r,i)=>{if(r.status==='fulfilled')groups.push(r.value);else errors.push({sourceId:sources[i].id,sourceName:sources[i].name,message:process.env.NODE_ENV==='test'?r.reason.message:sourceErrorMessage(r.reason,sources[i])});});res.json({groups:getSettings(req.user.id).combineSources?combineCatalog(groups,new Map(sources.map(source=>[source.id,source.type]))):groups,errors});
}));
app.get('/api/items/:id',auth,asyncRoute(async(req,res)=>{const item=getItem(req.params.id,req.user.id),source=getSource(item.sourceId,req.user.id);const result=await detail(source,item);res.json(decorateItem(saveItem(source.id,{...result,sourceName:source.name}),req.user.id));}));
app.post('/api/items/:id/check',auth,asyncRoute(async(req,res)=>{const b=z.object({episode:z.string().max(2048).optional(),linkId:z.string().max(80).optional(),link:z.object({host:z.string().max(200),version:z.string().max(80),quality:z.string().max(40)}).optional(),auto:z.boolean().default(false),fresh:z.boolean().default(false),preferredVersion:z.string().max(80).optional(),preferredHost:z.string().max(200).optional(),excludeLinkIds:z.array(z.string().max(80)).max(30).default([])}).parse(req.body);const item=getItem(req.params.id,req.user.id),source=getSource(item.sourceId,req.user.id);let episode;
  if(b.episode){episode=item.episodes?.find(e=>e.url===b.episode);if(!episode)throw fail('Odcinek nie należy do tego serialu.');}else if(item.kind==='series')throw fail('Wybierz odcinek.');
  let links=await itemLinks(req.user.id,item,source,episode);if(b.linkId){const exact=links.filter(l=>l.id===b.linkId&&(!b.link||l.host===b.link.host&&l.version===b.link.version&&l.quality===b.link.quality));const matching=b.link?links.filter(l=>l.host===b.link.host&&l.version===b.link.version&&l.quality===b.link.quality):[];links=exact.length?exact:matching.length===1?matching:[];if(!links.length)throw fail('Lista hostingów zmieniła się. Otwórz ponownie szczegóły i wybierz dostępny link.');}
  if(b.auto)links=links.filter(l=>!b.excludeLinkIds.includes(l.id));
  if(['filman','vider'].includes(source.type)){
    if(!b.linkId&&!b.auto)throw fail('Wybierz hosting lub uruchom automatyczne odtwarzanie.');
    if(links.some(link=>!link.sourceId||link.sourceId===source.id))assertSourceAvailable(source.id);
    if(b.auto){const preferences=getSettings(req.user.id);links=orderHostingLinks(links,b.preferredVersion||preferences.preferredVersion,[b.preferredHost,...preferences.preferredHosts].filter(Boolean));}
  }
  res.json({id:beginCheck(req.user.id,source,item,episode,links,{stopOnSuccess:b.auto,fresh:b.fresh}),total:links.length,selectedLinkId:b.linkId?links[0].id:undefined});
}));
app.get('/api/items/:id/links',auth,asyncRoute(async(req,res)=>{const item=getItem(req.params.id,req.user.id),source=getSource(item.sourceId,req.user.id);const episode=req.query.episode?item.episodes?.find(e=>e.url===req.query.episode):null;if(req.query.episode&&!episode)throw fail('Nieprawidłowy odcinek.');const links=await itemLinks(req.user.id,item,source,episode);res.json(links.map(({id,host,version,quality})=>({id,host,version,quality})));}));
app.get('/api/items/:id/ready',auth,(req,res,next)=>{try{
  const item=getItem(req.params.id,req.user.id),episode=req.query.episode||'';
  if(episode&&!item.episodes?.some(e=>e.url===episode))throw fail('Nieprawidłowy odcinek.');
  const enabled=new Set(listSources(req.user.id).filter(source=>source.enabled).map(source=>source.id));const merge=getSettings(req.user.id).combineSources;
  const ready=[...playbacks.values()].reverse().filter(p=>p.userId===req.user.id&&enabled.has(p.sourceId)&&(merge||p.sourceId===item.sourceId)&&p.itemId===item.id&&(p.episode?.url||'')===episode&&p.expires>now());
  const distinct=new Map();for(const p of ready){const key=JSON.stringify([p.link.host,p.link.version,p.quality]);if(!distinct.has(key))distinct.set(key,{id:p.selectedLinkId||p.link.id,host:p.link.host,version:p.link.version,quality:p.quality||p.link.quality,kind:p.kind,playbackId:p.id});}
  res.json([...distinct.values()]);
}catch(e){next(e);}});
app.get('/api/checks/:id',auth,(req,res,next)=>{try{const {userId,cancelled,expires,...result}=checkFor(req.params.id,req.user.id);res.json(result);}catch(e){next(e);}});
app.post('/api/checks/:id/cancel',auth,(req,res,next)=>{try{cancelCheck(req.params.id,req.user.id);res.json({ok:true});}catch(e){next(e);}});
app.put('/api/items/:id/favorite',auth,(req,res,next)=>{try{getItem(req.params.id,req.user.id);const b=z.object({kind:z.enum(['favorite','watchlist']),active:z.boolean()}).parse(req.body);if(b.active)db.prepare('INSERT OR IGNORE INTO favorites VALUES(?,?,?,?)').run(req.user.id,req.params.id,b.kind,now());else db.prepare('DELETE FROM favorites WHERE user_id=? AND item_id=? AND kind=?').run(req.user.id,req.params.id,b.kind);res.json({ok:true});}catch(e){next(e);}});
app.get('/api/library/:kind',auth,(req,res)=>{const rows=req.params.kind==='continue'?db.prepare('SELECT DISTINCT i.value FROM items i JOIN progress p ON p.item_id=i.id JOIN sources s ON s.id=i.source_id WHERE p.user_id=? AND s.user_id=? ORDER BY p.updated DESC').all(req.user.id,req.user.id):db.prepare('SELECT i.value FROM items i JOIN favorites f ON f.item_id=i.id JOIN sources s ON s.id=i.source_id WHERE f.user_id=? AND s.user_id=? AND f.kind=? ORDER BY f.created DESC').all(req.user.id,req.user.id,req.params.kind==='watchlist'?'watchlist':'favorite');res.json(rows.map(r=>decorateItem(JSON.parse(r.value),req.user.id)));});
app.put('/api/items/:id/progress',auth,(req,res,next)=>{try{const item=getItem(req.params.id,req.user.id);const b=z.object({episode:z.string().max(2048).default(''),position:z.number().finite().min(0).max(360000),duration:z.number().finite().min(0).max(360000),completed:z.boolean().default(false),season:z.number().int().min(0).max(1000).optional(),number:z.number().int().min(0).max(10000).optional(),title:z.string().max(160).optional()}).parse(req.body);if(b.episode&&!item.episodes?.some(e=>e.url===b.episode))throw fail('Nieprawidłowy odcinek.');db.prepare('INSERT INTO progress VALUES(?,?,?,?,?) ON CONFLICT(user_id,item_id,episode) DO UPDATE SET value=excluded.value,updated=excluded.updated').run(req.user.id,item.id,b.episode,JSON.stringify(b),now());res.json({ok:true});}catch(e){next(e);}});
app.get('/api/items/:id/progress',auth,(req,res,next)=>{try{getItem(req.params.id,req.user.id);res.json(db.prepare('SELECT value FROM progress WHERE user_id=? AND item_id=? ORDER BY updated DESC').all(req.user.id,req.params.id).map(r=>JSON.parse(r.value)));}catch(e){next(e);}});
app.get('/api/poster/:id',auth,asyncRoute(async(req,res)=>{const item=getItem(req.params.id,req.user.id);if(!item.poster)return res.status(404).end();const source=getSource(item.sourceId,req.user.id);const headers=source.type==='plex'?{'X-Plex-Token':source.credentials.token||''}:basicHeaders(source.credentials);if(new URL(item.poster).origin!==networkURL(source.url).origin)for(const key of Object.keys(headers))delete headers[key];const upstream=await safeRequest(item.poster,{headers,allowedOrigins:[networkURL(source.url).origin]});const type=String(upstream.headers['content-type']||'');if(upstream.statusCode!==200||!type.startsWith('image/')){upstream.destroy();return res.status(404).end();}res.set('Cache-Control','private, max-age=3600').type(type).send(await readBounded(upstream,8*1024*1024));}));
app.get('/api/playback/:id/media',auth,asyncRoute(async(req,res)=>relay(playbackFor(req.params.id,req.user.id),req,res,{prefix:`/api/playback/${req.params.id}`})));
app.get('/api/playback/:id/asset/:asset',auth,asyncRoute(async(req,res)=>relay(playbackFor(req.params.id,req.user.id),req,res,{prefix:`/api/playback/${req.params.id}`,assetId:req.params.asset})));
app.get('/internal/export/:token/media',asyncRoute(serveInternal));app.get('/internal/export/:token/asset/:asset',asyncRoute(serveInternal));
app.get('/api/downloads',auth,(req,res)=>res.json(db.prepare('SELECT * FROM downloads WHERE user_id=? ORDER BY updated DESC').all(req.user.id).map(row=>{const job=JSON.parse(row.value);delete job.userId;delete job.link;delete job.pageURL;return {...job,id:row.id,status:row.status,updated:row.updated};})));
app.post('/api/downloads',auth,(req,res,next)=>{try{const b=z.object({playbackId:z.string(),destination:z.string().default('device')}).parse(req.body);const p=playbackFor(b.playbackId,req.user.id),item=getItem(p.itemId,req.user.id);if(b.destination!=='device')getDestination(b.destination,req.user.id);const id=uid();const value={id,userId:req.user.id,playbackId:p.id,sourceId:p.sourceId,itemId:item.id,pageURL:p.pageURL,link:p.link,episode:p.episode||null,destination:b.destination,filename:filenameFor(item,p.episode,p.quality).replace(/\.mp4$/,p.kind==='webm'||/\.webm$/i.test(p.url)?'.webm':'.mp4'),title:item.title,bytes:0,attempts:0};db.prepare('INSERT INTO downloads VALUES(?,?,?,?,?)').run(id,req.user.id,JSON.stringify(value),'queued',now());res.status(201).json({id,filename:value.filename,destination:b.destination,status:'queued'});}catch(e){next(e);}});
const deviceLocks=new Map();
app.get('/api/downloads/:id/file',auth,asyncRoute(async(req,res)=>{
  let job=downloadFor(req.params.id,req.user.id);if(job.destination!=='device')throw fail('Plik jest zapisany w wskazanym magazynie.');
  const owner=req.user.id,previous=deviceLocks.get(owner)||Promise.resolve();let release;const lock=new Promise(r=>release=r),tail=previous.catch(()=>{}).then(()=>lock);deviceLocks.set(owner,tail);await previous.catch(()=>{});
  activeDownloads.set(job.id,()=>res.destroy());let bytes=0,last=0;try{if(res.destroyed)return;job=downloadFor(req.params.id,owner);if(job.status==='cancelled')throw fail('Pobieranie anulowano.');const candidate=await freshPlayback({...job,userId:owner});updateDownload({...job,userId:owner},'downloading',{bytes:0});const write=res.write;res.write=function(chunk,...args){bytes+=typeof chunk==='string'?Buffer.byteLength(chunk):chunk.length;if(now()-last>1000){last=now();updateDownload({...job,userId:owner},'downloading',{bytes});}return write.call(this,chunk,...args);};await exportToDevice(candidate,req,res,job.filename);if(downloadActive({...job,userId:owner}))updateDownload({...job,userId:owner},res.writableFinished&&bytes>1024?'ready':'paused',{bytes});}catch(e){if(downloadActive({...job,userId:owner}))updateDownload({...job,userId:owner},'failed',{bytes,error:'Pobieranie przerwane. Spróbuj ponownie.'});throw e;}finally{activeDownloads.delete(job.id);release();if(deviceLocks.get(owner)===tail)deviceLocks.delete(owner);}
}));
app.put('/api/downloads/:id/state',auth,(req,res,next)=>{try{const job=downloadFor(req.params.id,req.user.id);if(job.destination!=='device')throw fail('Stan zadania chmurowego aktualizuje serwer.');const b=z.object({status:z.enum(['queued','paused','downloading','ready','failed']),bytes:z.number().int().min(0).max(100000000000).default(0),error:z.string().max(200).optional()}).parse(req.body);res.json(updateDownload({...job,userId:req.user.id},b.status,{bytes:b.bytes,error:b.error}));}catch(e){next(e);}});
app.post('/api/downloads/:id/cancel',auth,(req,res,next)=>{try{res.json(cancelDownload(req.params.id,req.user.id));}catch(e){next(e);}});
app.post('/api/downloads/:id/retry',auth,(req,res,next)=>{try{const job=downloadFor(req.params.id,req.user.id);res.json(updateDownload({...job,userId:req.user.id},'queued',{attempts:0,bytes:0,error:'',retryAfter:0}));}catch(e){next(e);}});
app.post('/api/destinations/:id/test',auth,asyncRoute(async(req,res)=>{const dest=getDestination(req.params.id,req.user.id);await remoteList({type:dest.type,url:dest.config.url,credentials:{...dest.config,...dest.credentials}},'');res.json({ok:true});}));
app.post('/api/destinations/:id/as-source',auth,(req,res,next)=>{try{const dest=getDestination(req.params.id,req.user.id);const existing=db.prepare('SELECT id FROM sources WHERE user_id=? AND name=? AND type=? AND url=?').get(req.user.id,dest.name,dest.type,dest.config.url);if(existing)return res.json({id:existing.id});const id=uid();db.prepare('INSERT INTO sources(id,user_id,name,type,url,secret,enabled) VALUES(?,?,?,?,?,?,1)').run(id,req.user.id,dest.name,dest.type,dest.config.url,encrypt({...dest.config,...dest.credentials}));res.status(201).json({id});}catch(e){next(e);}});
app.get('/api/diagnostics',auth,(req,res)=>res.json({version:'1.3.7',database:'ok',sources:listSources(req.user.id).length,browserLogin:sourceBrowser.lease?.userId===req.user.id,containerStoresMedia:false,secureCookie:cookieOptions.secure,downloads:db.prepare('SELECT status,COUNT(*) AS count FROM downloads WHERE user_id=? GROUP BY status').all(req.user.id)}));
const proxy=httpProxy.createProxyServer({target:'http://127.0.0.1:6080',ws:true});proxy.on('error',(_err,_req,res)=>{if(res?.writeHead){res.writeHead(503);res.end('Przeglądarka logowania jest niedostępna.');}else res?.destroy();});
app.use('/browser',auth,(req,res)=>{if(sourceBrowser.lease?.userId!==req.user.id||sourceBrowser.lease.expires<now())return res.status(403).end();proxy.web(req,res);});
const dist=resolve('dist');if(existsSync(dist))app.use(express.static(dist,{index:false}));
app.use('/api',(_req,res)=>res.status(404).json({error:'Nie znaleziono zasobu.'}));
app.get('/{*path}',(_req,res)=>existsSync(resolve(dist,'index.html'))?res.sendFile(resolve(dist,'index.html')):res.status(503).send('Uruchom npm run build.'));
app.use((err,req,res,_next)=>{if(res.headersSent)return res.destroy();const status=err instanceof z.ZodError?400:err.status||500;const error=err instanceof z.ZodError?'Sprawdź wpisane dane.':status===500?'Operacja nie powiodła się. Sprawdź ustawienia i dostępność źródła.':err.message;if(status===500)console.error('request_error',{method:req.method,path:req.path.split('/').slice(0,3).join('/'),type:err.name});const retryAfter=status===429&&Number.isFinite(err.retryAfter)&&err.retryAfter>now()?err.retryAfter:undefined;if(retryAfter)res.set('Retry-After',String(Math.ceil((retryAfter-now())/1000)));res.status(status).json({error,...(retryAfter?{retryAfter}:{})});});
export const server=http.createServer(app);
const loginSockets=new Set();
server.on('upgrade',(req,socket,head)=>{req.cookies=Object.fromEntries(String(req.headers.cookie||'').split(';').map(part=>part.trim().split('=')).filter(([name])=>name));const user=sessionUser(req);if(!req.url.startsWith('/browser/websockify')||!user||!originAllowed(req)||sourceBrowser.lease?.userId!==user.id||sourceBrowser.lease.expires<now()){socket.destroy();return;}req.url='/websockify';loginSockets.add(socket);socket.on('close',()=>loginSockets.delete(socket));proxy.ws(req,socket,head);});
const maintenanceTimer=setInterval(()=>{db.prepare('DELETE FROM sessions WHERE expires<?').run(now());if(!sourceBrowser.lease||sourceBrowser.lease.expires<now()){for(const socket of loginSockets)socket.destroy();if(sourceBrowser.lease)sourceBrowser.finishLogin(sourceBrowser.lease.userId).catch(()=>{});}},3000);
maintenanceTimer.unref();
server.on('close',()=>clearInterval(maintenanceTimer));
if(process.env.NODE_ENV!=='test')server.listen(Number(process.env.PORT||8090),process.env.BIND||'0.0.0.0',()=>console.log(`Cinema Hub listening on port ${process.env.PORT||8090}`));
process.on('SIGTERM',()=>{server.close();sourceBrowser.close().finally(()=>process.exit(0));});
