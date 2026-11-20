import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// An isolated database reproduces an installation predating playlist progress
// columns. Run the real migration without touching an existing user database.
const directory=mkdtempSync(join(tmpdir(),'cinema-legacy-playlists-'));
process.env.DATA_DIR=directory;
process.env.NODE_ENV='test';
const {db}=await import('../server/store.mjs');
const {installPlaylistRoutes}=await import('../server/playlist-routes.mjs');
after(()=>{db.close();rmSync(directory,{recursive:true,force:true,maxRetries:4,retryDelay:100});});

const user=db.prepare('SELECT id FROM users LIMIT 1').get();
db.exec(`
  CREATE TABLE playlists(
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',mode TEXT NOT NULL DEFAULT 'once',
    revision INTEGER NOT NULL DEFAULT 1,cursor_id TEXT,
    shuffle_remaining TEXT NOT NULL DEFAULT '[]',created INTEGER NOT NULL,updated INTEGER NOT NULL
  );
  CREATE TABLE playlist_entries(
    id TEXT PRIMARY KEY,playlist_id TEXT NOT NULL,position INTEGER NOT NULL,
    media_item_id TEXT,episode_url TEXT,season INTEGER,episode INTEGER,
    label TEXT NOT NULL,metadata TEXT NOT NULL DEFAULT '{}'
  );
`);
db.prepare('INSERT INTO playlists(id,user_id,name,cursor_id,created,updated) VALUES(?,?,?,?,?,?)')
  .run('legacy-playlist',user.id,'Existing episodes','legacy-entry',100,100);
db.prepare('INSERT INTO playlist_entries(id,playlist_id,position,label) VALUES(?,?,?,?)')
  .run('legacy-entry','legacy-playlist',0,'Existing episode');

const handlers=new Map();
let prepare;
const app={use(_path,_auth,migrate){prepare=migrate;},...Object.fromEntries(
  ['get','post','patch','delete'].map(method=>[method,(path,...handlersForRoute)=>{
    handlers.set(method.toUpperCase()+' '+path,handlersForRoute.at(-1));
  }])
)};
installPlaylistRoutes(app,(_req,_res,next)=>next());
const get=()=>{
  const response={body:null,json(value){this.body=value;return this;}};
  const request={user,params:{id:'legacy-playlist'}};
  prepare(request,response,()=>handlers.get('GET /api/playlists/:id')(request,response));
  return response.body;
};

test('legacy playlist migrates without changing existing entries, cursor or owner',()=>{
  const migrated=get();
  assert.equal(migrated.name,'Existing episodes');
  assert.equal(migrated.cursorId,'legacy-entry');
  assert.equal(migrated.entries.length,1);
  assert.equal(migrated.entries[0].id,'legacy-entry');
  assert.equal(migrated.entries[0].label,'Existing episode');
  assert.equal(migrated.entries[0].completed,false);
  assert.equal(migrated.entries[0].playbackPosition,0);
  assert.equal(migrated.restartGeneration,0);
  const playlistColumns=db.prepare('PRAGMA table_info(playlists)').all().map(column=>column.name);
  const entryColumns=db.prepare('PRAGMA table_info(playlist_entries)').all().map(column=>column.name);
  for(const column of ['shuffle_history','playback_stamp','restart_generation'])assert.ok(playlistColumns.includes(column));
  for(const column of ['completed','playback_position','progress_stamp'])assert.ok(entryColumns.includes(column));
  assert.equal(db.prepare('SELECT user_id FROM playlists WHERE id=?').get('legacy-playlist').user_id,user.id);
  assert.equal(get().cursorId,'legacy-entry','migration remains idempotent');
});
