import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

// The tests also run in the published image, which has no dev dependencies.
const compiled=stripTypeScriptTypes(readFileSync(new URL('../src/playlist.ts',import.meta.url),'utf8'));
const {advancePlaylist,selectPlaylistEntry,createPlaylistWriteQueue}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const queue=(mode,cursorId='a',shuffleRemaining=[],shuffleHistory=[])=>({mode,cursorId,shuffleRemaining,shuffleHistory,entries:['a','b','c'].map(id=>({id}))});

test('once advances one item at a time',()=>assert.equal(advancePlaylist(queue('once'),1).cursorId,'b'));
test('once stops at the end',()=>assert.equal(advancePlaylist(queue('once','c'),1),null));
test('once stops at the beginning',()=>assert.equal(advancePlaylist(queue('once','a'),-1),null));
test('repeat wraps forward',()=>assert.equal(advancePlaylist(queue('repeat','c'),1).cursorId,'a'));
test('repeat wraps backward',()=>assert.equal(advancePlaylist(queue('repeat','a'),-1).cursorId,'c'));
test('empty playlist stops',()=>assert.equal(advancePlaylist({...queue('once'),entries:[]},1),null));
test('selection begins a fresh shuffle bag excluding the current item',()=>{
  const selected=selectPlaylistEntry(queue('shuffle'),'b');
  assert.equal(selected.cursorId,'b');
  assert.deepEqual([...selected.shuffleRemaining].sort(),['a','c']);
  assert.deepEqual(selected.shuffleHistory,[]);
});
test('shuffle visits each remaining entry before beginning a new cycle',()=>{
  let current={...queue('shuffle'),...selectPlaylistEntry(queue('shuffle'),'a')};
  const visited=new Set([current.cursorId]);
  for(let index=0;index<2;index++){
    current={...current,...advancePlaylist(current,1)};
    assert.ok(!visited.has(current.cursorId));
    visited.add(current.cursorId);
  }
  assert.deepEqual([...visited].sort(),['a','b','c']);
  assert.equal(current.shuffleRemaining.length,0);
  const following=advancePlaylist(current,1);
  assert.notEqual(following.cursorId,current.cursorId);
});
test('shuffle previous follows history and puts current entry back in the bag',()=>{
  const previous=advancePlaylist(queue('shuffle','c',['a'],['b']),-1);
  assert.equal(previous.cursorId,'b');
  assert.deepEqual(previous.shuffleHistory,[]);
  assert.deepEqual(previous.shuffleRemaining,['c','a']);
});
test('shuffle safely discards stale or duplicate ids',()=>{
  const next=advancePlaylist(queue('shuffle','a',['deleted','b','b','c']),1);
  assert.equal(next.cursorId,'b');
  assert.deepEqual(next.shuffleRemaining,['c']);
});

test('playlist writes serialize progress, restart and playback in request order',async()=>{
  const enqueue=createPlaylistWriteQueue(),events=[];
  let release;
  const first=enqueue('user-a:playlist-1',()=>new Promise(resolve=>{
    events.push('progress');release=resolve;
  }));
  const restart=enqueue('user-a:playlist-1',async()=>{events.push('restart');});
  const playback=enqueue('user-a:playlist-1',async()=>{events.push('playback');});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(events,['progress']);
  release();
  await Promise.all([first,restart,playback]);
  assert.deepEqual(events,['progress','restart','playback']);
});

test('failed playlist update does not block later writes or other users',async()=>{
  const enqueue=createPlaylistWriteQueue(),events=[];
  let release;
  const failing=enqueue('user-a:playlist-1',()=>new Promise((_,reject)=>{
    events.push('first');release=()=>reject(new Error('temporary failure'));
  }));
  const later=enqueue('user-a:playlist-1',async()=>{events.push('second');});
  await enqueue('user-b:playlist-1',async()=>{events.push('other user');});
  assert.deepEqual(events,['first','other user']);
  release();
  await assert.rejects(failing,/temporary failure/);
  await later;
  assert.deepEqual(events,['first','other user','second']);
});

