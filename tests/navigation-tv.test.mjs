import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('TV sidebar keeps the nine requested actions, scrolls and reopens Sources each time',()=>{
  const app=read('src/App.tsx');
  const settings=read('src/Settings.tsx');
  const css=read('src/style.css');
  assert.match(app,/\['playlists','Playlisty',ListVideo\]/);
  assert.doesNotMatch(app,/className="sidebar-sources"/);
  assert.match(app,/setSettingsNavKey\(key=>key\+1\);changeView\('settings'\)/);
  assert.match(app,/<SettingsPanel key=\{settingsNavKey\}/);
  assert.match(settings,/\[tab,setTab\]=useState\('sources'\)/);
  assert.match(css,/\.sidebar nav\{[^}]*overflow-y:auto/);
  assert.match(css,/\.sidebar-bottom\{[^}]*flex:0 0 auto/);
  assert.match(read('src/tv.ts'),/scrollIntoView\(\{block:'nearest'/);
});

test('native Android TV player exposes an episode list only for playlist playback',()=>{
  const android=read('android/app/src/main/java/pl/cinemahub/tv/MainActivity.java');
  const player=read('src/Player.tsx');
  const queue=read('src/PlaylistQueue.tsx');
  assert.match(android,/hasPlaylist=data\.optBoolean\("hasPlaylist",hasPlaylist\)/);
  assert.match(android,/iconAction\("☷","Lista odcinków",nativeActions,\(\)->openWebPanel\("playlist"\)\)/);
  assert.match(android,/nativePlaylist\.setVisibility\(hasPlaylist\?View\.VISIBLE:View\.GONE\)/);
  assert.match(android,/mode\.equals\("sources"\)\|\|mode\.equals\("playlist"\)/);
  assert.match(android,/CinemaHubTV\.back\(\)/);
  assert.match(player,/hasPlaylist:!!current\.onOpenPlaylist/);
  assert.match(player,/result\.type==='playlist'/);
  assert.match(queue,/playlist\.entries\.map\(entry=>/);
  assert.match(queue,/data-modal-autofocus=\{entry\.id===playlist\.cursorId/);
  assert.match(queue,/entry\.completed\?'✓ Obejrzane'/);
  assert.match(read('src/components.tsx'),/previous\.focus\(\{preventScroll:true\}\)/);
});

test('mixed 315-entry playlist preserves user order and current selection',async()=>{
  const compiled=stripTypeScriptTypes(read('src/playlist.ts'));
  const {selectPlaylistEntry,advancePlaylist}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
  const entries=Array.from({length:315},(_,position)=>({id:'entry-'+position,position,metadata:{series_title:position%2?'Stargate Atlantis':'Stargate SG-1'},playbackPosition:0,completed:false}));
  const initial={entries,cursorId:'entry-0',mode:'once',shuffleRemaining:[],shuffleHistory:[]};
  const chosen=selectPlaylistEntry(initial,'entry-200');
  assert.equal(chosen.cursorId,'entry-200');
  assert.deepEqual(initial.entries.map(entry=>entry.id),entries.map(entry=>entry.id));
  assert.equal(advancePlaylist({...initial,...chosen},1).cursorId,'entry-201');
  assert.equal(entries.length,315);
});

test('Filman session uses persisted profile and bounded same-origin recovery',()=>{
  const browser=read('server/browser.mjs');
  const session=read('server/filman-session.mjs');
  assert.match(browser,/resolve\(dataDir,'browser',sourceId\)/);
  assert.match(browser,/chromium\.launchPersistentContext\(directory/);
  assert.match(browser,/filmanRecoveryFailedUntil\.set\(source\.id,Date\.now\(\)\+120000\)/);
  assert.match(session,/if \(recovery\.disabled \|\| clicked\) throw filmanNeedsVerification\(\)/);
  assert.match(session,/if \(control === 'manual'\) throw filmanNeedsVerification\(\)/);
});

test('expired source session is actionable by D-Pad and refreshes the catalog after verification',()=>{
  const app=read('src/App.tsx');
  assert.match(app,/data-tv-verification/);
  assert.match(app,/verifySource\(e\.sourceId\)/);
  assert.match(app,/verifySource\(g\.sourceId\)/);
  assert.match(app,/source\.id\+'\/login'/);
  assert.match(app,/result\.url/);
  assert.match(app,/cinema-source-session-saved/);
  assert.match(app,/setCatalogRefresh\(value=>value\+1\)/);
  assert.match(app,/control\?\.scrollIntoView\(\{block:'nearest'\}\)/);
});
