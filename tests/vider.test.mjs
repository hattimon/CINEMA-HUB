import test from 'node:test';
import assert from 'node:assert/strict';
import { parseViderCatalog,parseViderDetail,viderURL,isViderVideo } from '../server/vider-parser.mjs';
import { sourceErrorMessage } from '../server/source-errors.mjs';
import { browserHeaded } from '../server/browser-mode.mjs';
import { sameTitle,combineCatalog } from '../server/catalog-match.mjs';

const origin='https://vider.info/';
const html=`<title>Folder filmów</title>
<article class="video-item"><a href="/vid/+film123" title="Film testowy"><img src="/poster.jpg"></a><p class="description">Opis filmu</p></article>
<li><a href="/dir/+folder123">Kolejny folder</a></li>
<a href="https://external.invalid/vid/+bad">Reklama</a>
<a href="javascript:alert(1)">Niebezpieczny adres</a>`;

test('Vider reads only trusted Vider videos and directories',()=>{
  const result=parseViderCatalog(html,origin);
  assert.deepEqual(result.items.map(item=>item.url),['https://vider.info/vid/+film123']);
  assert.equal(result.items[0].title,'Film testowy');
  assert.equal(result.items[0].poster,'https://vider.info/poster.jpg');
  assert.deepEqual(result.folders,[{title:'Kolejny folder',path:'dir/+folder123'}]);
  assert.equal(result.items[0].kind,'movie');
  assert.equal(result.filters.length,0);
  assert.equal(parseViderCatalog(html,origin,{query:'inny'}).items.length,0);
  assert.equal(parseViderCatalog(html,origin,{kind:'series'}).items.length,0);
  assert.equal(viderURL('https://external.invalid/vid/+bad',origin),null);
  assert.equal(viderURL('javascript:alert(1)',origin),null);
});

test('Vider follows its info/pl redirect and reads the current card and detail structure',()=>{
  const page='<a id="btnLogout">Wyloguj się</a><div class="overflow"><a href="https://vider.pl/vid/+film123"><span class="badge_curation">Poczekalnia</span><img src="https://img.vider.info/i/film123/cover.png"><span>59:45</span><span class="txt_md">Właściwy tytuł</span></a></div>';
  const catalog=parseViderCatalog(page,origin);
  assert.equal(catalog.loggedIn,true);
  assert.equal(catalog.items[0].title,'Właściwy tytuł');
  assert.equal(catalog.items[0].poster,'https://img.vider.info/i/film123/cover.png');
  assert.equal(catalog.items[0].url,'https://vider.pl/vid/+film123');
  assert.equal(viderURL('https://vider.pl/vid/+film123',origin).hostname,'vider.pl');
  for(const address of ['http://vider.pl/vid/+bad','https://vider.pl:8443/vid/+bad','https://vider.pl.evil.invalid/vid/+bad','https://user:pass@vider.pl/vid/+bad'])assert.equal(viderURL(address,origin),null);
  const detailPage='<h1>Ukryty formularz logowania</h1><div class="video_meta"><h1>Właściwy tytuł</h1></div><div id="file_description_123">Opis materiału</div><a href="/vid/+other">Polecany film</a>';
  const detail=parseViderDetail(detailPage,'https://vider.pl/vid/+film123');
  assert.equal(detail.title,'Właściwy tytuł');
  assert.equal(detail.description,'Opis materiału');
  assert.deepEqual(parseViderCatalog(detailPage,'https://vider.pl/vid/+film123').items.map(i=>i.title),['Właściwy tytuł']);
  assert.equal(parseViderCatalog(detailPage,'https://vider.pl/vid/+film123',{query:'other'}).items.length,0);
});

