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

const filmanSourceId=store.db.prepare("SELECT id FROM sources WHERE user_id=? AND type='filman'").get(first.id).id;
const sgaURL='https://filman.cc/s/1963/gwiezdne-wrota-atlantyda-stargate-atlantis';
const atlEpisode=(n,urlId=36729+n)=>({season:1,number:n,title:n===9?'Dom':'Odcinek testowy',
  url:`https://filman.cc/e/gwiezdne-wrota-atlantyda-stargate-atlantis/${urlId}/episode-${n}/0`});

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

test('Atlantis Home S01E09 cannot be linked and retains progress and cursor',()=>{
  const episode=atlEpisode(9,36738);
  const item=store.saveItem(filmanSourceId,{kind:'series',title:'Gwiezdne wrota: Atlantyda / Stargate Atlantis',
    url:sgaURL,episodes:[episode]});
  let p=create('Quarantined Atlantis Home');
  p=call('post','/api/playlists/:id/entries',{params:{id:p.id},body:{entry:{
    label:'Atlantis S01E09 Dom',itemId:item.id,season:1,episode:9,episodeUrl:episode.url,
    metadata:{series_code:'SGA'},
  }}});
  const entry=p.entries[0];
  assert.equal(entry.itemId,null);
  assert.equal(entry.episodeUrl,null);
  assert.equal(entry.needsStargateLink,true);
  assert.equal(entry.metadata.original_item_id,item.id);
  assert.equal(entry.metadata.original_episode_url,episode.url);
  call('patch','/api/playlists/:id/entries/:entryId/progress',{params:{id:p.id,entryId:entry.id},body:{position:123}});
  call('patch','/api/playlists/:id/playback',{params:{id:p.id},body:{cursorId:entry.id}});
  const reload=get(p.id);
  assert.equal(reload.cursorId,entry.id);
  assert.equal(reload.entries[0].playbackPosition,123);
  assert.equal(reload.entries[0].id,entry.id);
});

test('synchronization that changes an Atlantis episode URL unlinks all playlist references without erasing history',()=>{
  const initial=atlEpisode(8);
  const item=store.saveItem(filmanSourceId,{kind:'series',title:'Gwiezdne wrota: Atlantyda / Stargate Atlantis',
    url:sgaURL,episodes:[initial]});
  let p=create('Atlantis URL reconciliation');
  p=call('post','/api/playlists/:id/entries',{params:{id:p.id},body:{entry:{
    label:'Atlantis S01E08',itemId:item.id,season:1,episode:8,episodeUrl:initial.url,
    metadata:{series_code:'SGA'},
  }}});
  const entryId=p.entries[0].id;
  assert.equal(p.entries[0].itemId,item.id);
  call('patch','/api/playlists/:id/entries/:entryId/progress',{params:{id:p.id,entryId},body:{position:215}});
  call('patch','/api/playlists/:id/playback',{params:{id:p.id},body:{cursorId:entryId}});
  const changed=store.saveItem(filmanSourceId,{kind:'series',title:item.title,url:sgaURL,
    episodes:[atlEpisode(8,999987)]});
  assert.ok(changed.stargateConflicts.includes('1:8'));
  assert.equal(changed.episodes.find(e=>e.number===8).url,initial.url);
  p=get(p.id);
  assert.equal(p.entries[0].itemId,null);
  assert.equal(p.entries[0].episodeUrl,null);
  assert.equal(p.entries[0].playbackPosition,215);
  assert.equal(p.cursorId,entryId);
  assert.equal(p.entries[0].metadata.original_episode_url,initial.url);
});

