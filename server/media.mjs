import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { safeRequest,readBounded,networkURL,uploadStream,basicHeaders } from './net.mjs';
import { configuredRemote,safePath,capture } from './rclone.mjs';
import { db,getSource,getDestination,uid,now } from './store.mjs';
import { resolveLink } from './adapters.mjs';
import { abortable } from './playback-work.mjs';
import { setTimeout as pause } from 'node:timers/promises';

export const playbacks=new Map(),checks=new Map();
const checkControllers=new Map();
export function cancelCheck(id,userId) {
  const check=checkFor(id,userId);check.cancelled=true;
  if(check.status==='checking')check.status='cancelled';
  checkControllers.get(id)?.abort(Object.assign(new Error('Sprawdzanie anulowano.'),{status:499}));
  return check;
}
export function forgetSource(sourceId,userId) {
  for(const [id,check]of checks)if(check.sourceId===sourceId&&check.userId===userId){cancelCheck(id,userId);check.ready=[];checks.delete(id);}
  for(const [id,playback]of playbacks)if(playback.sourceId===sourceId&&playback.userId===userId){for(const controller of playback.controllers||[])controller.abort();playbacks.delete(id);}
  for(const row of db.prepare("SELECT id FROM downloads WHERE user_id=? AND json_extract(value,'$.sourceId')=?").all(userId,sourceId))activeDownloads.get(row.id)?.();
}
export function downloadActive(job) {const row=db.prepare('SELECT status FROM downloads WHERE id=? AND user_id=?').get(job.id,job.userId);return !!row&&row.status!=='cancelled';}
export function versionPriority(value) {
  const text=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_-]/g,' ');
  if(/lektor/.test(text)&&!/(ai|syntetycz|maszynow)/.test(text))return 1;
  if(/dubb/.test(text))return 2;
  if(/lektor/.test(text)&&/(ai|syntetycz|maszynow)/.test(text))return 3;
  if(/\b(polsk(i|a|ie)|pl)\b/.test(text)&&!/(napis|sub|translat|tlumacz)/.test(text))return 0;
  if(/napis|subtit|sub\b/.test(text)&&!/(eng|english|angiel|\ben\b)/.test(text))return 4;
  if(/translat|tlumacz|przeklad|pl\b/.test(text)&&!/(eng|english|angiel)/.test(text))return 5;
  if(/oryg|original|eng|english|angiel/.test(text))return 7;
  return 6;
}
const resolution=quality=>{const text=String(quality||'').toLowerCase();const match=text.match(/(\d{3,4})\s*p?\b/);return match?Number(match[1]):/4k|uhd/.test(text)?2160:/full\s*hd|fhd/.test(text)?1080:/\bhd\b/.test(text)?720:0;};
export function orderHostingLinks(links,preferredVersion='Lektor',preferredHosts=[]) {
  const selections=(Array.isArray(preferredHosts)?preferredHosts:[preferredHosts]).map(h=>String(h||'').trim().toLowerCase()).filter(Boolean);
  const rank=host=>{const index=selections.indexOf(String(host||'').trim().toLowerCase());return index<0?selections.length:index;};
  // Keep the language preference first; configured hosts precede other hosts
  // within that language, with the best available quality on each host first.
  const selected=String(preferredVersion||'Lektor').toLowerCase().replace(/[_-]/g,' ');
  const preferredRank=versionPriority(selected);
  const language=link=>{const rank=versionPriority(link.version);return preferredRank<7&&rank===preferredRank?0:rank+1;};
  return [...links].sort((left,right)=>language(left)-language(right)||rank(left.host)-rank(right.host)||resolution(right.quality)-resolution(left.quality));
}
export function rememberPlayback(userId,candidate,context={}) {const id=uid();playbacks.set(id,{...candidate,...context,id,userId,expires:now()+60*60*1000,assets:new Map()});return id;}
export function playbackFor(id,userId) {const result=playbacks.get(id);if(!result||result.userId!==userId||result.expires<now())throw Object.assign(new Error('Sesja źródła wygasła. Sprawdź źródła ponownie.'),{status:410});result.expires=now()+60*60*1000;return result;}
export function beginCheck(userId,source,item,episode,links,{stopOnSuccess=false,fresh=false,attemptTimeoutMs=75000,pauseMs=1200}={}) {
  const linkIds=links.map(link=>link.id);
  const duplicate=[...checks.values()].find(c=>c.userId===userId&&c.sourceId===source.id&&c.itemId===item.id&&c.episodeURL===(episode?.url||'')&&c.status==='checking'&&!c.cancelled&&c.stopOnSuccess===stopOnSuccess&&c.fresh===fresh&&JSON.stringify(c.linkIds)===JSON.stringify(linkIds));if(duplicate)return duplicate.id;
  // One active selection per account/source. A manual selection supersedes the
  // old automatic run even if its HTTP cancel request arrives a little later.
  for(const check of checks.values())if(check.userId===userId&&check.sourceId===source.id&&check.status==='checking')cancelCheck(check.id,userId);
  const previous=fresh?[]:[...checks.values()].filter(c=>c.userId===userId&&c.sourceId===source.id&&c.itemId===item.id&&c.episodeURL===(episode?.url||'')&&c.created>now()-5*60000).flatMap(c=>c.ready);
  const id=uid();const check={id,userId,sourceId:source.id,itemId:item.id,episodeURL:episode?.url||'',linkIds,stopOnSuccess,fresh,status:'checking',checked:0,total:links.length,ready:[],attempted:[],failures:[],created:now(),expires:now()+60*60*1000,cancelled:false};checks.set(id,check);
  const controller=new AbortController();checkControllers.set(id,controller);
  const runSignal=AbortSignal.any([controller.signal,AbortSignal.timeout(240000)]);
  (async()=>{for(const link of links.slice(0,30)) {if(check.cancelled)break;runSignal.throwIfAborted();check.currentHost=link.host;check.attempted.push(link.id);check.lastError='';let success=false;try{
    const cached=previous.find(ready=>ready.id===link.id&&ready.host===link.host&&ready.version===link.version&&playbacks.get(ready.playbackId)?.expires>now());
    if(cached){check.ready.push(cached);success=true;}
    else {const effectiveSource=link.sourceId?getSource(link.sourceId,userId):source;if(effectiveSource.enabled===0)throw new Error('Źródło zostało wyłączone.');const providerLink={...link,id:link.originalId||link.id},pageURL=link.pageURL||episode?.url||item.url;const signal=AbortSignal.any([runSignal,AbortSignal.timeout(attemptTimeoutMs)]);const candidate=await abortable(resolveLink(effectiveSource,pageURL,providerLink,phase=>{signal.throwIfAborted();check.phase=link.host+' · '+phase;},{signal,fresh}),signal);if(check.cancelled)break;if(Number(candidate.duration)>0&&Number(candidate.duration)<60)throw new Error('Materiał trwa krócej niż minutę. Pomijam krótką wstawkę.');const playbackId=rememberPlayback(userId,candidate,{sourceId:effectiveSource.id,itemId:item.id,pageURL,link:providerLink,selectedLinkId:link.id,episode});check.ready.push({id:link.id,host:link.host,quality:candidate.quality||link.quality,version:link.version,kind:candidate.kind,playbackId});success=true;}
  }catch(error){if(check.cancelled)break;check.lastError=error.name==='TimeoutError'?'Hosting nie odpowiedział w wyznaczonym czasie.':/Timeout|locator|page\.|Call log/i.test(error.message)?'Portal nie otworzył hostingu. Sprawdź sesję lub wybierz inny link.':String(error.message).replace(/https?:\/\/\S+/g,'[adres źródła]').slice(0,180);check.failures.push({host:link.host,message:check.lastError,status:error.status,retryAfter:error.retryAfter,scope:error.scope});if(error.requiresAction){check.requiresAction=true;}if(error.status===429&&error.scope!=='hosting'){check.blocked=true;check.retryAfter=error.retryAfter;}}check.checked++;if(check.blocked||check.requiresAction||(success&&stopOnSuccess))break;
    if(check.checked<Math.min(links.length,30)){check.phase='Krótka przerwa przed kolejnym hostingiem…';await pause(pauseMs,undefined,{signal:runSignal});}
  }check.status=check.blocked?'blocked':check.requiresAction?'action_required':check.cancelled?'cancelled':'done';})().catch(()=>{if(check.cancelled){check.status='cancelled';return;}check.status='error';check.lastError='Przekroczono czas przygotowania. Wybierz hosting ręcznie lub ponów próbę.';}).finally(()=>checkControllers.delete(id));return id;
}
export function checkFor(id,userId) {const check=checks.get(id);if(!check||check.userId!==userId)throw Object.assign(new Error('Nie znaleziono sprawdzania.'),{status:404});return check;}
export function rewritePlaylist(text,base,makeURL) {
  return text.split(/\r?\n/).map(line=>{if(!line.trim())return line;if(line.startsWith('#'))return line.replace(/URI="([^"]+)"/g,(_,path)=>`URI="${makeURL(new URL(path,base).href)}"`);return makeURL(new URL(line.trim(),base).href);}).join('\n');
}
const internalExports=new Map();
export async function probeMedia(candidate,{signal}={}) {
  const token=uid();internalExports.set(token,{candidate:{...candidate,assets:new Map()},expires:now()+60000});
  try{return await new Promise((resolve,reject)=>{
    const input=`http://127.0.0.1:${process.env.PORT||8090}/internal/export/${token}/media`;
    const child=spawn('ffprobe',['-v','error','-read_intervals','%+1','-show_frames','-show_entries','stream=codec_type,codec_name,width,height:format=duration,size,format_name:frame=width,height','-of','json',...(candidate.kind==='hls'?['-allowed_extensions','ALL','-protocol_whitelist','http,tcp,crypto']:[]),input],{windowsHide:true,stdio:['ignore','pipe','pipe'],signal});let output='',diagnostic='';child.stderr.on('data',c=>{if(process.env.NODE_ENV==='test')diagnostic+=String(c).replace(/https?:\/\/\S+/g,'[adres]');});child.stdout.on('data',c=>{output+=c;if(output.length>100000)child.kill();});child.stderr.resume();const timer=setTimeout(()=>child.kill(),20000);
    child.once('error',()=>{clearTimeout(timer);reject(new Error('Weryfikator wideo jest niedostępny.'));});child.once('close',code=>{clearTimeout(timer);try{const meta=JSON.parse(output),video=meta.streams?.find(s=>s.codec_type==='video');const audio=meta.streams?.find(s=>s.codec_type==='audio');if(code!==0||!video||video.width<160||!meta.frames?.some(f=>f.width>0)||!['h264','vp8','vp9','av1'].includes(video.codec_name)||(audio&&!['aac','mp3','opus','vorbis'].includes(audio.codec_name)))throw new Error();if(/\.(mkv|avi)(?:[?#]|$)/i.test(candidate.url))throw new Error();resolve({...meta.format,...video,audioCodec:audio?.codec_name||'none'});}catch{reject(new Error('Źródło nie udostępnia wideo zgodnego z odtwarzaczem przeglądarki.'+(process.env.NODE_ENV==='test'?' '+diagnostic.slice(0,400)+' '+output.slice(0,400):'')));}});
  });}finally{internalExports.delete(token);}
}
export async function relay(candidate,req,res,{prefix='',assetId}={}) {
  if(candidate.kind==='remote')return relayRemote(candidate,req,res);
  const url=assetId?candidate.assets.get(assetId):candidate.url;if(!url)throw Object.assign(new Error('Nie znaleziono segmentu.'),{status:404});
  const controller=new AbortController();candidate.controllers||=new Set();candidate.controllers.add(controller);res.on('close',()=>{controller.abort();candidate.controllers.delete(controller);});
  const headers={...candidate.headers};if(req.headers.range)headers.Range=req.headers.range;
  if(new URL(url).origin!==new URL(candidate.url).origin)for(const name of Object.keys(headers))if(/cookie|authorization|plex-token/i.test(name))delete headers[name];
  const upstream=await safeRequest(url,{headers,allowedOrigins:candidate.allowedOrigins,signal:controller.signal});
  if(![200,206].includes(upstream.statusCode)){upstream.destroy();throw Object.assign(new Error('Hosting odmówił odtwarzania. Sprawdź źródło ponownie.'),{status:502});}
  const type=String(upstream.headers['content-type']||'');
  if(candidate.kind==='hls'&&(type.includes('mpegurl')||/\.m3u8(?:[?#]|$)/i.test(url))) {
    const text=(await readBounded(upstream,2*1024*1024)).toString();if(!text.trimStart().startsWith('#EXTM3U'))throw new Error('Nieprawidłowa playlista.');
    const playlist=rewritePlaylist(text,upstream.finalURL,remote=>{networkURL(remote);let id=[...candidate.assets.entries()].find(([,v])=>v===remote)?.[0];if(!id){if(candidate.assets.size>40000)throw new Error('Za wiele segmentów.');const extension=new URL(remote).pathname.match(/\.(m3u8|ts|m4s|mp4|aac|key)$/i)?.[1]||'ts';id=randomBytes(12).toString('hex')+'.'+extension;candidate.assets.set(id,remote);}return `${prefix}/asset/${id}`;});
    res.type('application/vnd.apple.mpegurl').send(playlist);return;
  }
  res.status(upstream.statusCode);for(const name of ['content-type','content-length','content-range','accept-ranges'])if(upstream.headers[name])res.set(name,String(upstream.headers[name]));await pipeline(upstream,res).catch(e=>{if(!controller.signal.aborted)throw e;});
}
async function relayRemote(candidate,req,res) {
  const source=getSource(candidate.sourceId,candidate.userId);const remote=await configuredRemote(source.type,{url:source.url,...source.credentials},source.credentials);const path=safePath(candidate.url.replace(/^remote:/,''));
  const size=candidate.bytes;let offset=0,count=size;const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');if(match&&size){offset=Number(match[1]);const end=match[2]?Math.min(Number(match[2]),size-1):size-1;if(offset>=size||end<offset){res.status(416).set('Content-Range',`bytes */${size}`).end();return;}count=end-offset+1;res.status(206).set('Content-Range',`bytes ${offset}-${end}/${size}`);}
  res.type(/\.webm$/i.test(path)?'video/webm':'video/mp4');if(size)res.set('Content-Length',String(count)).set('Accept-Ranges','bytes');const args=['cat',remote.base+'/'+path];if(offset)args.push('--offset',String(offset));if(count)args.push('--count',String(count));const child=spawn('rclone',args,{env:remote.env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stderr.resume();res.on('close',()=>child.kill());child.on('error',()=>res.destroy());await pipeline(child.stdout,res).catch(()=>child.kill());
}
export function serveInternal(req,res) {const entry=internalExports.get(req.params.token);if(!entry||entry.expires<now()||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return res.status(404).end();return relay(entry.candidate,req,res,{prefix:`http://127.0.0.1:${process.env.PORT||8090}/internal/export/${req.params.token}`,assetId:req.params.asset});}
export function exportProcess(candidate) {
  const token=uid();internalExports.set(token,{candidate,expires:now()+2*60*60*1000});
  // All media is piped. There is deliberately no local output path.
  const input=`http://127.0.0.1:${process.env.PORT||8090}/internal/export/${token}/media`;
  const child=spawn('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-protocol_whitelist','http,tcp,crypto',...(candidate.kind==='hls'?['-allowed_extensions','ALL']:[]),'-analyzeduration','30000000','-probesize','32000000','-i',input,'-map','0:v:0','-map','0:a:0?','-c','copy',...(candidate.kind==='hls'&&(candidate.audioCodec||'aac')==='aac'?['-bsf:a','aac_adtstoasc']:[]),'-movflags','frag_keyframe+empty_moov','-f','mp4','pipe:1'],{windowsHide:true,stdio:['ignore','pipe','pipe']});child.stderr.resume();child.once('exit',()=>internalExports.delete(token));return child;
}
function successfulExit(child) {return new Promise((resolve,reject)=>{child.once('error',()=>reject(new Error('Narzędzie zapisu jest niedostępne.')));child.once('close',code=>code===0?resolve():reject(new Error('Zapis wideo został przerwany.')));});}
export async function exportToDevice(candidate,req,res,filename) {
  res.set('Content-Disposition',`attachment; filename="video.mp4"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  if(candidate.kind!=='hls')return relay(candidate,req,res,{prefix:`/api/playback/${candidate.id}`});
  res.type('video/mp4');const child=exportProcess(candidate),exit=successfulExit(child);res.on('close',()=>{if(!res.writableFinished)child.kill();});const timer=setTimeout(()=>child.kill(),2*60*60*1000);try{await Promise.all([pipeline(child.stdout,res,{end:false}),exit]);res.end();}catch(error){child.kill();res.destroy();throw error;}finally{clearTimeout(timer);}
}
export function downloadFor(id,userId) {const row=db.prepare('SELECT * FROM downloads WHERE id=? AND user_id=?').get(id,userId);if(!row)throw Object.assign(new Error('Nie znaleziono pobierania.'),{status:404});return {...JSON.parse(row.value),id:row.id,status:row.status,updated:row.updated};}
export function updateDownload(job,status,extra={}) {const value={...job,...extra};delete value.status;delete value.updated;db.prepare('UPDATE downloads SET value=?,status=?,updated=? WHERE id=? AND user_id=?').run(JSON.stringify(value),status,now(),job.id,job.userId);return {...value,status};}
export async function freshPlayback(job) {try{return playbackFor(job.playbackId,job.userId);}catch{}const source=getSource(job.sourceId,job.userId);if(['filman','vider'].includes(source.type))throw Object.assign(new Error('Sesja hostingu wygasła. Sprawdź wybrany hosting ręcznie i ponownie dodaj zapis do kolejki.'),{status:410});const candidate=await resolveLink(source,job.pageURL,job.link);const id=rememberPlayback(job.userId,candidate,{sourceId:job.sourceId});return playbackFor(id,job.userId);}
let running=false;export const activeDownloads=new Map();const active=activeDownloads;
export function cancelDownload(id,userId) {const job=downloadFor(id,userId);active.get(id)?.();return updateDownload(job,'cancelled');}
export async function cloudQueue() {
  if(running)return;running=true;
  try {const rows=db.prepare("SELECT * FROM downloads WHERE status IN ('queued','retry') ORDER BY updated").all();for(const row of rows){const job={...JSON.parse(row.value),id:row.id,userId:row.user_id};if(job.destination==='device'||job.retryAfter>now()||!downloadActive(job))continue;let producer,uploader,timeout;const controller=new AbortController();
    try {
      const dest=getDestination(job.destination,job.userId),candidate=await freshPlayback(job);
      const filename=job.filename.replace(/\.(mp4|webm)$/i,'')+' - '+job.id.slice(0,8)+'.mp4';
      let remote;
      if(dest.type!=='webdav'){
        remote=await configuredRemote(dest.type,dest.config,dest.credentials);
        const features=JSON.parse(await capture('rclone',['backend','features',remote.base],remote.env));
        // rcat otherwise falls back to a temporary file. Never allow that fallback.
        if(!features.Features?.PutStream)throw new Error('Magazyn nie obsługuje zapisu strumieniowego bez pliku tymczasowego.');
      }
      if(!downloadActive(job))continue;
      producer=exportProcess(candidate);const producerExit=successfulExit(producer);producerExit.catch(()=>{});
      active.set(job.id,()=>{controller.abort();producer.kill();uploader?.kill();});
      updateDownload(job,'downloading',{bytes:0});let bytes=0,last=0;
      const count=chunk=>{bytes+=chunk.length;if(now()-last>1500){last=now();if(downloadActive(job))updateDownload(job,'downloading',{bytes});}};
      timeout=setTimeout(()=>{controller.abort();producer.kill();uploader?.kill();},2*60*60*1000);
      if(dest.type==='webdav'){
        const base=new URL(dest.config.url);if(!base.pathname.endsWith('/'))base.pathname+='/';
        const path=[dest.config.prefix,filename].filter(Boolean).join('/');safePath(path);
        const target=new URL(path.split('/').map(encodeURIComponent).join('/'),base);
        await Promise.all([uploadStream(target.href,producer.stdout,{headers:{...basicHeaders(dest.credentials),'Content-Type':'video/mp4','If-None-Match':'*'},signal:controller.signal,onChunk:count}),producerExit]);
      }else{
        uploader=spawn('rclone',['rcat',remote.base+'/'+safePath(filename),'--streaming-upload-cutoff','0','--buffer-size','0','--retries','1','--low-level-retries','3','--s3-upload-concurrency','1','--s3-chunk-size','5M'],{env:remote.env,windowsHide:true,stdio:['pipe','pipe','pipe']});uploader.stdout.resume();uploader.stderr.resume();producer.stdout.on('data',count);
        await Promise.all([pipeline(producer.stdout,uploader.stdin),producerExit,successfulExit(uploader)]);
      }
      if(downloadActive(job))updateDownload(job,'ready',{bytes,remotePath:filename});
    }catch(error) {controller.abort();producer?.kill();uploader?.kill();if(downloadActive(job)){const attempts=(job.attempts||0)+1;updateDownload(job,error.status===410?'paused':attempts<3?'retry':'failed',{attempts,retryAfter:now()+attempts*30000,error:error.status===410?error.message:'Pobieranie lub zapis strumieniowy zostało przerwane. Sprawdź źródło i magazyn.'});}}finally{clearTimeout(timeout);active.delete(job.id);}
  }}finally{running=false;}
}
db.prepare("UPDATE downloads SET status='retry' WHERE status='downloading' AND value NOT LIKE '%\"destination\":\"device\"%'").run();
db.prepare("UPDATE downloads SET status='paused' WHERE status='downloading' AND value LIKE '%\"destination\":\"device\"%'").run();
export const mediaTimer=setInterval(()=>{for(const [id,p]of playbacks)if(p.expires<now())playbacks.delete(id);for(const [id,c]of checks)if(c.expires<now())checks.delete(id);cloudQueue().catch(()=>{});},5000);mediaTimer.unref();