test('Vider exposes a single playable link for a video page',()=>{
  const url='https://vider.info/vid/+film123';
  assert.equal(isViderVideo(url),true);
  const page='<title>Film testowy</title><meta property="og:description" content="Opis szczegółowy"><video poster="/cover.png" controls></video>';
  const detail=parseViderDetail(page,url);
  assert.equal(detail.title,'Film testowy');
  assert.equal(detail.poster,'https://vider.info/cover.png');
  assert.deepEqual(detail.sources,[{id:'vider-video',host:'Vider',version:'Oryginał',quality:'Automatyczna'}]);
  assert.equal(parseViderCatalog(page,url).items[0].url,url);
  assert.deepEqual(parseViderDetail(page,'https://vider.info/dir/+folder123').sources,[]);
});

test('Vider identifies portal CAPTCHA without following it',()=>{
  const result=parseViderCatalog('<title>Verify you are human</title><div class="g-recaptcha"></div>',origin);
  assert.equal(result.challenge,true);
  assert.equal(result.items.length,0);
  const video='https://vider.info/vid/+film123';
  const blocked='<title>Verify you are human</title><div class="g-recaptcha"></div>';
  assert.equal(parseViderCatalog(blocked,video).items.length,0);
  const details=parseViderDetail(blocked,video);
  assert.equal(details.challenge,true);
  assert.deepEqual(details.sources,[]);
});

test('Vider reads the AJAX catalog separately from account collection menus',()=>{
  const shell='<a href="/dir/+account">Kolekcja główna</a><a id="btnLogout">Wyloguj</a><div id="LoadGeneralContent">Ładowanie…</div>';
  const pending=parseViderCatalog(shell,origin);
  assert.equal(pending.loggedIn,true);
  assert.deepEqual(pending.folders,[]);assert.deepEqual(pending.items,[]);
  const loaded=shell.replace('Ładowanie…','<a href="/vid/+actual"><span class="txt_md">Film z katalogu</span></a><a href="/dir/+child">Podfolder</a>');
  const result=parseViderCatalog(loaded,origin);
  assert.deepEqual(result.items.map(item=>item.title),['Film z katalogu']);
  assert.deepEqual(result.folders,[{title:'Podfolder',path:'dir/+child'}]);
});

test('Vider global search reads real results and zero-based next pages instead of the open collection',()=>{
  const html='<a href="/dir/+account">Kolekcja konta</a><div id="LoadGeneralContent"><ul class="browse_collections"><li><a href="/vid/+unrelated">Inny film</a></li></ul><ul id="search_files_result"><li><a href="/vid/+stargate" title="Stargate 1994"><img data-src="https://img.vider.info/i/stargate/thumb.png"></a><div class="data"><p class="title"><a href="/vid/+stargate">Stargate 1994</a></p><a href="/dir/+movies">Filmy użytkownika</a></div></li><li><a href="/vid/+sg1" title="Stargate SG-1 S01E01">Stargate SG-1 S01E01</a></li></ul><div id="search_pages_1"><span data-href="/search/movies/Stargate/0">Poprzednia</span><span data-href="/search/movies/Stargate/2">Następna</span><span data-href="https://outside.invalid/search/movies/Stargate/99">Reklama</span><span data-href="/search/movies/Other/99">Inne wyszukiwanie</span></div></div>';
  const result=parseViderCatalog(html,origin+'search/movies/Stargate/1',{query:'Stargate'});
  assert.deepEqual(result.items.map(item=>item.title),['Stargate SG-1','Stargate 1994']);
  assert.deepEqual(result.folders,[]);assert.equal(result.currentPage,2);
  assert.deepEqual(result.pages.map(page=>page.page),[1,3]);assert.equal(result.totalPages,undefined);
  assert.match(result.searchScope,/całym serwisie/);
  const last=parseViderCatalog('<div id="LoadGeneralContent"><ul id="search_files_result"><div>Brak wyników wyszukiwania</div></ul></div>',origin+'search/movies/Stargate/2',{query:'Stargate'});
  assert.deepEqual(last.items,[]);assert.equal(last.totalPages,3);
});

