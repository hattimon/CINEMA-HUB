import { spawn } from 'node:child_process';
import { networkURL } from './net.mjs';
export function remoteConfig(type,config,credentials) {
  const env={...process.env};const prefix='RCLONE_CONFIG_CINEMA_';const set=(key,value)=>{if(value!==undefined&&value!=='')env[prefix+key]=String(value);};
  if(type==='webdav') {set('TYPE','webdav');set('URL',networkURL(config.url).href);set('VENDOR','other');set('USER',credentials.username||'');}
  else if(type==='s3') {set('TYPE','s3');set('PROVIDER','Other');set('ENDPOINT',networkURL(config.url).href);set('ACCESS_KEY_ID',credentials.accessKey);set('SECRET_ACCESS_KEY',credentials.secretKey);set('REGION',config.region||'us-east-1');set('FORCE_PATH_STYLE','true');}
  else if(type==='ftp') {const u=new URL(config.url);if(u.protocol!=='ftp:'&&u.protocol!=='ftps:')throw new Error('Wymagany adres FTP/FTPS.');set('TYPE','ftp');set('HOST',u.hostname);set('PORT',u.port||'21');set('USER',credentials.username||'anonymous');set('TLS',u.protocol==='ftps:'?'true':'false');}
  else throw new Error('Nieobsługiwany typ magazynu.');
  return {env,base:'cinema:'+String(type==='s3'?[config.bucket,config.prefix].filter(Boolean).join('/'):config.prefix||'').replace(/^\/+|\/+$/g,'')};
}
export async function configuredRemote(type,config,credentials) {
  const result=remoteConfig(type,config,credentials);
  if(credentials.password){const obscured=await capture('rclone',['obscure',credentials.password],result.env);result.env.RCLONE_CONFIG_CINEMA_PASS=obscured.trim();}return result;
}
export function capture(command,args,env=process.env,max=8*1024*1024) {
  return new Promise((resolve,reject)=>{const child=spawn(command,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});const chunks=[];let length=0;const timer=setTimeout(()=>{child.kill();reject(new Error('Magazyn nie odpowiada.'));},45000);child.stdout.on('data',chunk=>{length+=chunk.length;if(length>max){child.kill();reject(new Error('Lista plików jest za duża. Zawęź folder.'));}else chunks.push(chunk);});child.stderr.resume();child.on('error',()=>{clearTimeout(timer);reject(new Error('Narzędzie magazynu jest niedostępne.'));});child.on('exit',code=>{clearTimeout(timer);if(code===0)resolve(Buffer.concat(chunks).toString());else reject(new Error('Magazyn odrzucił połączenie. Sprawdź adres i dane logowania.'));});});
}
export function safePath(value='') {const path=String(value).replace(/\\/g,'/');if(path.startsWith('/')||path.split('/').some(p=>p==='..')||/[\x00-\x1f]/.test(path))throw new Error('Nieprawidłowa ścieżka.');return path;}
export async function remoteList(source,folder='') {
  const remote=await configuredRemote(source.type,{url:source.url,...source.credentials},source.credentials);const path=safePath(folder);const name=remote.base+(path?'/'+path:'');const list=JSON.parse(await capture('rclone',['lsjson',name,'--no-modtime','--no-mimetype'],remote.env));return {remote,list:list.slice(0,500)};
}
