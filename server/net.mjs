import http from 'node:http';
import https from 'node:https';
import { pipeline } from 'node:stream/promises';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export const adHosts=['doubleclick.net','googlesyndication.com','googleadservices.com','popads.net','popcash.net','exoclick.com','adskeeper.com','adsterra.com','realsrv.com','tsyndicate.com','trafficjunky.net','juicyads.com'];
export function isAdvertisement(address) { try { const u=new URL(address); return adHosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)) || /\/(?:ads|vast|vpaid|preroll|popunder)(?:\/|\.|$)/i.test(u.pathname) || /(^|\.)example\.(?:com|org|net)$/.test(u.hostname); } catch {return true;} }
export function publicAddress(address) { try { let ip=ipaddr.parse(address); if(ip.kind()==='ipv6' && ip.isIPv4MappedAddress()) ip=ip.toIPv4Address(); return ip.range()==='unicast'; } catch { return false; } }
export function networkURL(value) { const u=new URL(value); if(!['http:','https:'].includes(u.protocol)||u.username||u.password) throw new Error('Wymagany adres HTTP/HTTPS bez hasła w adresie.'); return u; }
export function sameSourceURL(value,base) { const u=networkURL(value); if(u.origin!==networkURL(base).origin) throw new Error('Adres wykracza poza wybrane źródło.'); return u.href; }
export async function safeRequest(value,{headers={},method='GET',allowedOrigins=[],signal,redirects=4}={}) {
  const u=networkURL(value); if(isAdvertisement(u.href)) throw new Error('Odrzucono reklamę lub przykładowy adres.');
  const privateAllowed=allowedOrigins.includes(u.origin) || (process.env.FIXTURE_ORIGIN && u.origin===process.env.FIXTURE_ORIGIN);
  const addresses=await lookup(u.hostname.replace(/^\[|\]$/g,''),{all:true});
  if(!addresses.length || (!privateAllowed && addresses.some(a=>!publicAddress(a.address)))) throw new Error('Adres wewnętrzny nie jest skonfigurowanym źródłem.');
  const target=addresses[0];
  const response=await new Promise((resolve,reject)=>{
    const request=(u.protocol==='https:'?https:http).request(u,{method,headers,signal,lookup:(_host,options,callback)=>options.all?callback(null,[target]):callback(null,target.address,target.family)},resolve);
    request.setTimeout(25000,()=>request.destroy(new Error('Źródło nie odpowiada.'))); request.on('error',reject); request.end();
  });
  if(response.statusCode>=300 && response.statusCode<400 && response.headers.location) {
    response.resume(); if(!redirects) throw new Error('Zbyt wiele przekierowań.'); const next=new URL(response.headers.location,u);
    // Cookies, Basic auth and Plex tokens never cross into another origin.
    const nextHeaders={...headers}; if(next.origin!==u.origin) for(const name of Object.keys(nextHeaders)) if(/authorization|cookie|plex-token/i.test(name)) delete nextHeaders[name];
    return safeRequest(next.href,{headers:nextHeaders,method,allowedOrigins,signal,redirects:redirects-1});
  }
  response.finalURL=u.href; return response;
}
export async function readBounded(stream,max=8*1024*1024) { const chunks=[]; let size=0; for await(const chunk of stream) { size+=chunk.length; if(size>max) {stream.destroy();throw new Error('Odpowiedź źródła jest zbyt duża.');} chunks.push(chunk); } return Buffer.concat(chunks); }
export async function textRequest(url,options={}) { const response=await safeRequest(url,options); if(response.statusCode!==200){response.destroy();throw new Error(`Źródło zwróciło HTTP ${response.statusCode}.`);} return (await readBounded(response)).toString('utf8'); }
export async function uploadStream(value,body,{headers={},signal,onChunk=()=>{}}={}) {
  const u=networkURL(value),addresses=await lookup(u.hostname.replace(/^\[|\]$/g,''),{all:true});
  if(isAdvertisement(u.href)||!addresses.length)throw new Error('Nieprawidłowy magazyn.');
  const target=addresses[0];let upload;
  const response=await new Promise((resolve,reject)=>{
    const request=(u.protocol==='https:'?https:http).request(u,{method:'PUT',headers,signal,lookup:(_host,options,callback)=>options.all?callback(null,[target]):callback(null,target.address,target.family)},resolve);
    request.setTimeout(30000,()=>request.destroy(new Error('Magazyn nie odpowiada.')));request.on('error',reject);
    body.on('data',onChunk);upload=pipeline(body,request);upload.catch(reject);
  });
  if(![200,201,204].includes(response.statusCode)){response.destroy();body.destroy();throw new Error('Magazyn odmówił zapisu.');}
  await Promise.all([upload,readBounded(response,65536)]);
}
export function basicHeaders(credentials={}) { return credentials.username ? {Authorization:'Basic '+Buffer.from(credentials.username+':'+(credentials.password||'')).toString('base64')} : {}; }
export async function verifyMedia(candidate,{signal}={}) {
  const response=await safeRequest(candidate.url,{headers:{...candidate.headers,Range:'bytes=0-4095'},allowedOrigins:candidate.allowedOrigins,signal});
  if(![200,206].includes(response.statusCode)) {response.destroy();throw new Error('Strumień jest niedostępny.');}
  let first=Buffer.alloc(0); for await(const chunk of response) {first=Buffer.concat([first,chunk]);if(first.length>=1024 || candidate.kind==='hls'){break;}}
  response.destroy();
  if(candidate.kind==='hls') { if(!first.toString().trimStart().startsWith('#EXTM3U')) throw new Error('Adres nie zawiera strumienia HLS.'); }
  else if(!/video\/|application\/octet-stream/i.test(String(response.headers['content-type'])) && !first.subarray(0,64).includes(Buffer.from('ftyp'))) throw new Error('Adres nie zawiera wideo.');
  return candidate;
}
