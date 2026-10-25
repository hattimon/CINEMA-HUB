import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';

let server,base;
before(async()=>{
  server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://fixture').pathname;
    const file=resolve('dist','.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(resolve('dist')+'/')&&!file.startsWith(resolve('dist')+'\\'))return res.writeHead(403).end();
    try{res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await new Promise(done=>server.close(done));});
const browserPath=process.env.CHROMIUM_PATH||(['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync));
const browserTest={skip:!browserPath,timeout:90000};
const filters=[{key:'category',label:'Gatunek',multiple:true,options:[{value:'12',label:'Dramat'}]},{key:'sort',label:'Sortowanie',multiple:false,options:[{value:'rate',label:'Ocena'}]}];
async function fixture(browser,{mode='native',viewport={width:1280,height:720},tv=true,languageSelection=true,deviceLanguage='pl-PL'}={}){
  const context=await browser.newContext({viewport,userAgent:tv?'CinemaHubTV/1.3.9 Test':'Cinema Hub browser test'});
  const requests=[],errors=[],warnings=[];
  if(mode!=='browser')await context.addInitScript(({mode,languageSelection,deviceLanguage})=>{
    const listeners=new Set();
    window.voiceFixture={messages:[],emit(data){for(const listener of listeners)listener({data:typeof data==='string'?data:JSON.stringify(data)});},listeners};
    window.CinemaNative={postMessage(message){const data=JSON.parse(message);window.voiceFixture.messages.push(data);if(mode==='native'&&data.type==='voice_search_capabilities')queueMicrotask(()=>window.voiceFixture.emit({type:data.type,requestId:data.requestId,supported:true,available:true,...(languageSelection?{languageSelection:true,defaultLanguage:deviceLanguage}:{})}));},addEventListener(type,listener){if(type==='message')listeners.add(listener);},removeEventListener(type,listener){listeners.delete(listener);}};
  },{mode,languageSelection,deviceLanguage});
  await context.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;let value=[];
    if(path==='/api/auth/me')value={id:'voice-user',username:'voice',role:'user',initial:false};
    else if(path==='/api/settings')value={theme:'violet',style:'cinematic',sounds:false,defaultSources:['voice-source'],preferredHosts:[],defaultDestination:'device'};
    else if(path==='/api/sources')value=[{id:'voice-source',name:'Fixture',type:'filman',enabled:true}];
    else if(path==='/api/catalog'){
      const body=route.request().postDataJSON();requests.push(body);
      value={groups:[{sourceId:'voice-source',sourceName:'Fixture',items:[],filters,pages:[{page:1,label:'1'},{page:2,label:'2'}],currentPage:body.page,totalPages:2}],errors:[]};
    }
    return route.fulfill({json:value});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('console',entry=>{if(['warning','error'].includes(entry.type()))warnings.push(entry.text());});
  await page.goto(base);await page.getByPlaceholder('Szukaj filmów i seriali').waitFor();
  if(mode==='native')await page.getByRole('button',{name:'Wyszukaj głosowo',exact:true}).waitFor();
  await page.waitForLoadState('networkidle');
  return {context,page,requests,errors,warnings};
}
async function emit(page,data){await page.evaluate(data=>window.voiceFixture.emit(data),data);}
async function recognizedSearch(page,message,text){
  // React renders the heading before its catalog effect sends the request.
  const searched=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/catalog'&&response.request().method()==='POST'&&response.request().postDataJSON().query===text.replace(/[\u0000-\u001f\u007f\s]+/g,' ').trim());
  await emit(page,{type:'voice_search_result',requestId:message.requestId,text});await searched;
}
async function start(page){await page.getByRole('button',{name:'Wyszukaj głosowo',exact:true}).click();await page.getByRole('dialog').waitFor();return page.evaluate(()=>window.voiceFixture.messages.filter(m=>m.type==='voice_search_start').at(-1));}

test('Voice result uses the catalog search, preserves filters/source/sort and resets the page',browserTest,async()=>{
  const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true,executablePath:browserPath});
  try{for(const viewport of [{width:1280,height:720},{width:390,height:844}]){
    const {context,page,requests,errors,warnings}=await fixture(browser,{viewport});
    assert.equal(new URL(page.url()).origin,base);assert.match(await page.title(),/Cinema Hub/);
    await page.getByRole('button',{name:'Filtry',exact:true}).click();await page.getByText('Dramat',{exact:true}).click();await page.getByRole('button',{name:'Zastosuj filtry'}).click();
    await page.getByLabel('Sortowanie').selectOption('rate');
    await page.getByRole('button',{name:'Następna',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.pagination input')?.value==='2');
    const message=await start(page);assert.match(message.requestId,/^[a-f0-9]{32}$/);
    const count=requests.length;
    await emit(page,{type:'voice_search_result',requestId:'stale',text:'Zły wynik'});assert.equal(await page.getByRole('dialog').count(),1);
    await emit(page,'{invalid json');await emit(page,null);await emit(page,{type:'progress',playbackId:'player'});
    await recognizedSearch(page,message,'  Pingwiny z\nMadagaskaru  ');
    await page.getByRole('heading',{name:'Wyniki: Pingwiny z Madagaskaru'}).waitFor();
    await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
    assert.equal(await page.getByPlaceholder('Szukaj filmów i seriali').inputValue(),'Pingwiny z Madagaskaru');
    assert.ok(requests.length>count);const search=requests.at(-1);
    assert.equal(search.query,'Pingwiny z Madagaskaru');assert.equal(search.page,1);assert.deepEqual(search.sources,['voice-source']);assert.deepEqual(search.filters,{category:['12'],sort:['rate']});
    await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Wyszukaj głosowo');
    await emit(page,{type:'voice_search_result',requestId:message.requestId,text:'Duplikat'});assert.equal(await page.getByPlaceholder('Szukaj filmów i seriali').inputValue(),'Pingwiny z Madagaskaru');
    assert.equal(await page.locator('vite-error-overlay').count(),0);assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
    if(process.env.QA_SCREENSHOT_DIR)await page.screenshot({path:resolve(process.env.QA_SCREENSHOT_DIR,`voice-search-result-${viewport.width}.png`)});
    await context.close();
  }}finally{await browser.close();}
});

test('TV D-pad reaches microphone; OK starts once; Back cancels and discards late results',browserTest,async()=>{
  const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true,executablePath:browserPath});
  try{
    const {context,page,requests,errors}=await fixture(browser);
    const input=page.getByPlaceholder('Szukaj filmów i seriali');await input.fill('Tekst ręczny');
    await page.evaluate(()=>{const input=document.querySelector('.search-box input');input.focus();input.setSelectionRange(input.value.length,input.value.length);window.CinemaHubTV.key('ArrowRight');});
    const mic=page.getByRole('button',{name:'Wyszukaj głosowo',exact:true});assert.equal(await mic.evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Enter');await page.getByRole('dialog').waitFor();
    assert.equal(await page.evaluate(()=>window.CinemaHubVoice.start()),false);
    const message=await page.evaluate(()=>window.voiceFixture.messages.filter(m=>m.type==='voice_search_start').at(-1));
    assert.equal(await page.evaluate(()=>window.voiceFixture.messages.filter(m=>m.type==='voice_search_start').length),1);
    const count=requests.length;await page.evaluate(()=>window.CinemaHubTV.back());await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
    assert.equal(await page.evaluate(id=>window.voiceFixture.messages.some(m=>m.type==='voice_search_cancel'&&m.requestId===id),message.requestId),true);
    await emit(page,{type:'voice_search_result',requestId:message.requestId,text:'Spóźniony film'});assert.equal(await input.inputValue(),'Tekst ręczny');assert.equal(requests.length,count);
    // Let the cancelled dialog finish restoring focus before sending the next remote key.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
    assert.equal(await mic.evaluate(el=>el===document.activeElement),true);
    const languageButton=page.getByRole('button',{name:'Język wyszukiwania głosowego',exact:true});
    await mic.focus();await page.keyboard.press('ArrowRight');assert.equal(await languageButton.evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('button',{name:'Szukaj',exact:true}).evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('ArrowLeft');assert.equal(await languageButton.evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('ArrowLeft');assert.equal(await mic.evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('ArrowLeft');assert.equal(await input.evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('ArrowDown');assert.equal(await input.evaluate(el=>el===document.activeElement),false);
    await mic.click();const next=await page.evaluate(()=>window.voiceFixture.messages.filter(m=>m.type==='voice_search_start').at(-1));assert.notEqual(next.requestId,message.requestId);
    await emit(page,{type:'voice_search_cancelled',requestId:next.requestId});await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert.deepEqual(errors,[]);await context.close();
  }finally{await browser.close();}
});

test('Voice diagnostics cover permission, service, audio, network and empty results; retry uses direct recognizer',browserTest,async()=>{
  const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true,executablePath:browserPath});
  try{
    const {context,page,requests,errors}=await fixture(browser);
    for(const [code,expected] of [['permission_denied','Brak zgody'],['unavailable','Rozpoznawanie i synteza mowy'],['audio','nie udostępnił dźwięku'],['network','błąd sieci'],['no_match','Nie rozpoznano'],['no_speech','Nie wykryto'],['timeout','Przekroczono'],['busy','zajęta'],['language','wybranego języka'],['invalid_language','Nieprawidłowy kod'],['server','nie odpowiedziała']]){
      const count=requests.length,message=await start(page);await emit(page,{type:'voice_search_error',requestId:message.requestId,code});
      assert.match(await page.getByRole('alert').innerText(),new RegExp(expected));assert.equal(requests.length,count);
      if(code==='audio'&&process.env.QA_SCREENSHOT_DIR)await page.screenshot({path:resolve(process.env.QA_SCREENSHOT_DIR,'voice-search-audio-diagnostic.png')});
      await page.getByRole('button',{name:'Zamknij',exact:true}).last().click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
    }
    let message=await start(page);await emit(page,{type:'voice_search_result',requestId:message.requestId,text:' '.repeat(10)});assert.match(await page.getByRole('alert').innerText(),/Nie rozpoznano/);
    await page.getByRole('button',{name:'Spróbuj ponownie'}).click();await page.getByRole('status').waitFor();
    message=await page.evaluate(()=>window.voiceFixture.messages.filter(m=>m.type==='voice_search_start').at(-1));assert.equal(message.direct,true);
    await emit(page,{type:'voice_search_result',requestId:message.requestId,text:'<img src=x onerror=alert(1)> "Film"'});
    await page.getByRole('heading',{name:'Wyniki: <img src=x onerror=alert(1)> "Film"'}).waitFor();assert.equal(await page.locator('h1 img').count(),0);
    message=await start(page);await page.evaluate(()=>document.querySelector('dialog').close()); // Simulate removal followed by account/navigation unmount.
    await page.getByRole('button',{name:'Ustawienia',exact:true}).click();
    assert.equal(await page.evaluate(id=>window.voiceFixture.messages.some(m=>m.type==='voice_search_cancel'&&m.requestId===id),message.requestId),true);
    assert.equal(await page.evaluate(()=>window.voiceFixture.listeners.size),0);assert.deepEqual(errors,[]);await context.close();
  }finally{await browser.close();}
});

test('Browser and older Android clients retain ordinary typed search without unsupported microphone controls',browserTest,async()=>{
  const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true,executablePath:browserPath});
  try{for(const mode of ['browser','legacy']){
    const {context,page,requests,errors}=await fixture(browser,{mode,tv:false});
    assert.equal(await page.getByRole('button',{name:'Wyszukaj głosowo',exact:true}).count(),0);
    await page.getByPlaceholder('Szukaj filmów i seriali').fill('Film ręczny');await page.getByRole('button',{name:'Szukaj',exact:true}).click();
    await page.getByRole('heading',{name:'Wyniki: Film ręczny'}).waitFor();assert.equal(requests.at(-1).query,'Film ręczny');assert.deepEqual(errors,[]);await context.close();
  }}finally{await browser.close();}
});

test('Speech language follows device or a persisted explicit choice and supports international titles',browserTest,async()=>{
  const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true,executablePath:browserPath});
  try{for(const viewport of [{width:1280,height:720},{width:390,height:844}]){
    const {context,page,requests,errors,warnings}=await fixture(browser,{viewport,deviceLanguage:'en-GB'});
    const languageButton=page.getByRole('button',{name:'Język wyszukiwania głosowego',exact:true});
    const choose=async language=>{await languageButton.click();const select=page.getByLabel('Język rozpoznawania / Speech language');await select.selectOption(language);await page.getByRole('button',{name:'Zapisz / Save',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));};
    assert.equal(await languageButton.getAttribute('title'),'Język: English (UK)');
    await choose('en-US');assert.equal(await page.evaluate(()=>window.voiceFixture.messages.filter(m=>m.type==='voice_search_start').length),0,'Choosing language does not activate microphone');
    let message=await start(page);assert.equal(message.language,'en-US');await recognizedSearch(page,message,'The Lord of the Rings');
    await page.getByRole('heading',{name:'Wyniki: The Lord of the Rings'}).waitFor();assert.equal(requests.at(-1).query,'The Lord of the Rings');
    await page.reload();await languageButton.waitFor();assert.equal(await languageButton.getAttribute('title'),'Język: English (US)');
    assert.equal(await page.evaluate(()=>window.CinemaHubVoice.start()),true);message=await page.evaluate(()=>window.voiceFixture.messages.filter(m=>m.type==='voice_search_start').at(-1));assert.equal(message.language,'en-US','Remote shortcut uses saved choice');
    await emit(page,{type:'voice_search_cancelled',requestId:message.requestId});await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
    for(const [language,title] of [['de-DE','Das Leben der Anderen'],['ja-JP','千と千尋の神隠し'],['ar-SA','حكاية لعبة']]){
      await choose(language);message=await start(page);assert.equal(message.language,language);await recognizedSearch(page,message,title);
      await page.getByRole('heading',{name:'Wyniki: '+title}).waitFor();assert.equal(requests.at(-1).query,title);
    }
    await languageButton.click();await page.getByLabel('Język rozpoznawania / Speech language').selectOption('custom');
    const custom=page.getByLabel('Kod języka / Language tag');await custom.fill('en_US');await page.getByRole('button',{name:'Zapisz / Save',exact:true}).click();assert.match(await page.getByRole('alert').innerText(),/Nieprawidłowy kod/);
    await custom.fill('zh-Hant-TW');await page.getByRole('button',{name:'Zapisz / Save',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
    message=await start(page);assert.equal(message.language,'zh-Hant-TW');await emit(page,{type:'voice_search_cancelled',requestId:message.requestId});await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
    await choose('system');message=await start(page);assert.equal(message.language,'system');assert.match(await page.getByRole('dialog').innerText(),/English \(UK\).*en-GB/);
    await emit(page,{type:'voice_search_cancelled',requestId:message.requestId});await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
    assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);assert.equal(await page.locator('vite-error-overlay').count(),0);
    if(process.env.QA_SCREENSHOT_DIR){await languageButton.click();await page.screenshot({path:resolve(process.env.QA_SCREENSHOT_DIR,`voice-languages-${viewport.width}.png`)});}
    await context.close();
  }}finally{await browser.close();}
});

test('A previous voice-enabled APK is not advertised as supporting language selection',browserTest,async()=>{
  const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true,executablePath:browserPath});
  try{const {context,page,errors}=await fixture(browser,{languageSelection:false});
    assert.equal(await page.getByRole('button',{name:'Język wyszukiwania głosowego',exact:true}).count(),0);
    const message=await start(page);assert.equal(message.language,undefined);assert.match(await page.getByRole('dialog').innerText(),/Polski.*pl-PL/);
    await emit(page,{type:'voice_search_cancelled',requestId:message.requestId});assert.deepEqual(errors,[]);await context.close();
  }finally{await browser.close();}
});