const temp=mkdtempSync(join(tmpdir(),'cinema-playlists-'));
process.env.DATA_DIR=temp;
process.env.NODE_ENV='test';
const store=await import('../server/store.mjs');
const {installPlaylistRoutes,normalizedImport,csvRows}=await import('../server/playlist-routes.mjs');
after(()=>{store.db.close();rmSync(temp,{recursive:true,force:true,maxRetries:4,retryDelay:100});});
const first={id:store.db.prepare('SELECT id FROM users LIMIT 1').get().id};
const second=store.addUser('playlists-other-account','strong-test-password');
const handlers=new Map();
const app=Object.fromEntries(['get','post','patch','delete'].map(method=>[method,(path,...routeHandlers)=>{
  handlers.set(method.toUpperCase()+' '+path,routeHandlers.at(-1));
}]));
let prepareData;
app.use=(_path,_auth,initialize)=>{prepareData=initialize;};
installPlaylistRoutes(app,(_req,_res,next)=>next());
function call(method,path,{user=first,params={},body={},query={}}={}){
  const handler=handlers.get(method.toUpperCase()+' '+path);
  assert.ok(handler,'Registered handler '+method+' '+path);
  const response={statusCode:200,body:undefined,status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;},set(){return this;},type(){return this;},send(value){this.body=value;return this;}};
  const req={user,params,body,query};
  prepareData(req,response,()=>handler(req,response));
  return response.body;
}
const create=(name='Test')=>call('post','/api/playlists',{body:{name}});
const add=(id,label,revision)=>call('post','/api/playlists/:id/entries',{
  params:{id},body:{entry:{label,metadata:{title:label}},revision}
});
const get=id=>call('get','/api/playlists/:id',{params:{id}});

function readPreset(name) {
  const folder=existsSync(resolve('dist/index.html'))?'dist':'public';
  return readFileSync(resolve(folder,'playlists',name),'utf8');
}

test('playlist tables are initialized only when the authenticated playlist API is first used',()=>{
  const schema=()=>store.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'playlist%' ORDER BY name").all().map(row=>row.name);
  assert.deepEqual(schema(),[]);
  assert.deepEqual(call('get','/api/playlists'),[]);
  assert.deepEqual(schema(),['playlist_entries','playlists']);
});
test('The full chronology represents 317 episodes and films with 315 recordings',()=>{
  const preset=normalizedImport(readPreset('stargate_chronologia_cinema_hub.json'),'json');
  assert.equal(preset.entries.length,315);
  assert.equal(preset.entries.filter(entry=>entry.metadata.episode_end===2).length,2);
  assert.equal(preset.entries.filter(e=>e.metadata.series_code==='FILM').length,3);
  assert.equal(preset.entries[0].metadata.key,'FILM:1994');
});
test('The partial chronology uses 161 recordings with the joined pilot',()=>{
  const preset=normalizedImport(readPreset('stargate_od_s08_cinema_hub.json'),'json');
  assert.equal(preset.entries.length,161);
  assert.equal(preset.entries.filter(entry=>entry.metadata.episode_end===2).length,1);
});
test('CSV parser supports semicolons, quoted newlines and doubled quotes',()=>{
  const rows=csvRows('label;metadata_json\n"A;B";"""C""\nD"\n');
  assert.deepEqual(rows,[{label:'A;B',metadata_json:'"C"\nD'}]);
});
test('CSV imported entries honor the order column',()=>{
  const csv='record_type;playlist_name;playlist_mode;order;label\nplaylist;CSV;shuffle;;\nentry;;;2;Second\nentry;;;1;First\n';
  assert.deepEqual(normalizedImport(csv,'csv').entries.map(e=>e.label),['First','Second']);
  assert.equal(normalizedImport(csv,'csv').mode,'shuffle');
});
test('invalid CSV metadata reports an error',()=>assert.throws(()=>normalizedImport('metadata_json;label\n{invalid};Test','csv'),/metadata_json/));
test('user cannot access another account playlist',()=>{
  const p=create('Private');
  assert.throws(()=>call('get','/api/playlists/:id',{user:second,params:{id:p.id}}),/Nie znaleziono/);
  assert.equal(call('get','/api/playlists',{user:second}).length,0);
});
test('creating and reordering entries preserves their identity',()=>{
  let p=create('Reorder');p=add(p.id,'A',p.revision);p=add(p.id,'B',p.revision);
  const ids=p.entries.map(e=>e.id);
  p=call('patch','/api/playlists/:id/entries',{params:{id:p.id},body:{ids:[...ids].reverse(),revision:p.revision}});
  assert.deepEqual(p.entries.map(e=>e.id),[...ids].reverse());
  assert.deepEqual(p.entries.map(e=>e.label),['B','A']);
});
test('stale revisions reject conflicting reorder',()=>{
  let p=create('Revision');p=add(p.id,'A',p.revision);
  assert.throws(()=>call('patch','/api/playlists/:id/entries',{params:{id:p.id},body:{ids:p.entries.map(e=>e.id),revision:1}}),/innym oknie/);
});
test('progress and playback cursor persist per account',()=>{
  let p=create('Progress');p=add(p.id,'Film',p.revision);
  const entryId=p.entries[0].id;
  call('patch','/api/playlists/:id/entries/:entryId/progress',{params:{id:p.id,entryId},body:{position:164,completed:true}});
  call('patch','/api/playlists/:id/playback',{params:{id:p.id},body:{cursorId:entryId,shuffleRemaining:[],shuffleHistory:[]}});
  p=get(p.id);
  assert.equal(p.entries[0].playbackPosition,164);
  assert.equal(p.entries[0].completed,true);
  assert.equal(p.cursorId,entryId);
  assert.equal(p.completedCount,1);
});
test('switching playlist mode during playback preserves cursor and progress',()=>{
  let p=create('Modes');p=add(p.id,'First',p.revision);p=add(p.id,'Second',p.revision);
  const cursorId=p.entries[1].id;
  call('patch','/api/playlists/:id/playback',{params:{id:p.id},body:{cursorId,shuffleRemaining:[],shuffleHistory:[]}});
  call('patch','/api/playlists/:id/entries/:entryId/progress',{params:{id:p.id,entryId:cursorId},body:{position:157}});
  p=get(p.id);
  const switched=call('patch','/api/playlists/:id',{params:{id:p.id},body:{mode:'shuffle',revision:p.revision}});
  assert.equal(switched.mode,'shuffle');
  assert.equal(switched.cursorId,cursorId);
  assert.equal(switched.entries[1].playbackPosition,157);
  assert.ok(switched.revision>p.revision);
  const repeated=call('patch','/api/playlists/:id',{params:{id:p.id},body:{mode:'repeat',revision:switched.revision}});
  assert.equal(repeated.mode,'repeat');
  assert.equal(repeated.cursorId,cursorId);
  assert.equal(repeated.entries[1].playbackPosition,157);
});

