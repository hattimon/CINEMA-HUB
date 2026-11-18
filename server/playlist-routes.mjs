import { z } from 'zod';
import { db, uid, now, getItem } from './store.mjs';

let playlistSchemaReady = false;

// The DCC preflight compares all tables during startup. Initialize playlist
// storage on the first authenticated playlist request and upgrade preview data in place.
function ensurePlaylistSchema() {
  if (playlistSchemaReady) return;
  tx(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS playlists(
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', mode TEXT NOT NULL DEFAULT 'once',
        revision INTEGER NOT NULL DEFAULT 1, cursor_id TEXT, shuffle_remaining TEXT NOT NULL DEFAULT '[]',
        created INTEGER NOT NULL, updated INTEGER NOT NULL, shuffle_history TEXT NOT NULL DEFAULT '[]');
      CREATE INDEX IF NOT EXISTS playlists_owner ON playlists(user_id,updated DESC);
      CREATE TABLE IF NOT EXISTS playlist_entries(
        id TEXT PRIMARY KEY, playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        position INTEGER NOT NULL, media_item_id TEXT, episode_url TEXT,
        season INTEGER, episode INTEGER, label TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}',
        completed INTEGER NOT NULL DEFAULT 0, playback_position REAL NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS playlist_entries_order ON playlist_entries(playlist_id,position);
    `);
    const lists = db.prepare('PRAGMA table_info(playlists)').all();
    if (!lists.some(column => column.name === 'shuffle_history')) {
      db.exec("ALTER TABLE playlists ADD COLUMN shuffle_history TEXT NOT NULL DEFAULT '[]'");
    }
    const entries = db.prepare('PRAGMA table_info(playlist_entries)').all();
    if (!entries.some(column => column.name === 'completed')) {
      db.exec('ALTER TABLE playlist_entries ADD COLUMN completed INTEGER NOT NULL DEFAULT 0');
    }
    if (!entries.some(column => column.name === 'playback_position')) {
      db.exec('ALTER TABLE playlist_entries ADD COLUMN playback_position REAL NOT NULL DEFAULT 0');
    }
  });
  playlistSchemaReady = true;
}
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const mode=z.enum(['once','repeat','shuffle']);
const entrySchema=z.object({
  itemId:z.string().max(128).nullable().optional(),
  episodeUrl:z.string().max(2048).nullable().optional(),
  season:z.number().int().min(0).max(999).nullable().optional(),
  episode:z.number().int().min(0).max(999).nullable().optional(),
  label:z.string().max(500).optional(),
  metadata:z.record(z.unknown()).optional(),completed:z.boolean().optional()
});
function playlist(id,userId){
  const row=db.prepare('SELECT * FROM playlists WHERE id=? AND user_id=?').get(id,userId);
  if(!row)throw fail('Nie znaleziono playlisty.',404);
  return row;
}
function entries(id,userId){
  playlist(id,userId);
  return db.prepare('SELECT * FROM playlist_entries WHERE playlist_id=? ORDER BY position,id').all(id).map(row=>{
    let media=null;
    if(row.media_item_id)try{
      const item=getItem(row.media_item_id,userId);
      media={id:item.id,title:item.title,kind:item.kind,sourceId:item.sourceId,poster:item.poster};
    }catch{/* The source may have been removed. */}
    return {id:row.id,position:row.position,itemId:row.media_item_id||null,episodeUrl:row.episode_url,season:row.season,episode:row.episode,label:row.label,metadata:JSON.parse(row.metadata),completed:!!row.completed,playbackPosition:row.playback_position,media};
  });
}
const brief=row=>{
  const stats=db.prepare('SELECT COUNT(*) itemCount,COALESCE(SUM(completed),0) completedCount FROM playlist_entries WHERE playlist_id=?').get(row.id);
  return {id:row.id,name:row.name,description:row.description,mode:row.mode,revision:row.revision,cursorId:row.cursor_id,shuffleRemaining:JSON.parse(row.shuffle_remaining),shuffleHistory:JSON.parse(row.shuffle_history),itemCount:stats.itemCount,completedCount:stats.completedCount,created:row.created,updated:row.updated};
};
const full=(row,userId)=>({...brief(row),entries:entries(row.id,userId)});
function tx(fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
const bump=id=>db.prepare('UPDATE playlists SET revision=revision+1,updated=? WHERE id=?').run(now(),id);
function revision(row,value){if(value!==undefined&&value!==row.revision)throw fail('Playlista została zmieniona w innym oknie. Odśwież ją.',409);}
function insert(id,position,e){
  db.prepare('INSERT INTO playlist_entries(id,playlist_id,position,media_item_id,episode_url,season,episode,label,metadata,completed,playback_position) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(uid(),id,position,e.itemId||null,e.episodeUrl||null,e.season??null,e.episode??null,e.label||'',JSON.stringify(e.metadata||{}),e.completed?1:0,e.playbackPosition||0);
}
function csvRows(raw){
  raw=String(raw).replace(/^\uFEFF/,'');
  let commas=0,semicolons=0,inQuotes=false;
  for(let i=0;i<raw.length;i++){
    if(raw[i]==='"'){if(inQuotes&&raw[i+1]==='"')i++;else inQuotes=!inQuotes;}
    else if(!inQuotes&&(raw[i]==='\r'||raw[i]==='\n'))break;
    else if(!inQuotes&&raw[i]===',')commas++;
    else if(!inQuotes&&raw[i]===';')semicolons++;
  }
  const separator=semicolons>commas?';':',';
  const rows=[];let cols=[],field='',quoted=false;
  for(let i=0;i<raw.length;i++){
    const c=raw[i];
    if(c==='"'){if(quoted&&raw[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===separator&&!quoted){cols.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&raw[i+1]==='\n')i++;cols.push(field);if(cols.some(Boolean))rows.push(cols);cols=[];field='';}
    else field+=c;
  }
  if(quoted)throw fail('Niepoprawny plik CSV.');
  cols.push(field);if(cols.some(Boolean))rows.push(cols);
  const header=rows.shift()?.map(s=>s.trim().replace(/^\uFEFF/,''));
  if(!header?.length)throw fail('CSV nie zawiera nagłówków.');
  return rows.map(cols=>Object.fromEntries(header.map((key,i)=>[key,cols[i]||''])));
}
function normalizedImport(content,format){
  let parsed;
  if(format==='csv'){
    const records=csvRows(String(content)),header=records.find(r=>r.record_type==='playlist');
    parsed={name:header?.playlist_name||records[0]?.playlist_name,description:header?.playlist_description||records[0]?.playlist_description,mode:header?.playlist_mode||records[0]?.playlist_mode,entries:records.filter(r=>r.record_type!=='playlist').sort((a,b)=>{
      const order=value=>value===''||!Number.isFinite(Number(value))?Number.POSITIVE_INFINITY:Number(value);
      return order(a.order)-order(b.order);
    })};
  }
  else try{parsed=typeof content==='string'?JSON.parse(content):content;}catch{throw fail('Niepoprawny plik JSON.');}
  const list=Array.isArray(parsed)?parsed:parsed?.entries||parsed?.items;
  if(!Array.isArray(list)||list.length>5000)throw fail('Plik musi zawierać maksymalnie 5000 pozycji.');
  const parsedEntries=list.map((raw,index)=>{
    if(!raw||typeof raw!=='object')throw fail('Niepoprawna pozycja '+(index+1));
    let metadata=raw.metadata&&typeof raw.metadata==='object'?raw.metadata:raw;
    if(typeof raw.metadata_json==='string'&&raw.metadata_json.trim()){
      try{const decoded=JSON.parse(raw.metadata_json);if(!decoded||typeof decoded!=='object'||Array.isArray(decoded))throw Error();metadata=decoded;}
      catch{throw fail('Niepoprawne metadata_json w wierszu '+(index+1)+'.');}
    }
    const parseNumber=value=>value==null||value===''?null:Number(value);
    const season=parseNumber(raw.season??metadata.season),episode=parseNumber(raw.episode??metadata.episode);
    return entrySchema.extend({playbackPosition:z.number().finite().nonnegative().max(1e8)}).parse({
      itemId:raw.itemId||raw.item_id||raw.media?.id||null,episodeUrl:raw.episodeUrl||raw.episode_url||null,
      season:Number.isInteger(season)&&season>=0?season:null,
      episode:Number.isInteger(episode)&&episode>=0?episode:null,
      label:String(raw.label||raw.title||metadata.title||'Pozycja '+(index+1)).slice(0,500),
      metadata,completed:raw.completed===true||String(raw.completed).toLowerCase()==='true'||raw.completed==='1',
      playbackPosition:Math.max(0,Number(raw.playbackPosition??raw.playback_position)||0)
    });
  });
  return {name:String(parsed?.name||'Zaimportowana playlista').slice(0,120),description:String(parsed?.description||'').slice(0,2000),mode:mode.safeParse(parsed?.mode).success?parsed.mode:'once',entries:parsedEntries};
}
function mapImported(e,userId,catalog){
  if(e.itemId)try{getItem(e.itemId,userId);return e;}catch{
    e={...e,metadata:{...e.metadata,original_item_id:e.itemId},itemId:null};
  }
  const code=String(e.metadata?.series_code||'');
  const match=catalog.filter(item=>{
    const title=(item.title||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    if(code==='SG1')return /stargatesg1/.test(title);
    if(code==='SGA')return /stargateatlantis/.test(title);
    if(code==='FILM')return title===String(e.metadata.title||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    return title===String(e.metadata?.series||e.metadata?.title||e.label||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  });
  return match.length===1?{...e,itemId:match[0].id}:e;
}
export function installPlaylistRoutes(app,auth){
  const route='/api/playlists';
  app.use(route,auth,(_req,_res,next)=>{
    ensurePlaylistSchema();
    next();
  });
  app.get(route,(req,res)=>res.json(db.prepare('SELECT * FROM playlists WHERE user_id=? ORDER BY updated DESC').all(req.user.id).map(brief)));
  app.post(route,(req,res)=>{
    const body=z.object({name:z.string().trim().min(1).max(120),description:z.string().max(2000).default(''),mode:mode.default('once')}).parse(req.body);
    const id=uid(),timestamp=now();
    db.prepare('INSERT INTO playlists(id,user_id,name,description,mode,created,updated) VALUES(?,?,?,?,?,?,?)').run(id,req.user.id,body.name,body.description,body.mode,timestamp,timestamp);
    res.status(201).json(full(playlist(id,req.user.id),req.user.id));
  });
  app.get(route+'/:id',(req,res)=>res.json(full(playlist(req.params.id,req.user.id),req.user.id)));
  app.patch(route+'/:id',(req,res)=>{
    const b=z.object({name:z.string().trim().min(1).max(120).optional(),description:z.string().max(2000).optional(),mode:mode.optional(),revision:z.number().int().optional()}).parse(req.body);
    tx(()=>{const p=playlist(req.params.id,req.user.id);revision(p,b.revision);
      db.prepare('UPDATE playlists SET name=?,description=?,mode=?,shuffle_remaining=?,shuffle_history=? WHERE id=?').run(b.name??p.name,b.description??p.description,b.mode??p.mode,b.mode&&b.mode!==p.mode?'[]':p.shuffle_remaining,b.mode&&b.mode!==p.mode?'[]':p.shuffle_history,p.id);bump(p.id);
    });
    res.json(full(playlist(req.params.id,req.user.id),req.user.id));
  });
  app.delete(route+'/:id',(req,res)=>{playlist(req.params.id,req.user.id);db.prepare('DELETE FROM playlists WHERE id=? AND user_id=?').run(req.params.id,req.user.id);res.json({ok:true});});
  app.post(route+'/:id/restart',(req,res)=>{
    tx(()=>{
      const p=playlist(req.params.id,req.user.id);
      db.prepare('UPDATE playlist_entries SET completed=0,playback_position=0 WHERE playlist_id=?').run(p.id);
      db.prepare("UPDATE playlists SET cursor_id=NULL,shuffle_remaining='[]',shuffle_history='[]' WHERE id=?").run(p.id);
      bump(p.id);
    });
    res.json(full(playlist(req.params.id,req.user.id),req.user.id));
  });
  app.post(route+'/:id/duplicate',(req,res)=>{
    const id=tx(()=>{const p=playlist(req.params.id,req.user.id),id=uid(),timestamp=now();
      db.prepare('INSERT INTO playlists(id,user_id,name,description,mode,created,updated) VALUES(?,?,?,?,?,?,?)').run(id,req.user.id,(p.name+' (kopia)').slice(0,120),p.description,p.mode,timestamp,timestamp);
      entries(p.id,req.user.id).forEach((e,i)=>insert(id,i,e));return id;});
    res.status(201).json(full(playlist(id,req.user.id),req.user.id));
  });
  app.post(route+'/:id/entries',(req,res)=>{
    const b=z.object({entry:entrySchema,position:z.number().int().nonnegative().optional(),revision:z.number().int().optional()}).parse(req.body);
    if(b.entry.itemId)getItem(b.entry.itemId,req.user.id);
    tx(()=>{const p=playlist(req.params.id,req.user.id);revision(p,b.revision);
      const n=db.prepare('SELECT COUNT(*) AS count FROM playlist_entries WHERE playlist_id=?').get(p.id).count;
      if(n>=5000)throw fail('Playlista może zawierać maksymalnie 5000 pozycji.');
      const position=Math.min(b.position??n,n);
      db.prepare('UPDATE playlist_entries SET position=position+1 WHERE playlist_id=? AND position>=?').run(p.id,position);
      insert(p.id,position,b.entry);db.prepare("UPDATE playlists SET shuffle_remaining='[]' WHERE id=?").run(p.id);bump(p.id);});
    res.status(201).json(full(playlist(req.params.id,req.user.id),req.user.id));
  });
  app.patch(route+'/:id/entries',(req,res)=>{
    const b=z.object({ids:z.array(z.string()).max(5000),revision:z.number().int().optional()}).parse(req.body);
    tx(()=>{const p=playlist(req.params.id,req.user.id);revision(p,b.revision);
      const original=db.prepare('SELECT id FROM playlist_entries WHERE playlist_id=?').all(p.id).map(x=>x.id);
      if(original.length!==b.ids.length||new Set(b.ids).size!==original.length||b.ids.some(x=>!original.includes(x)))throw fail('Kolejność nie zgadza się z playlistą.',409);
      b.ids.forEach((id,index)=>db.prepare('UPDATE playlist_entries SET position=? WHERE id=? AND playlist_id=?').run(index,id,p.id));
      db.prepare("UPDATE playlists SET shuffle_remaining='[]' WHERE id=?").run(p.id);bump(p.id);});
    res.json(full(playlist(req.params.id,req.user.id),req.user.id));
  });
  app.patch(route+'/:id/entries/:entryId',(req,res)=>{
    const b=z.object({entry:entrySchema,revision:z.number().int().optional()}).parse(req.body);
    if(b.entry.itemId)getItem(b.entry.itemId,req.user.id);
    tx(()=>{const p=playlist(req.params.id,req.user.id);revision(p,b.revision);
      const result=db.prepare('UPDATE playlist_entries SET media_item_id=?,episode_url=?,season=?,episode=?,label=?,metadata=? WHERE playlist_id=? AND id=?')
        .run(b.entry.itemId||null,b.entry.episodeUrl||null,b.entry.season??null,b.entry.episode??null,b.entry.label||'',JSON.stringify(b.entry.metadata||{}),p.id,req.params.entryId);
      if(!result.changes)throw fail('Nie znaleziono pozycji.',404);
      db.prepare("UPDATE playlists SET shuffle_remaining='[]' WHERE id=?").run(p.id);bump(p.id);});
    res.json(full(playlist(req.params.id,req.user.id),req.user.id));
  });
  app.delete(route+'/:id/entries/:entryId',(req,res)=>{
    const b=z.object({revision:z.number().int().optional()}).parse(req.body||{});
    tx(()=>{const p=playlist(req.params.id,req.user.id);revision(p,b.revision);
      if(!db.prepare('DELETE FROM playlist_entries WHERE id=? AND playlist_id=?').run(req.params.entryId,p.id).changes)throw fail('Nie znaleziono pozycji.',404);
      db.prepare('SELECT id FROM playlist_entries WHERE playlist_id=? ORDER BY position').all(p.id).forEach((e,i)=>db.prepare('UPDATE playlist_entries SET position=? WHERE id=?').run(i,e.id));
      if(p.cursor_id===req.params.entryId)db.prepare('UPDATE playlists SET cursor_id=NULL WHERE id=?').run(p.id);
      db.prepare('UPDATE playlists SET shuffle_remaining=?,shuffle_history=? WHERE id=?').run(
        JSON.stringify(JSON.parse(p.shuffle_remaining).filter(id=>id!==req.params.entryId)),
        JSON.stringify(JSON.parse(p.shuffle_history).filter(id=>id!==req.params.entryId)),p.id);bump(p.id);});
    res.json(full(playlist(req.params.id,req.user.id),req.user.id));
  });
  app.patch(route+'/:id/entries/:entryId/progress',(req,res)=>{
    const {completed,position}=z.object({completed:z.boolean().optional(),position:z.number().finite().min(0).max(1e8).optional()}).refine(b=>b.completed!==undefined||b.position!==undefined).parse(req.body);
    const p=playlist(req.params.id,req.user.id);
    const result=db.prepare('UPDATE playlist_entries SET completed=COALESCE(?,completed),playback_position=COALESCE(?,playback_position) WHERE playlist_id=? AND id=?').run(completed===undefined?null:completed?1:0,position??null,p.id,req.params.entryId);
    if(!result.changes)throw fail('Nie znaleziono pozycji.',404);
    if(completed!==undefined)bump(p.id);
    res.json(full(playlist(p.id,req.user.id),req.user.id));
  });
  app.patch(route+'/:id/playback',(req,res)=>{
    const b=z.object({cursorId:z.string().nullable(),shuffleRemaining:z.array(z.string()).max(5000).optional(),shuffleHistory:z.array(z.string()).max(5000).optional()}).parse(req.body);
    const p=playlist(req.params.id,req.user.id),ids=db.prepare('SELECT id FROM playlist_entries WHERE playlist_id=?').all(p.id).map(e=>e.id);
    if(b.cursorId!==null&&!ids.includes(b.cursorId)||b.shuffleRemaining?.some(id=>!ids.includes(id))||b.shuffleRemaining&&new Set(b.shuffleRemaining).size!==b.shuffleRemaining.length||b.shuffleHistory?.some(id=>!ids.includes(id)))throw fail('Niepoprawny stan odtwarzania.');
    db.prepare('UPDATE playlists SET cursor_id=?,shuffle_remaining=?,shuffle_history=?,updated=? WHERE id=? AND user_id=?').run(b.cursorId,JSON.stringify(b.shuffleRemaining??JSON.parse(p.shuffle_remaining)),JSON.stringify(b.shuffleHistory??JSON.parse(p.shuffle_history)),now(),p.id,req.user.id);
    res.json(full(playlist(p.id,req.user.id),req.user.id));
  });
  app.post(route+'/import',(req,res)=>{
    const b=z.object({content:z.unknown(),format:z.enum(['json','csv']).default('json')}).parse(req.body);
    const imported=normalizedImport(b.content,b.format);
    const catalog=db.prepare('SELECT i.id,i.value FROM items i JOIN sources s ON s.id=i.source_id WHERE s.user_id=?').all(req.user.id).map(r=>({id:r.id,...JSON.parse(r.value)}));
    const id=tx(()=>{const id=uid(),timestamp=now();db.prepare('INSERT INTO playlists(id,user_id,name,description,mode,created,updated) VALUES(?,?,?,?,?,?,?)').run(id,req.user.id,imported.name,imported.description,imported.mode,timestamp,timestamp);
      imported.entries.forEach((e,i)=>insert(id,i,mapImported(e,req.user.id,catalog)));return id;});
    res.status(201).json(full(playlist(id,req.user.id),req.user.id));
  });
  app.get(route+'/:id/export',(req,res)=>{
    const p=full(playlist(req.params.id,req.user.id),req.user.id);
    const serialized={schema_version:'cinema-hub-playlists-1',name:p.name,description:p.description,mode:p.mode,entries:p.entries.map(({itemId,episodeUrl,season,episode,label,metadata,completed,playbackPosition})=>({itemId,episodeUrl,season,episode,label,metadata,completed,playbackPosition}))};
    if(req.query.format==='csv'){
      const columns=['record_type','playlist_name','playlist_description','playlist_mode','order','item_id','episode_url','season','episode','label','title','series_code','series_title','completed','playback_position','metadata_json'];
      const cell=value=>{const string=value==null?'':String(value);return /[;"\r\n]/.test(string)?'"'+string.replace(/"/g,'""')+'"':string;};
      const row=values=>columns.map(key=>cell(values[key])).join(';');
      const lines=[columns.join(';'),row({record_type:'playlist',playlist_name:p.name,playlist_description:p.description,playlist_mode:p.mode})];
      serialized.entries.forEach((entry,index)=>lines.push(row({record_type:'entry',order:index+1,item_id:entry.itemId,episode_url:entry.episodeUrl,season:entry.season,episode:entry.episode,label:entry.label,title:entry.metadata?.title,series_code:entry.metadata?.series_code,series_title:entry.metadata?.series_title,completed:entry.completed?'true':'false',playback_position:entry.playbackPosition,metadata_json:JSON.stringify(entry.metadata)})));
      return res.set('Content-Disposition',`attachment; filename="cinema-playlist-${p.id}.csv"`).type('text/csv; charset=utf-8').send('\uFEFF'+lines.join('\r\n')+'\r\n');
    }
    res.set('Content-Disposition',`attachment; filename="cinema-playlist-${p.id}.json"`).type('json').send(JSON.stringify(serialized,null,2));
  });
  app.get('/api/playlist-media/search',auth,(req,res)=>{
    const q=String(req.query.q||'').toLowerCase().trim().slice(0,120);if(q.length<2)return res.json([]);
    res.json(db.prepare('SELECT i.id,i.value FROM items i JOIN sources s ON s.id=i.source_id WHERE s.user_id=?').all(req.user.id)
      .map(r=>({id:r.id,...JSON.parse(r.value)})).filter(x=>x.title?.toLowerCase().includes(q)).slice(0,80)
      .map(({id,title,kind,sourceName,poster})=>({id,title,kind,sourceName,poster})));
  });
}
export { normalizedImport, csvRows };
