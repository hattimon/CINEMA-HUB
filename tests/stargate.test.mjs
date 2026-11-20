import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDetail } from '../server/filman-parser.mjs';
import { STARGATE_SERIES, canonicalStargateCode, validStargateEpisode,
  uniqueStargateEpisodes } from '../server/stargate-identity.mjs';

// Importing stargate-playlists loads the database; use an isolated test directory.
const temp=mkdtempSync(join(tmpdir(),'cinema-stargate-test-'));
process.env.DATA_DIR=temp;
process.env.NODE_ENV='test';
const { stargateLinkStatus, stargatePlaybackStatus }=await import('../server/stargate-playlists.mjs');
const store=await import('../server/store.mjs');
const media=await import('../server/media.mjs');
after(()=>{store.db.close();rmSync(temp,{recursive:true,force:true});});
const source={type:'filman',url:'https://filman.cc/'};
const sg1='https://filman.cc'+STARGATE_SERIES.SG1;
const sga='https://filman.cc'+STARGATE_SERIES.SGA;
const home={season:1,number:9,title:'Dom',url:'https://filman.cc/e/gwiezdne-wrota-atlantyda-stargate-atlantis/36738/dom/0'};
const sgaItem={kind:'series',title:'Gwiezdne wrota: Atlantyda / Stargate Atlantis',url:sga,episodes:[home]};

