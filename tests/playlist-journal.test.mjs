import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

// Test the real browser journal without localhost or a physical TV.
const source=readFileSync(new URL('../src/playlistProgress.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;

function journal(storage=new Map(),online=false){
  const sent=[];
  const events=new Map();
  const listen=(type,fn)=>events.set(type,fn);
  const unlisten=type=>events.delete(type);
  const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
  const window={addEventListener:listen,removeEventListener:unlisten,
    setInterval:()=>1,clearInterval:()=>{}};
  const document={addEventListener:listen,removeEventListener:unlisten};
  const exports={};
  const api=async(path,payload)=>{
    if(!online)throw Object.assign(new Error('offline'),{status:503});
    sent.push({path,payload});
    return {ok:true};
  };
  runInNewContext(compiled,{exports,require:name=>{
    assert.equal(name,'./api');return {api};
  },window,document,localStorage,AbortController,Date,Promise},
  {filename:'src/playlistProgress.ts'});
  return {journal:exports,storage,sent,setOnline:value=>online=value};
}

const playlist=(generation=0)=>({
  id:'playlist-a',restartGeneration:generation,playbackStamp:0,completedCount:0,
  entries:[{id:'episode-1',completed:false,playbackPosition:0,progressStamp:0}]
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('offline position survives sign out, reload and reconnect for the same account',async()=>{
  const storage=new Map();
  const old=journal(storage,false);
  const stopOld=old.journal.startPlaylistSync('user-one');
  old.journal.recordPlaylistPosition('playlist-a','episode-1',117,undefined,0);
  await tick();
  assert.equal(old.journal.withLocalPlaylist(playlist()).entries[0].playbackPosition,117);
  assert.ok(storage.get('cinema-hub.playlist-journal.v1.user-one')?.includes('117'));
  stopOld();

  const fresh=journal(storage,true);
  const stopFresh=fresh.journal.startPlaylistSync('user-one');
  await tick();
  await fresh.journal.flushPlaylistJournal();
  assert.equal(fresh.sent.length,1);
  assert.equal(fresh.sent[0].path,'/playlists/playlist-a/entries/episode-1/progress');
  assert.equal(fresh.sent[0].payload.position,117);
  assert.equal(JSON.parse(storage.get('cinema-hub.playlist-journal.v1.user-one')).length,0);
  stopFresh();
});

test('completion cannot be replaced by late position or startup zero',async()=>{
  const instance=journal();
  const stop=instance.journal.startPlaylistSync('user-one');
  instance.journal.recordPlaylistPosition('playlist-a','episode-1',240,true,0);
  instance.journal.recordPlaylistPosition('playlist-a','episode-1',12,undefined,0);
  instance.journal.recordPlaylistPosition('playlist-a','episode-1',0,undefined,0);
  await tick();
  const result=instance.journal.withLocalPlaylist(playlist());
  assert.equal(result.entries[0].completed,true);
  assert.equal(result.entries[0].playbackPosition,240);
  const pending=JSON.parse(instance.storage.get('cinema-hub.playlist-journal.v1.user-one'));
  assert.equal(pending.length,1);
  assert.equal(pending[0].completed,true);
  stop();
});

test('restart generation and user ownership isolate stale browser progress',async()=>{
  const storage=new Map();
  const instance=journal(storage,false);
  const stopOne=instance.journal.startPlaylistSync('user-one');
  instance.journal.recordPlaylistPosition('playlist-a','episode-1',90,undefined,0);
  await tick();
  assert.equal(instance.journal.withLocalPlaylist(playlist(1)).entries[0].playbackPosition,0);
  stopOne();

  const stopTwo=instance.journal.startPlaylistSync('user-two');
  assert.equal(instance.journal.withLocalPlaylist(playlist()).entries[0].playbackPosition,0);
  instance.journal.recordPlaylistPosition('playlist-a','episode-1',17,undefined,0);
  await tick();
  assert.equal(instance.journal.withLocalPlaylist(playlist()).entries[0].playbackPosition,17);
  assert.ok(storage.get('cinema-hub.playlist-journal.v1.user-one')?.includes('90'));
  stopTwo();
});
