import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';

const browserPath=process.env.CHROMIUM_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const options={skip:!browserPath,timeout:120000};
const defaults={theme:'violet',style:'cinematic',sounds:false,soundStyle:'soft',autoplay:false,autoFallback:true,posterScale:100,combineSources:false,videoEffect:'none',imageProfile:'natural',volumeBoost:100,audioMode:'manual',normalizerTargetDb:-21,preferredVersion:'Lektor',preferredHosts:[],defaultSources:[],defaultDestination:'device'};
const levels={quiet:0.025,normal:0.08,loud:0.3};
const titles={quiet:'Cichy film QA',normal:'Zwykły film QA',loud:'Głośny film QA'};
const ids={quiet:'00000000000000000000000000000051',normal:'00000000000000000000000000000052',loud:'00000000000000000000000000000053'};
let host,base,settings,patches;
function wav(rms){const samples=8000*130,buffer=Buffer.alloc(44+samples*2);buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(8000,24);buffer.writeUInt32LE(16000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(samples*2,40);for(let index=0;index<samples;index++)buffer.writeInt16LE(Math.round(Math.SQRT2*rms*Math.sin(2*Math.PI*400*index/8000)*32767),44+index*2);return buffer;}
const media=Object.fromEntries(Object.entries(levels).map(([key,level])=>[ids[key],wav(level)]));
const movie=key=>({id:ids[key],sourceId:'audio-source',sourceName:'Audio QA',title:titles[key],kind:'movie',url:'http://fixture.invalid/'+key,poster:'',genres:[]});
const source=key=>({id:ids[key],playbackId:ids[key],host:'PCM QA',kind:'mp4',version:'Lektor',quality:'PCM'});
before(async()=>{
  host=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://fixture'),path=url.pathname;
    if(path==='/favicon.ico'||path==='/poster')return res.writeHead(204).end();
    if(path.startsWith('/api/')){
      let value=[],body='';for await(const chunk of req)body+=chunk;
      const key=Object.keys(ids).find(key=>path.includes(ids[key]));
      if(path==='/api/auth/me')value={id:'audio-owner',username:'Audio QA',role:'admin',initial:false};
      else if(path==='/api/settings'){if(req.method==='PATCH'){const patch=JSON.parse(body);patches.push(patch);await new Promise(done=>setTimeout(done,30));Object.assign(settings,patch);}value=settings;}
      else if(path==='/api/sources')value=[{id:'audio-source',name:'Audio QA',type:'http',enabled:true}];
      else if(path==='/api/catalog')value={groups:[{sourceId:'audio-source',sourceName:'Audio QA',items:Object.keys(ids).map(movie),filters:[],pages:[]}],errors:[]};
      else if(key&&path.endsWith('/media')){
        const data=media[ids[key]],match=/bytes=(\d+)-(\d*)/.exec(req.headers.range||''),start=match?Number(match[1]):0,end=match?.[2]?Math.min(Number(match[2]),data.length-1):data.length-1;
        if(start>=data.length)return res.writeHead(416).end();
        res.writeHead(match?206:200,{'Content-Type':'audio/wav','Content-Length':end-start+1,'Accept-Ranges':'bytes',...(match?{'Content-Range':`bytes ${start}-${end}/${data.length}`}:{})});return res.end(data.subarray(start,end+1));
      }else if(key&&path.endsWith('/ready'))value=[source(key)];
      else if(key&&path==='/api/items/'+ids[key])value=movie(key);
      res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(value));
    }
    const file=resolve('dist','.'+(path==='/'?'/index.html':path));if(!file.startsWith(resolve('dist')+'/')&&!file.startsWith(resolve('dist')+'\\'))return res.writeHead(403).end();
    try{res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));}catch{console.error('Missing QA fixture resource: '+path);res.writeHead(404).end();}
  });
  await new Promise(done=>host.listen(0,'127.0.0.1',done));base='http://127.0.0.1:'+host.address().port;
});
after(async()=>{await new Promise(done=>host.close(done));});
async function fixture(browser){
  settings={...defaults};patches=[];
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.addInitScript(()=>{
    window.qaAudioGraphs=[];
    const get=context=>{let graph=window.qaAudioGraphs.find(graph=>graph.context===context);if(!graph){graph={context,sources:0};window.qaAudioGraphs.push(graph);}return graph;};
    const originalGain=AudioContext.prototype.createGain,originalSource=AudioContext.prototype.createMediaElementSource,connect=AudioNode.prototype.connect;
    AudioContext.prototype.createGain=function(){const gain=originalGain.call(this);get(this).gain=gain;return gain;};
    AudioContext.prototype.createMediaElementSource=function(element){const source=originalSource.call(this,element);get(this).sources++;get(this).element=element;return source;};
    AudioNode.prototype.connect=function(destination,...args){const result=connect.call(this,destination,...args);if(destination===this.context.destination){const graph=get(this.context);if(graph.sources){graph.output=this.context.createAnalyser();graph.output.fftSize=2048;connect.call(this,graph.output);}}return result;};
  });
  const page=await context.newPage(),errors=[],warnings=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',entry=>{if(['warning','error'].includes(entry.type()))warnings.push(entry.text());});
  await page.goto(base);await page.getByRole('button',{name:'Zobacz '+titles.quiet,exact:true}).waitFor();
  return {context,page,errors,warnings};
}
async function open(page,key){
  if(await page.getByRole('button',{name:'Zamknij odtwarzacz',exact:true}).count())await page.getByRole('button',{name:'Zamknij odtwarzacz',exact:true}).click();
  if(await page.locator('dialog.modal').getByRole('button',{name:'Zamknij',exact:true}).count())await page.locator('dialog.modal').getByRole('button',{name:'Zamknij',exact:true}).click();
  await page.getByRole('button',{name:'Zobacz '+titles[key],exact:true}).click();await page.locator('.playable-row').getByRole('button',{name:'Odtwórz',exact:true}).click();
  await page.waitForFunction(()=>{const v=document.querySelector('.player-overlay video');return v&&!v.paused&&v.readyState>=2;});
}
async function menu(page){if(!await page.locator('.player-options').count())await page.getByRole('button',{name:'Menu odtwarzacza',exact:true}).click();}
async function gain(page,min,max){await page.waitForFunction(({min,max})=>{const graph=window.qaAudioGraphs.at(-1);return graph?.context.state==='running'&&graph.gain.gain.value>=min&&graph.gain.gain.value<=max;},{min,max},{timeout:16000});}
async function rms(page){return page.evaluate(async()=>{await new Promise(done=>setTimeout(done,180));const meter=window.qaAudioGraphs.at(-1).output,samples=new Float32Array(meter.fftSize);let power=0;for(let count=0;count<5;count++){meter.getFloatTimeDomainData(samples);power+=samples.reduce((sum,value)=>sum+value*value,0)/samples.length;await new Promise(done=>setTimeout(done,40));}return Math.sqrt(power/5);});}

