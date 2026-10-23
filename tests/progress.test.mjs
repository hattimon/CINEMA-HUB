import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory=mkdtempSync(resolve(tmpdir(),'cinema-hub-progress-'));
process.env.DATA_DIR=directory;process.env.NODE_ENV='test';process.env.INITIAL_ADMIN_PASSWORD='Resume-fixture-9';
const store=await import('../server/store.mjs');
const {server}=await import('../server/index.mjs');
const {sourceBrowser}=await import('../server/browser.mjs');
const {mediaTimer}=await import('../server/media.mjs');
let base,cookie;
before(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
  const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'Resume-fixture-9'})});
  assert.equal(response.status,200);cookie=response.headers.get('set-cookie').split(';')[0];
});
after(async()=>{clearInterval(mediaTimer);await sourceBrowser.close();await new Promise(resolve=>server.close(resolve));store.db.close();rmSync(directory,{recursive:true,force:true});});
const episodes=[{url:'https://filman.cc/e/sg-1/36485/pilot/388690',season:1,number:1,title:'Pilot'},
  ...Array.from({length:20},(_,index)=>({url:`https://filman.cc/e/sg-1/${36550+index}/episode/388690`,season:4,number:index+1,title:index===4?'Taktyka podstępu':'Odcinek '+(index+1)}))];