test('a Stargate episode cannot bind to another series or to a movie',()=>{
  const sg1=store.saveItem(filmanSourceId,{kind:'series',title:'Gwiezdne wrota / Stargate SG-1',
    url:'https://filman.cc/s/1942/gwiezdne-wrota-stargate-sg-1',episodes:[{
      season:1,number:9,url:'https://filman.cc/e/gwiezdne-wrota-stargate-sg-1/36492/krotka-swieca/388690',title:'Krótka świeca'}]});
  let p=create('Cross-series binding');
  p=call('post','/api/playlists/:id/entries',{params:{id:p.id},body:{entry:{
    label:'Atlantis S01E09',itemId:sg1.id,season:1,episode:9,
    episodeUrl:sg1.episodes[0].url,metadata:{series_code:'SGA'},
  }}});
  assert.equal(p.entries[0].itemId,null);
  const movie=store.saveItem(filmanSourceId,{kind:'movie',title:'Obcy film',url:'https://filman.cc/m/another-movie'});
  p=call('post','/api/playlists/:id/entries',{params:{id:p.id},body:{entry:{
    label:'Atlantis S01E09',itemId:movie.id,season:1,episode:9,
    episodeUrl:'https://filman.cc/m/another-movie',metadata:{series_code:'SGA'},
  }}});
  assert.equal(p.entries[1].itemId,null);
  assert.equal(p.entries[1].episodeUrl,null);
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
  assert.equal(restarted.restartGeneration,(p.restartGeneration??0)+1);
});
test('a delayed position update cannot reopen a completed episode',()=>{
  let p=create('Completed race');p=add(p.id,'First',p.revision);
  const entryId=p.entries[0].id,base=Date.now();
  call('patch','/api/playlists/:id/entries/:entryId/progress',{
    params:{id:p.id,entryId},body:{position:90,stamp:base,restartGeneration:0}
  });
  const completed=call('patch','/api/playlists/:id/entries/:entryId/progress',{
    params:{id:p.id,entryId},body:{position:0,completed:true,stamp:base+1,restartGeneration:0}
  });
  assert.equal(completed.entries[0].completed,true);
  for(const body of [{position:185,stamp:base+2},{position:18,completed:false,stamp:base+3}]){
    const stale=call('patch','/api/playlists/:id/entries/:entryId/progress',{
      params:{id:p.id,entryId},body:{...body,restartGeneration:0}
    });
    assert.equal(stale.entries[0].completed,true);
    assert.equal(stale.entries[0].playbackPosition,0);
    assert.equal(stale.entries[0].progressStamp,completed.entries[0].progressStamp);
  }
});
test('restart generation rejects late writes even with future timestamps',()=>{
  let p=create('Restart race');p=add(p.id,'First',p.revision);p=add(p.id,'Second',p.revision);
  const [firstId,secondId]=p.entries.map(entry=>entry.id),base=Date.now();
  call('patch','/api/playlists/:id/playback',{
    params:{id:p.id},body:{cursorId:secondId,stamp:base,restartGeneration:0}
  });
  call('patch','/api/playlists/:id/entries/:entryId/progress',{
    params:{id:p.id,entryId:secondId},body:{position:80,stamp:base,restartGeneration:0}
  });
  p=call('post','/api/playlists/:id/restart',{params:{id:p.id}});
  assert.equal(p.restartGeneration,1);
  assert.equal(p.cursorId,null);
  assert.equal(p.entries[1].playbackPosition,0);
  const oldStamp=base+1e9;
  const oldCursor=call('patch','/api/playlists/:id/playback',{
    params:{id:p.id},body:{cursorId:secondId,stamp:oldStamp,restartGeneration:0}
  });
  const oldPosition=call('patch','/api/playlists/:id/entries/:entryId/progress',{
    params:{id:p.id,entryId:secondId},body:{position:317,completed:true,stamp:oldStamp,restartGeneration:0}
  });
  assert.equal(oldCursor.cursorId,null);
  assert.equal(oldPosition.entries[1].playbackPosition,0);
  assert.equal(oldPosition.entries[1].completed,false);
  // Old clients without the generation field are equally unable to restore it.
  const legacy=call('patch','/api/playlists/:id/playback',{
    params:{id:p.id},body:{cursorId:secondId,stamp:oldStamp+1}
  });
  assert.equal(legacy.cursorId,null);
  const stamp=Math.max(p.playbackStamp,p.entries[0].progressStamp,base)+1;
  const currentCursor=call('patch','/api/playlists/:id/playback',{
    params:{id:p.id},body:{cursorId:firstId,stamp,restartGeneration:1}
  });
  assert.equal(currentCursor.cursorId,firstId);
  const currentPosition=call('patch','/api/playlists/:id/entries/:entryId/progress',{
    params:{id:p.id,entryId:firstId},body:{position:42,stamp,restartGeneration:1}
  });
  assert.equal(currentPosition.entries[0].playbackPosition,42);
  assert.equal(get(p.id).restartGeneration,1);
  assert.throws(()=>call('get','/api/playlists/:id',{user:second,params:{id:p.id}}),/Nie znaleziono/);
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
