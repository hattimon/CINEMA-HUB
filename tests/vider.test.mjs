import test from 'node:test';
import assert from 'node:assert/strict';
import { parseViderCatalog,parseViderDetail,viderURL,isViderVideo } from '../server/vider-parser.mjs';
import { sourceErrorMessage } from '../server/source-errors.mjs';

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