test('Source diagnostics distinguish DNS, unreachable LAN and manual CAPTCHA',()=>{
  for(const error of [{code:'ENOTFOUND'},{cause:{code:'EAI_AGAIN'}},{message:'page.goto: net::ERR_NAME_NOT_RESOLVED at https://secret.invalid/'}])assert.match(sourceErrorMessage(error,{type:'vider'}),/DNS/);
  assert.match(sourceErrorMessage({code:'ETIMEDOUT'},{type:'przystan'}),/między sieciami/);
  assert.match(sourceErrorMessage({status:409,message:'Otwórz ręczne logowanie / CAPTCHA.'},{type:'filman'}),/CAPTCHA/);
  assert.equal(sourceErrorMessage(new Error('password=private https://private.invalid'),{type:'http'}).includes('private'),false);
});

test('Vider collection cards do not turn comment links into movie titles',()=>{
  const page='<div id="LoadGeneralContent"><ul class="browse_collections"><li><a href="/vid/+film"><span class="txt_md">Tytuł filmu</span></a></li></ul><div class="comments"><a href="/vid/+film">Polecam</a><a href="/vid/+other">Komentarz o filmie</a></div></div>';
  assert.deepEqual(parseViderCatalog(page,origin).items.map(item=>item.title),['Tytuł filmu']);
});

test('Background portal browsers cannot cover another source manual login',()=>{
  const display={DISPLAY:':99'};
  assert.equal(browserHeaded('vider',false,display),false);
  assert.equal(browserHeaded('filman',false,display),false);
  assert.equal(browserHeaded('vider',true,display),true);
  assert.equal(browserHeaded('vider',false,{...display,BROWSER_SERIAL:'true'}),true);
  assert.equal(browserHeaded('vider',false,{BROWSER_SERIAL:'true'}),false);
  assert.equal(browserHeaded('http',false,{...display,BROWSER_SERIAL:'true'}),false);
});

test('Vider groups numbered episodes, separates films and leaves miscellaneous uploads last',()=>{
  const page=['Stargate SG-1 S02E18 Lektor','Stargate SG-1 2x17','Film fabularny 2024','Kot na balkonie'].map((title,index)=>`<article><a href="/vid/+item${index}" title="${title}">${title}</a></article>`).join('');
  const all=parseViderCatalog(page,origin);assert.deepEqual(all.items.map(item=>item.kind),['series','movie','video']);
  const series=parseViderCatalog(page,origin,{kind:'series'}).items;assert.equal(series.length,1);assert.equal(series[0].title,'Stargate SG-1');assert.deepEqual(series[0].episodes.map(e=>[e.season,e.number]),[[2,17],[2,18]]);
  assert.deepEqual(parseViderCatalog(page,origin,{kind:'movies'}).items.map(item=>item.title),['Film fabularny 2024']);
});

test('Cross-source titles use exact aliases and compatible years, not loose substrings',()=>{
  assert.equal(sameTitle({title:'Gwiezdne wrota / Stargate SG-1',kind:'series',year:1997},{title:'Stargate SG-1',kind:'series'}),true);
  assert.equal(sameTitle({title:'Dune',kind:'movie',year:1984},{title:'Dune 2021 1080p Lektor PL',kind:'movie',year:2021}),false);
  assert.equal(sameTitle({title:'Alien',kind:'movie'},{title:'Alien Covenant',kind:'movie'}),false);
  const groups=[{sourceId:'filman',items:[{id:'one',title:'Film 2024',kind:'movie',year:2024}]},{sourceId:'vider',sourceName:'Vider',items:[{id:'two',sourceId:'vider',title:'Film 2024 Lektor',kind:'movie',year:2024}]}];
  const merged=combineCatalog(groups,new Map([['filman','filman'],['vider','vider']]));assert.equal(merged[1].items.length,0);assert.equal(merged[0].items[0].alternateSources[0].sourceId,'vider');
});
