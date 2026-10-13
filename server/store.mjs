import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv, createHash } from 'node:crypto';

export const dataDir = resolve(process.env.DATA_DIR || './data');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const keyPath = resolve(dataDir, 'credentials.key');
if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
const key = readFileSync(keyPath);
export const db = new DatabaseSync(resolve(dataDir, 'cinema.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password TEXT NOT NULL, role TEXT NOT NULL, initial INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings(user_id TEXT PRIMARY KEY REFERENCES users(id), value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, type TEXT NOT NULL, url TEXT NOT NULL, secret TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), value TEXT NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS favorites(user_id TEXT NOT NULL REFERENCES users(id), item_id TEXT NOT NULL REFERENCES items(id), kind TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(user_id,item_id,kind));
CREATE TABLE IF NOT EXISTS progress(user_id TEXT NOT NULL REFERENCES users(id), item_id TEXT NOT NULL REFERENCES items(id), episode TEXT NOT NULL DEFAULT '', value TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(user_id,item_id,episode));
CREATE TABLE IF NOT EXISTS destinations(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, type TEXT NOT NULL, config TEXT NOT NULL, secret TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS downloads(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), value TEXT NOT NULL, status TEXT NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS player_routes(source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE, fingerprint TEXT NOT NULL, secret TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(source_id,fingerprint));
CREATE TABLE IF NOT EXISTS recovery_codes(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, code_hash TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(user_id,code_hash));
`);
// Existing accounts keep their source-specific options across upgrades.
if (!db.prepare('PRAGMA table_info(sources)').all().some(column=>column.name==='options')) {
  db.exec("ALTER TABLE sources ADD COLUMN options TEXT NOT NULL DEFAULT '{}'");
}
export const now = () => Date.now();
export const uid = () => randomBytes(16).toString('hex');
export const hashId = value => createHash('sha256').update(value).digest('hex').slice(0,32);
export function passwordHash(value) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(value,salt,64).toString('hex')}`; }
export function passwordMatches(value, saved) { try { const [salt,hash] = saved.split(':'); return timingSafeEqual(scryptSync(value,salt,64),Buffer.from(hash,'hex')); } catch { return false; } }
export function encrypt(value) { const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm',key,iv); const result = Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]); return Buffer.concat([iv,c.getAuthTag(),result]).toString('base64'); }
export function decrypt(value) { const b=Buffer.from(value,'base64'); const c=createDecipheriv('aes-256-gcm',key,b.subarray(0,12)); c.setAuthTag(b.subarray(12,28)); return JSON.parse(Buffer.concat([c.update(b.subarray(28)),c.final()]).toString()); }
export function playerRoute(sourceId,pageURL,link,address) {
  const fingerprint=hashId(JSON.stringify([pageURL,link.host,link.version,link.quality]));
  db.prepare('DELETE FROM player_routes WHERE expires<?').run(now());
  if(address){db.prepare('INSERT INTO player_routes VALUES(?,?,?,?) ON CONFLICT(source_id,fingerprint) DO UPDATE SET secret=excluded.secret,expires=excluded.expires').run(sourceId,fingerprint,encrypt({address}),now()+10*60000);return address;}
  const row=db.prepare('SELECT secret FROM player_routes WHERE source_id=? AND fingerprint=? AND expires>?').get(sourceId,fingerprint,now());
  return row?decrypt(row.secret).address:undefined;
}
export function addUser(username, password, role='user', initial=false) {
  const id=uid(); db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id,username,passwordHash(password),role,initial?1:0,now());
  db.prepare('INSERT INTO sources(id,user_id,name,type,url,secret,enabled) VALUES(?,?,?,?,?,?,1)').run(uid(),id,'Filman','filman','https://filman.cc/',encrypt({})); return {id,username,role,initial};
}
if (!db.prepare('SELECT id FROM users LIMIT 1').get()) addUser('admin',process.env.INITIAL_ADMIN_PASSWORD || 'admin','admin',!process.env.INITIAL_ADMIN_PASSWORD);
export const defaults={theme:'violet',style:'cinematic',sounds:true,soundStyle:'soft',autoplay:false,autoFallback:true,preferredVersion:'Lektor',preferredHosts:['voe.sx','',''],defaultSources:[],defaultDestination:'device'};
export function getSettings(userId) { const row=db.prepare('SELECT value FROM settings WHERE user_id=?').get(userId); return {...defaults,...(row?JSON.parse(row.value):{})}; }
export function saveSettings(userId,value) { db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET value=excluded.value').run(userId,JSON.stringify(value)); }
export function getSource(id,userId) { const row=db.prepare('SELECT * FROM sources WHERE id=? AND user_id=?').get(id,userId); if(!row) throw Object.assign(new Error('Nie znaleziono źródła.'),{status:404}); return {...row,options:JSON.parse(row.options||'{}'),credentials:decrypt(row.secret)}; }
export function deleteSource(id,userId) {
  getSource(id,userId);
  db.exec('BEGIN IMMEDIATE');
  try {
    for(const table of ['favorites','progress'])db.prepare(`DELETE FROM ${table} WHERE item_id IN (SELECT id FROM items WHERE source_id=?)`).run(id);
    db.prepare('DELETE FROM items WHERE source_id=?').run(id);
    db.prepare("DELETE FROM downloads WHERE user_id=? AND json_extract(value,'$.sourceId')=?").run(userId,id);
    db.prepare('DELETE FROM sources WHERE id=? AND user_id=?').run(id,userId);
    const settings=getSettings(userId);
    if(settings.defaultSources.includes(id))saveSettings(userId,{...settings,defaultSources:settings.defaultSources.filter(value=>value!==id)});
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}
export function saveItem(sourceId,item) { const id=hashId(sourceId+':'+item.url);const old=db.prepare('SELECT value FROM items WHERE id=?').get(id);const previous=old?JSON.parse(old.value):{};const result={...previous,...item,id,sourceId};for(const key of ['title','poster','description','year','rating','imdb'])if((result[key]===null||result[key]===undefined||result[key]==='')&&previous[key])result[key]=previous[key]; db.prepare('INSERT INTO items VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated=excluded.updated').run(id,sourceId,JSON.stringify(result),now()); return result; }
export function getItem(id,userId) { const row=db.prepare('SELECT i.* FROM items i JOIN sources s ON s.id=i.source_id WHERE i.id=? AND s.user_id=?').get(id,userId); if(!row) throw Object.assign(new Error('Nie znaleziono pozycji.'),{status:404}); return JSON.parse(row.value); }
export function decorateItem(item,userId) { const favorites=db.prepare('SELECT kind FROM favorites WHERE user_id=? AND item_id=?').all(userId,item.id); const progress=db.prepare('SELECT value FROM progress WHERE user_id=? AND item_id=? ORDER BY updated DESC LIMIT 1').get(userId,item.id); return {...item,favorite:favorites.some(f=>f.kind==='favorite'),watchlist:favorites.some(f=>f.kind==='watchlist'),progress:progress?JSON.parse(progress.value):null}; }
export function listSources(userId) { return db.prepare('SELECT id,name,type,url,enabled,secret,options FROM sources WHERE user_id=? ORDER BY rowid').all(userId).map(({secret,options,...row})=>({...row,options:JSON.parse(options||'{}'),enabled:!!row.enabled,hasCredentials:Object.keys(decrypt(secret)).length>0})); }
export function getDestination(id,userId) { const row=db.prepare('SELECT * FROM destinations WHERE id=? AND user_id=?').get(id,userId); if(!row) throw Object.assign(new Error('Nie znaleziono magazynu.'),{status:404}); return {...row,config:JSON.parse(row.config),credentials:decrypt(row.secret)}; }
export function filenameFor(item,episode,quality='') { const label=[item.title,episode?`S${String(episode.season).padStart(2,'0')}E${String(episode.number).padStart(2,'0')}`:'',episode?.title || '',quality].filter(Boolean).join(' - ').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,180); return (label||'Film')+'.mp4'; }