test('provider series identity cannot be spoofed by a similar title or a movie',()=>{
  assert.equal(canonicalStargateCode(sga,source),'SGA');
  assert.equal(canonicalStargateCode('https://other.example/s/1963/gwiezdne-wrota-atlantyda-stargate-atlantis',source),undefined);
  assert.equal(stargatePlaybackStatus({...sgaItem,kind:'movie'},source,home).valid,false);
  assert.equal(stargatePlaybackStatus({...sgaItem,url:sg1},source,home).valid,false);
});
test('Atlantis Home cannot play even with a canonical-looking provider URL',()=>{
  assert.equal(validStargateEpisode('SGA',home,source),true);
  assert.equal(stargateLinkStatus({metadata:{series_code:'SGA'},season:1,episode:9,
    episodeUrl:home.url},sgaItem,source).valid,false);
  assert.equal(stargatePlaybackStatus(sgaItem,source,home).valid,false);
});
test('duplicate slot, reused URL, and wrong series episode paths are rejected',()=>{
  const e1={...home,number:3,url:home.url.replace('/36738/dom/','/36732/zabawa/')};
  const e2={...e1,number:4};
  const e3={...e1,url:home.url.replace('/36738/dom/','/36739/another/')};
  assert.deepEqual(new Set(uniqueStargateEpisodes('SGA',[e1,e2,e3],source).rejected),new Set(['1:3','1:4']));
  assert.equal(validStargateEpisode('SGA',{...e1,url:e1.url.replace('atlantyda-stargate-atlantis','stargate-sg-1')},source),false);
  assert.equal(validStargateEpisode('SGA',{...e1,url:e1.url.replace('https://filman.cc','https://else.example')},source),false);
  assert.equal(validStargateEpisode('SGA',{...e1,season:0},source),false);
});
test('an invalid refresh URL or reused provider episode ID quarantines the affected slots',()=>{
  const original={...home,number:8,url:home.url.replace('/36738/dom/','/36737/homecoming/')};
  const foreign={...original,url:'https://else.example/e/gwiezdne-wrota-atlantyda-stargate-atlantis/9999/wrong/0'};
  const wrongSeries={...original,url:original.url.replace('atlantyda-stargate-atlantis','stargate-sg-1')};
  assert.deepEqual(uniqueStargateEpisodes('SGA',[original,foreign],source).episodes,[]);
  assert.deepEqual(uniqueStargateEpisodes('SGA',[original,wrongSeries],source).rejected,['1:8']);
  const reusedId={...original,number:7,url:original.url.replace('/homecoming/','/alternate/')};
  assert.deepEqual(new Set(uniqueStargateEpisodes('SGA',[original,reusedId],source).rejected),new Set(['1:8','1:7']));
});
test('catalog refresh preserves the prior episode URL and progress while quarantining changed uploads',()=>{
  const userId=store.db.prepare('SELECT id FROM users LIMIT 1').get().id;
  const sourceId=store.db.prepare("SELECT id FROM sources WHERE user_id=? AND type='filman'").get(userId).id;
  const original={...home,number:8,url:home.url.replace('/36738/dom/','/36737/original/')};
  const item=store.saveItem(sourceId,{...sgaItem,episodes:[original]});
  store.saveProgress(item,userId,{episode:original.url,position:141,updatedAt:Date.now()-1000});
  const changed={...original,url:original.url.replace('/36737/original/','/55555/unknown/')};
  const refreshed=store.saveItem(sourceId,{...sgaItem,episodes:[changed]});
  assert.equal(refreshed.id,item.id);
  assert.equal(refreshed.episodes.find(episode=>episode.number===8).url,original.url);
  assert.ok(refreshed.stargateConflicts.includes('1:8'));
  assert.equal(store.getProgress(refreshed,userId)[0].position,141);
  assert.equal(stargatePlaybackStatus(refreshed,source,original).valid,false);
  const repeated=store.saveItem(sourceId,{...sgaItem,episodes:[original]});
  assert.ok(repeated.stargateConflicts.includes('1:8'));
  assert.equal(store.getProgress(repeated,userId)[0].episode,original.url);
});
test('an invalid episode URL during synchronization quarantines a previously cached slot',()=>{
  const userId=store.db.prepare('SELECT id FROM users LIMIT 1').get().id;
  const sourceId=store.db.prepare("SELECT id FROM sources WHERE user_id=? AND type='filman'").get(userId).id;
  const original={...home,number:7,url:home.url.replace('/36738/dom/','/36736/verified-metadata/')};
  store.saveItem(sourceId,{...sgaItem,episodes:[original]});
  const invalid={...original,url:'https://untrusted.example/e/whatever/999/wrong/0'};
  const result=store.saveItem(sourceId,{...sgaItem,episodes:[invalid]});
  assert.equal(result.episodes.find(episode=>episode.number===7).url,original.url);
  assert.ok(result.stargateConflicts.includes('1:7'));
  assert.equal(stargatePlaybackStatus(result,source,original).valid,false);
});
test('parser keeps a conflict marker after dropping ambiguous episode slots',()=>{
  const html='<div id="single-info"><h1>Atlantyda</h1></div><div class="episode-list">'
    +'<a href="/e/gwiezdne-wrota-atlantyda-stargate-atlantis/12/home/0">S01E09 Dom</a>'
    +'<a href="/e/gwiezdne-wrota-atlantyda-stargate-atlantis/13/home/0">1x09 Dom inny</a>'
    +'<a href="/e/gwiezdne-wrota-atlantyda-stargate-atlantis/14/a/0">S01E08</a>'
    +'<a href="/e/gwiezdne-wrota-atlantyda-stargate-atlantis/14/a/0">1x07</a>'
    +'<a href="https://evil.example/e/wrong/12/bad/0">S01E10</a>'
    +'</div>';
  const parsed=parseDetail(html,sga);
  assert.deepEqual(new Set(parsed.episodeConflicts),new Set(['1:9','1:8','1:7']));
  assert.deepEqual(parsed.episodes,[]);
});