const target=episodes.find(episode=>episode.season===4&&episode.number===5);
const oldURL=target.url.replace('/388690','/0');
async function request(path,body){const response=await fetch(base+'/api'+path,{method:body?'PUT':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,value:await response.json()};}

test('Existing SG-1 history survives Filman account suffix changes in details, Favorites and Continue',async()=>{
  const owner=store.db.prepare('SELECT id FROM users LIMIT 1').get(),source=store.listSources(owner.id)[0];
  const item=store.saveItem(source.id,{url:'https://filman.cc/s/1942/sg-1',title:'Stargate SG-1',kind:'series',episodes});
  const legacy={episode:oldURL,position:2613.452,duration:2654,completed:false,season:4,number:5,title:target.title};
  store.db.prepare('INSERT INTO progress VALUES(?,?,?,?,?)').run(owner.id,item.id,oldURL,JSON.stringify(legacy),Date.now()-60000);
  await request('/items/'+item.id+'/favorite',{kind:'favorite',active:true});
  for(const saved of [store.decorateItem(item,owner.id).progress,(await request('/items/'+item.id+'/progress')).value[0],
    (await request('/library/favorite')).value.find(value=>value.id===item.id).progress,
    (await request('/library/continue')).value.find(value=>value.id===item.id).progress]){
    assert.equal(saved.episode,target.url);assert.equal(saved.season,4);assert.equal(saved.number,5);assert.equal(saved.position,2613.452);
  }
  const latest=Date.now()-1000;
  assert.equal((await request('/items/'+item.id+'/progress',{...legacy,position:2400,updatedAt:latest})).status,200,'An active player may still hold the previous account URL');
  assert.equal((await request('/items/'+item.id+'/progress',{...legacy,position:1,updatedAt:latest-10000})).status,200);
  const saved=(await request('/items/'+item.id+'/progress')).value;
  assert.equal(saved.length,1,'Old and current URLs represent a single episode');assert.equal(saved[0].position,2400,'An older offline snapshot cannot overwrite newer progress');
  assert.equal((await request('/items/'+item.id+'/progress',{...legacy,episode:'unrelated',season:999,number:999})).status,400);
  assert.equal((await request('/items/'+item.id+'/progress',{position:0,duration:130})).status,400,'Series history cannot be reset with an empty episode');
  assert.equal(store.db.prepare('SELECT value FROM progress WHERE item_id=? AND episode=?').get(item.id,oldURL).value,JSON.stringify(legacy),'Reading legacy history does not destroy the original record');
});

test('Browser resumes SG-1 from Favorites and Continue after a failed save and reload',{skip:!process.env.CHROMIUM_PATH,timeout:90000},async()=>{
  const filmPath=resolve(directory,'resume.mp4');
  const generated=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=320x180:r=10','-t','130','-c:v','libx264','-threads','2','-preset','ultrafast','-movflags','+faststart',filmPath]);
  assert.equal(generated.status,0,'FFmpeg produces a real video fixture: '+generated.stderr);const film=readFileSync(filmPath);
  const {chromium}=await import('playwright'),browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
  try{for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
    const context=await browser.newContext({viewport});let disconnected=false,failures=0,updates=0,userId='resume-browser';
    let saved={episode:oldURL,position:77,duration:130,completed:false,season:4,number:5,title:target.title,updatedAt:Date.now()-60000};
    const series={id:'resume-series',sourceId:'resume-source',sourceName:'Filman',title:'Stargate SG-1',kind:'series',url:'https://filman.cc/s/1942/sg-1',poster:'',description:'Test przywracania ostatniego odcinka.',episodes,favorite:true,genres:[],rating:null};
    const settings={...store.defaults,sounds:false,autoplay:false,autoFallback:false,defaultSources:['resume-source']};
    await context.route('**/api/**',async route=>{
      const path=new URL(route.request().url()).pathname;let value=[];
      if(path==='/api/auth/me')value={id:userId,username:'resume',role:'user',initial:false};
      else if(path==='/api/settings')value=settings;
      else if(path==='/api/sources')value=[{id:series.sourceId,name:'Filman',type:'filman',enabled:true}];
      else if(path==='/api/catalog')value={groups:[{sourceId:series.sourceId,sourceName:'Filman',items:[{...series,progress:saved}],filters:[],pages:[]}],errors:[]};
      else if(path.startsWith('/api/library/'))value=[{...series,progress:saved}];
      else if(path==='/api/items/'+series.id)value={...series,progress:saved};
      else if(path.endsWith('/ready'))value=[{id:'fixture',host:'Test MP4',version:'Lektor',quality:'720p',playbackId:'resume-mp4',kind:'mp4'}];
      else if(path.endsWith('/progress')){
        if(route.request().method()==='PUT'){
          if(disconnected){failures++;return route.abort('connectionreset');}
          saved=route.request().postDataJSON();updates++;value={ok:true};
        }else value=[saved];
       }else if(path==='/api/playback/resume-mp4/media'){
        const range=/bytes=(\d+)-(\d*)/.exec(route.request().headers().range||'');
        const start=range?Number(range[1]):0,end=range?.[2]?Math.min(Number(range[2]),film.length-1):film.length-1;
        return route.fulfill({status:range?206:200,headers:{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':String(end-start+1),...(range?{'Content-Range':`bytes ${start}-${end}/${film.length}`}:{})},body:film.subarray(start,end+1)});
      }
      return route.fulfill({json:value});
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);assert.match(await page.title(),/Cinema Hub/);assert.equal(new URL(page.url()).origin,base);
    await page.getByRole('button',{name:'Ulubione',exact:true}).click();
    await page.getByRole('button',{name:'Zobacz Stargate SG-1',exact:true}).click();
    await page.locator('.episode-list button.active').waitFor();assert.match(await page.locator('.episode-shortcuts').innerText(),/S04E05/);
    assert.equal(await page.locator('.episodes-section select').inputValue(),'4');
    assert.equal(await page.locator('.episode-list').evaluate(element=>getComputedStyle(element).scrollbarColor),'rgb(162, 138, 255) rgb(21, 24, 33)');
    if(process.env.QA_SCREENSHOT_DIR)await page.screenshot({path:resolve(process.env.QA_SCREENSHOT_DIR,`resume-themed-scrollbars-${viewport.width}.png`)});
    await page.locator('.playable-row').getByRole('button',{name:'Odtwórz',exact:true}).click();
    await page.waitForFunction(()=>{const video=document.querySelector('video');return video&&video.currentTime>=77&&!video.paused;}).catch(async error=>{
      console.error('Resume video diagnostics',await page.locator('video').evaluate(video=>({time:video.currentTime,duration:video.duration,paused:video.paused,ready:video.readyState,error:video.error?.message,source:video.currentSrc})),await page.locator('.player-overlay').innerText());throw error;
    });
    disconnected=true;
    await page.locator('video').evaluate(video=>{video.pause();video.currentTime=95;});
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cinema-hub.progress.v1.resume-browser')||'[]').some(entry=>entry.pending&&entry.progress.position>=95));
    await page.locator('video').evaluate(video=>{video.pause();video.currentTime=30;});
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cinema-hub.progress.v1.resume-browser')||'[]').some(entry=>entry.progress.position===30&&entry.pending));
    const before=updates;disconnected=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cinema-hub.progress.v1.resume-browser')||'[]').every(entry=>!entry.pending));
    assert.ok(failures>0);assert.ok(updates>before);assert.ok(saved.position<=35&&saved.position>=30);assert.equal(saved.number,5);
    await page.getByRole('button',{name:'Zamknij odtwarzacz'}).click();await page.reload();
    // The Continue card resumes the most recent episode and position without opening episode 1.
    await page.locator('.continue-card').first().click();
    await page.waitForFunction(()=>{const video=document.querySelector('video');return video&&video.currentTime>=30&&video.currentTime<45;});
    // A different signed-in account reads its own server history without seeing the first account's cache.
    await page.getByRole('button',{name:'Zamknij odtwarzacz'}).click();await page.reload();
    userId='different-browser-user';saved={...saved,position:12,updatedAt:Date.now()-60000};await page.reload();
    await page.locator('.continue-card').first().click();
    await page.waitForFunction(()=>{const video=document.querySelector('video');return video&&video.currentTime>=12&&video.currentTime<20;});
    assert.equal(await page.locator('vite-error-overlay').count(),0);assert.deepEqual(errors,[]);await context.close();
  }}finally{await browser.close();}
});
