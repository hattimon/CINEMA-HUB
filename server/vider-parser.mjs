import { load } from 'cheerio';
import { classifyVider,organizeVider } from './catalog-match.mjs';

// Vider is a video / directory host. Its /vid/ and /dir/ routes are not
// interchangeable with Filman's film and series catalog.
const videoPath=/^\/vid\/[+a-z0-9_-]+\/?$/i;
const directoryPath=/^\/dir\/[+a-z0-9_-]+\/?$/i;
const clean=text=>String(text||'').replace(/\s+/g,' ').trim();

export function isViderOrigin(url) {
  return url.protocol==='https:'&&/^(www\.)?vider\.(?:info|pl)$/.test(url.hostname)&&!url.port;
}

export function viderURL(address,base) {
  try {
    const url=new URL(address,base),origin=new URL(base);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;
    if(url.origin!==origin.origin&&!(isViderOrigin(url)&&isViderOrigin(origin)))return null;
    url.hash='';return url;
  }catch{return null;}
}

function posterURL(address,base) {
  const local=viderURL(address,base);if(local)return local.href;
  try {
    const url=new URL(address,base);
    return isViderOrigin(new URL(base))&&url.protocol==='https:'&&url.hostname==='img.vider.info'&&!url.port&&!url.username&&!url.password?url.href:'';
  }catch{return '';}
}

export function isViderVideo(url) {return videoPath.test(new URL(url).pathname);}

export function parseViderCatalog(html,base,{query='',kind='all'}={}) {
  const $=load(html),items=[],folders=[],seen=new Set();
  const challenge=/captcha|cloudflare|verify you are human|weryfikacj.{0,15}człowieka/i.test($('title').text())||
    !!$('iframe[src*="captcha"],.g-recaptcha,[data-sitekey],#cf-challenge-running').length;
  // Account menus also contain /dir/ links while the AJAX catalog is loading.
  const main=$('#LoadGeneralContent').length?$('#LoadGeneralContent'):$.root();
  const collections=main.find('.browse_collections');
  const listing=collections.length?collections:main;
  listing.find('a[href]').each((_,element)=>{
    const anchor=$(element),url=viderURL(anchor.attr('href'),base);if(!url||seen.has(url.href))return;
    const isVideo=videoPath.test(url.pathname),isDir=directoryPath.test(url.pathname);
    if(!isVideo&&!isDir)return;
    const card=anchor.closest('article,li,.item,.video,.video-item,.video-box,.file,.entry,.card');
    const title=clean(anchor.attr('title')||anchor.attr('aria-label')||anchor.find('.txt_md,.txt_sm').first().text()||card.find('h1,h2,h3,.title,.name').first().text()||anchor.find('img').first().attr('alt')||anchor.text())||
      decodeURIComponent(url.pathname.split('/').filter(Boolean).pop()||'Wideo');
    if(query&&!title.toLowerCase().includes(query.toLowerCase()))return;
    seen.add(url.href);
    if(isDir){folders.push({title,path:url.pathname.replace(/^\//,'')});return;}
    const poster=anchor.find('img').first().attr('data-src')||anchor.find('img').first().attr('src')||card.find('img').first().attr('data-src')||card.find('img').first().attr('src')||'';
    const time=/\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/.exec(anchor.text());
    const seconds=time?Number(time[1]||0)*3600+Number(time[2])*60+Number(time[3]):0;
    const classification=classifyVider(title,'',seconds);
    items.push({url:url.href,title,kind:classification.kind,poster:poster?posterURL(poster,base):'',description:clean(card.find('.description,.desc,.summary').first().text()),rating:null,ratingScale:10,year:classification.year});
  });
  const loggedIn=!!$('#btnLogout,a[href*="logout"],a[href*="wyloguj"],form[action*="logout"]').length;
  if(videoPath.test(new URL(base).pathname)){
    items.length=0;folders.length=0;
    if(!challenge){
      const detail=parseViderDetail(html,base);
      if(!query||detail.title.toLowerCase().includes(query.toLowerCase()))items.push({url:base,title:detail.title,kind:detail.kind,poster:detail.poster,description:detail.description,rating:null,ratingScale:10,year:detail.year});
    }
  }
  return {items:organizeVider(items,base,kind),folders,filters:[],pages:[],challenge,loggedIn,searchScope:query?'Vider: wyszukiwanie w aktualnie otwartym katalogu.':''};
}

export function parseViderDetail(html,url) {
  const $=load(html);
  const challenge=/captcha|cloudflare|verify you are human|weryfikacj.{0,15}człowieka/i.test($('title').text())||
    !!$('iframe[src*="captcha"],.g-recaptcha,[data-sitekey],#cf-challenge-running').length;
  const title=clean($('.video_meta h1').first().text()||$('meta[property="og:title"]').attr('content')||$('h1').not('.modal h1').first().text()||$('title').text())||'Wideo Vider';
  const description=clean($('[id^="file_description_"]').first().text()||$('meta[property="og:description"]').attr('content')||$('.description,.video-description,#description').first().text());
  const posterAddress=$('meta[property="og:image"]').attr('content')||$('video').first().attr('poster')||'';
  const poster=posterAddress?posterURL(posterAddress,url):'';
  const sources=!challenge&&isViderVideo(url)?[{id:'vider-video',host:'Vider',version:'Oryginał',quality:'Automatyczna'}]:[];
  const classification=classifyVider(title,description);
  return {title,description,poster,kind:classification.kind,rating:null,ratingScale:10,year:classification.year,episodes:[],sources,challenge};
}
