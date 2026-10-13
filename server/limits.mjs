import { now,db } from './store.mjs';
db.exec('CREATE TABLE IF NOT EXISTS source_limits(id TEXT PRIMARY KEY,next_check INTEGER NOT NULL DEFAULT 0,blocked_until INTEGER NOT NULL DEFAULT 0)');
export const limits=new Map(db.prepare('SELECT * FROM source_limits').all().map(r=>[r.id,{nextCheck:r.next_check,blockedUntil:r.blocked_until}]));
const persist=(id,value)=>{limits.set(id,value);db.prepare('INSERT INTO source_limits VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET next_check=excluded.next_check,blocked_until=excluded.blocked_until').run(id,value.nextCheck||0,value.blockedUntil||0);};
export function assertSourceAvailable(id) {const limit=limits.get(id);if(limit?.blockedUntil>now())throw Object.assign(new Error(`Portal wstrzymał dostęp. Spróbuj za ${Math.ceil((limit.blockedUntil-now())/60000)} min.`),{status:429,retryAfter:limit.blockedUntil});}
export function parseRetryAfter(value) {
  if(typeof value!=='string'||!value.trim())return undefined;
  const raw=value.trim();
  if(/^\d+(?:\.\d+)?$/.test(raw)){const seconds=Number(raw);return Number.isFinite(seconds)&&seconds>0?seconds*1000:undefined;}
  const date=Date.parse(raw),duration=date-now();return Number.isFinite(date)&&duration>0?duration:undefined;
}
export function blockSource(id,milliseconds) {
  if(!Number.isFinite(milliseconds)||milliseconds<=0)return undefined;
  const until=now()+milliseconds,limit=limits.get(id)||{};
  persist(id,{...limit,blockedUntil:until});return until;
}