test('an already queued Atlantis Home download is blocked for device and cloud exports',async()=>{
  const account=store.addUser('stargate-download-quarantine','Fixture-Password-123');
  const sourceId=store.db.prepare("SELECT id FROM sources WHERE user_id=? AND type='filman'").get(account.id).id;
  const item=store.saveItem(sourceId,{...sgaItem});
  const playbackId=media.rememberPlayback(account.id,{kind:'mp4',url:'https://media.example.invalid/unrelated.mp4'},
    {sourceId,itemId:item.id,pageURL:home.url,episode:home});
  const job={userId:account.id,playbackId,sourceId,itemId:item.id,pageURL:home.url,
    episode:home,filename:'Atlantis Home.mp4',link:{id:'original'},attempts:0};
  await assert.rejects(media.freshPlayback(job),{status:409});
  assert.throws(()=>media.exportProcess(media.playbackFor(playbackId,account.id)),{status:409});
  await assert.rejects(media.exportToDevice(media.playbackFor(playbackId,account.id),
    {},{set(){throw Error('Download headers must not be written');}},'Atlantis Home.mp4'),{status:409});

  const destinationId=store.uid(),jobId=store.uid();
  store.db.prepare('INSERT INTO destinations VALUES(?,?,?,?,?,?)').run(destinationId,account.id,
    'Fixture cloud','webdav',JSON.stringify({url:'https://cloud.example.invalid/'}),store.encrypt({}));
  store.db.prepare('INSERT INTO downloads VALUES(?,?,?,?,?)').run(jobId,account.id,
    JSON.stringify({...job,id:jobId,destination:destinationId}),'queued',store.now());
  await media.cloudQueue();
  const saved=media.downloadFor(jobId,account.id);
  assert.equal(saved.status,'paused');
  assert.match(saved.error,/Atlantyda S01E09/);
});

test('stale download identity cannot be reused after a catalog refresh or episode swap',async()=>{
  const account=store.addUser('stargate-download-refresh','Fixture-Password-123');
  const sourceId=store.db.prepare("SELECT id FROM sources WHERE user_id=? AND type='filman'").get(account.id).id;
  const episode={season:1,number:2,title:'Drugi',
    url:'https://filman.cc/e/gwiezdne-wrota-stargate-sg-1/20001/drugi/0'};
  const parent={kind:'series',title:'Stargate SG-1',url:sg1,episodes:[episode]};
  const item=store.saveItem(sourceId,parent);
  const link={id:'fixture'};
  const playbackId=media.rememberPlayback(account.id,{kind:'mp4',url:'https://media.example.invalid/second.mp4'},
    {sourceId,itemId:item.id,pageURL:episode.url,episode,link});
  const job={userId:account.id,playbackId,sourceId,itemId:item.id,pageURL:episode.url,
    episode,link};
  assert.equal((await media.freshPlayback(job)).id,playbackId);
  await assert.rejects(media.freshPlayback({...job,episode:{...episode,number:3}}),{status:409});
  await assert.rejects(media.freshPlayback({...job,pageURL:episode.url+'/wrong'}),{status:409});
  await assert.rejects(media.freshPlayback({...job,link:{id:'other'}}),{status:409});
  store.saveProgress(item,account.id,{episode:episode.url,position:173});
  store.saveItem(sourceId,{...parent,episodes:[{...episode,url:episode.url.replace('/20001/drugi/','/90001/other/')} ]});
  await assert.rejects(media.freshPlayback(job),{status:409});
  assert.equal(store.getProgress(store.getItem(item.id,account.id),account.id)[0].position,173);
});

test('a removed catalog item invalidates existing playback and queued downloads with a recoverable conflict',async()=>{
  const account=store.addUser('stargate-removed-item','Fixture-Password-123');
  const sourceId=store.db.prepare("SELECT id FROM sources WHERE user_id=? AND type='filman'").get(account.id).id;
  const episode={season:1,number:4,title:'Czwarty',
    url:'https://filman.cc/e/gwiezdne-wrota-stargate-sg-1/20004/czwarty/0'};
  const item=store.saveItem(sourceId,{kind:'series',title:'Stargate SG-1',url:sg1,episodes:[episode]});
  const playbackId=media.rememberPlayback(account.id,{kind:'mp4',url:'https://media.example.invalid/fourth.mp4'},
    {sourceId,itemId:item.id,pageURL:episode.url,episode});
  const job={userId:account.id,playbackId,sourceId,itemId:item.id,pageURL:episode.url,episode};
  assert.equal((await media.freshPlayback(job)).id,playbackId);
  store.db.prepare('DELETE FROM items WHERE id=?').run(item.id);
  await assert.rejects(media.freshPlayback(job),{status:409});
  assert.throws(()=>media.exportProcess(media.playbackFor(playbackId,account.id)),{status:409});
});