test('completing an entry updates revision before changing the playback mode',()=>{
  let p=create('Completed mode');p=add(p.id,'First',p.revision);
  const entryId=p.entries[0].id;
  const completed=call('patch','/api/playlists/:id/entries/:entryId/progress',{params:{id:p.id,entryId},body:{position:0,completed:true}});
  assert.equal(completed.entries[0].completed,true);
  assert.ok(completed.revision>p.revision);
  const changed=call('patch','/api/playlists/:id',{params:{id:p.id},body:{mode:'shuffle',revision:completed.revision}});
  assert.equal(changed.mode,'shuffle');
  assert.equal(changed.entries[0].completed,true);
});
test('restart resets all entries and cursor while retaining playlist order',()=>{
  let p=create('Restart');p=add(p.id,'First',p.revision);p=add(p.id,'Second',p.revision);
  const ids=p.entries.map(e=>e.id);
  for(const entryId of ids)call('patch','/api/playlists/:id/entries/:entryId/progress',{params:{id:p.id,entryId},body:{position:120,completed:true}});
  call('patch','/api/playlists/:id/playback',{params:{id:p.id},body:{cursorId:ids[1],shuffleRemaining:[ids[0]],shuffleHistory:[ids[0]]}});
  const restarted=call('post','/api/playlists/:id/restart',{params:{id:p.id}});
  assert.deepEqual(restarted.entries.map(e=>e.id),ids);
  assert.ok(restarted.entries.every(e=>!e.completed&&e.playbackPosition===0));
  assert.equal(restarted.completedCount,0);
  assert.equal(restarted.cursorId,null);
  assert.deepEqual(restarted.shuffleRemaining,[]);
  assert.deepEqual(restarted.shuffleHistory,[]);
});
test('invalid playback state cannot reference another entry',()=>{
  const p=create('Invalid queue');
  assert.throws(()=>call('patch','/api/playlists/:id/playback',{params:{id:p.id},body:{cursorId:'unknown'}}),/Niepoprawny/);
});
test('import preserves stale media identifiers as recovery metadata',()=>{
  const p=call('post','/api/playlists/import',{body:{format:'json',content:JSON.stringify({name:'Portable',entries:[{itemId:'old-server-123',label:'Episode',metadata:{season:2}}]})}});
  assert.equal(p.entries[0].media,null);
  assert.equal(p.entries[0].metadata.original_item_id,'old-server-123');
  assert.equal(p.entries[0].itemId,null);
});
test('JSON export and import round trip keeps entry order and progress',()=>{
  let p=create('Export');p=add(p.id,'First',p.revision);p=add(p.id,'Second',p.revision);
  call('patch','/api/playlists/:id/entries/:entryId/progress',{params:{id:p.id,entryId:p.entries[0].id},body:{position:95,completed:true}});
  const exported=call('get','/api/playlists/:id/export',{params:{id:p.id},query:{format:'json'}});
  const copy=call('post','/api/playlists/import',{body:{format:'json',content:exported}});
  assert.deepEqual(copy.entries.map(e=>e.label),['First','Second']);
  assert.equal(copy.entries[0].playbackPosition,95);
  assert.equal(copy.entries[0].completed,true);
});
test('duplication copies entries with independent identifiers',()=>{
  let p=create('Duplicate');p=add(p.id,'Only',p.revision);
  const copy=call('post','/api/playlists/:id/duplicate',{params:{id:p.id}});
  assert.equal(copy.entries[0].label,'Only');
  assert.notEqual(copy.id,p.id);
  assert.notEqual(copy.entries[0].id,p.entries[0].id);
});