test('Browser manual gain 250/300% changes real decoded PCM and is restored for the next film',options,async()=>{
  const {chromium}=await import('playwright'),browser=await chromium.launch({headless:true,executablePath:browserPath});
  try{const {context,page,errors,warnings}=await fixture(browser);assert.match(await page.title(),/Cinema Hub/);assert.equal(new URL(page.url()).origin,base);
    await open(page,'quiet');await menu(page);
    for(const percent of [250,300]){await page.getByRole('menuitemradio',{name:percent+'%',exact:true}).click();await gain(page,percent/100-0.02,percent/100+0.02);const measured=await rms(page);assert.ok(Math.abs(measured-levels.quiet*percent/100)<0.004,`${percent}% RMS ${measured}, expected ${levels.quiet*percent/100}`);}
    await new Promise(done=>setTimeout(done,100));
    assert.equal(settings.volumeBoost,300);assert.equal(settings.audioMode,'manual');
    assert.equal(await page.evaluate(()=>window.qaAudioGraphs.at(-1).sources),1,'Changing levels reuses one media source');
    await open(page,'normal');await gain(page,2.99,3.01);assert.ok(Math.abs(await rms(page)-levels.normal*3)<0.012);
    await menu(page);assert.equal(await page.getByRole('menuitemradio',{name:'300%',exact:true}).getAttribute('aria-checked'),'true');
    await page.getByRole('menuitemradio',{name:'250%',exact:true}).click();await page.getByRole('menuitemradio',{name:'AUTO',exact:true}).click();await page.getByRole('menuitemradio',{name:'Normalizer',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[aria-label="Normalizer"]').getAttribute('aria-checked')==='true');
    await new Promise(done=>setTimeout(done,250));assert.equal(settings.audioMode,'normalizer');assert.equal(patches.at(-1).audioMode,'normalizer');
    assert.equal(await page.locator('vite-error-overlay').count(),0);assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);await context.close();
  }finally{await browser.close();}
});
test('Browser AUTO adapts both ways and Normalizer matches a selected level without cancelling user volume',options,async()=>{
  const {chromium}=await import('playwright'),browser=await chromium.launch({headless:true,executablePath:browserPath});
  try{const {context,page,errors,warnings}=await fixture(browser);
    await open(page,'quiet');await menu(page);await page.getByRole('menuitemradio',{name:'AUTO',exact:true}).click();await gain(page,2.85,3.01);assert.ok(Math.abs(await rms(page)-0.075)<0.006);
    await open(page,'normal');await gain(page,0.99,1.01);await new Promise(done=>setTimeout(done,500));assert.ok(Math.abs(await rms(page)-0.08)<0.006);
    await open(page,'loud');await gain(page,0.39,0.42);const measured=await rms(page);assert.ok(Math.abs(measured-0.12)<0.008,`Loud AUTO RMS ${measured}, expected 0.12`);
    await menu(page);await page.getByRole('menuitemradio',{name:'Normalizer',exact:true}).click();await page.getByLabel('Poziom Normalizera',{exact:true}).selectOption('-24');await gain(page,0.20,0.22);
    const loud=await rms(page);assert.ok(Math.abs(loud-10**(-24/20))<0.005);assert.equal(settings.normalizerTargetDb,-24);
    if(process.env.QA_SCREENSHOT_DIR){
      await page.getByLabel('Poziom Normalizera',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:resolve(process.env.QA_SCREENSHOT_DIR,'web-audio-normalizer-desktop.png')});
      await page.setViewportSize({width:390,height:844});await page.getByLabel('Poziom Normalizera',{exact:true}).scrollIntoViewIfNeeded();assert.ok(await page.getByLabel('Poziom Normalizera',{exact:true}).isVisible());
      await page.screenshot({path:resolve(process.env.QA_SCREENSHOT_DIR,'web-audio-normalizer-mobile.png')});await page.setViewportSize({width:1280,height:900});
    }
    await page.reload();await open(page,'quiet');await gain(page,2.4,2.6);const quiet=await rms(page);assert.ok(Math.abs(loud-quiet)<0.006,'Different films reach the same selected RMS');
    const before=await page.evaluate(()=>window.qaAudioGraphs.at(-1).gain.gain.value);await page.locator('.player-overlay video').evaluate(video=>{video.volume=0.5;});await new Promise(done=>setTimeout(done,1500));
    const after=await page.evaluate(()=>window.qaAudioGraphs.at(-1).gain.gain.value);assert.ok(Math.abs(before-after)<0.06,'Normalizer must not fight the video volume control');assert.ok(Math.abs(await rms(page)-quiet/2)<0.004);
    await menu(page);assert.equal(await page.getByRole('menuitemradio',{name:'Normalizer',exact:true}).getAttribute('aria-checked'),'true');assert.equal(await page.getByLabel('Poziom Normalizera',{exact:true}).inputValue(),'-24');
    const saved=page.waitForResponse(response=>response.url().endsWith('/api/settings')&&response.request().method()==='PATCH');
    await page.getByRole('menuitemradio',{name:'Normalnie',exact:true}).click();await gain(page,0.99,1.01);await saved;assert.equal(settings.audioMode,'manual');assert.equal(settings.volumeBoost,100);
    assert.equal(await page.locator('vite-error-overlay').count(),0);assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);await context.close();
  }finally{await browser.close();}
});
