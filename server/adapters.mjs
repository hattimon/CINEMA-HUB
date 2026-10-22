import { load } from 'cheerio';
import { sourceBrowser } from './browser.mjs';
import { parseCatalog,parseDetail,buildFilterURL } from './filman-parser.mjs';
import { parseViderCatalog,parseViderDetail,viderURL } from './vider-parser.mjs';
import { textRequest,basicHeaders,sameSourceURL,verifyMedia,networkURL } from './net.mjs';
import { remoteList,safePath } from './rclone.mjs';
const videoFile=/\.(?:mp4|m4v|webm|mkv|mov|avi|m3u8)(?:[?#]|$)/i;
const fileItem=(url,title,extra={})=>({url,title:title.replace(/\.(mp4|m4v|webm|mkv|mov|avi|m3u8)$/i,''),kind:'movie',poster:'',description:'',rating:null,ratingScale:10,year:null,...extra});
const credentialsHeaders=source=>({...basicHeaders(source.credentials),...(source.type==='plex'&&source.credentials.token?{'X-Plex-Token':source.credentials.token}:{})});
const schemas=new Map();
export function matchesFilters(item,filters,schema) {
  for(const [key,values] of Object.entries(filters)) {
    if(!values.length||key==='sort')continue;
    if(key==='year'&&!values.includes(String(item.year)))return false;
    if(['category','country'].includes(key)&&!values.some(v=>item.filterIds?.[key]?.includes(v)))return false;
    if(['quality','version'].includes(key)) {
      const labels=(schema.find(f=>f.key===key)?.options||[]).filter(o=>values.includes(o.value)).map(o=>o.label.toLowerCase().replace(/[\s_]/g,''));
      if(!item.sources?.some(s=>labels.includes(String(s[key]||'').toLowerCase().replace(/[\s_]/g,''))))return false;
    }
  }return true;
}
export async function przystanEntries(source,folder='') {
  const path=safePath(folder).replace(/\/$/,'');
  const url=new URL('api/list',source.url);
  url.searchParams.set('path',path);
  const data=JSON.parse(await textRequest(url.href,{headers:credentialsHeaders(source),allowedOrigins:[networkURL(source.url).origin]}));
  if(!Array.isArray(data.entries))throw new Error('Przystań zwróciła nieprawidłową listę plików.');
  if(data.entries.length>3000)throw new Error('Folder Przystani zawiera zbyt wiele plików. Wybierz węższy katalog.');
  const entries=data.entries.filter(e=>e&&['folder','video'].includes(e.kind)&&typeof e.name==='string'&&typeof e.path==='string').map(e=>{
    const child=safePath(e.path).replace(/\/$/,'');
    if(!child||child==='.'||path&&child!==path&&!child.startsWith(path+'/'))throw new Error('Przystań zwróciła plik poza wybranym folderem.');
    return {...e,path:child};
  }).filter(e=>{
    // The API lists direct children. Ignore accidentally flattened descendants to
    // avoid showing duplicates in the root and again during recursive traversal.
    const relative=path?e.path.slice(path.length+1):e.path;
    return relative!==''&&!relative.includes('/');
  });
  return {path,entries};
}

export async function catalog(source,{kind='all',filters={},page=1,query='',folder=''}={}) {
  if(source.type==='vider') {
    // A Vider source may point to the home page or directly to a shared directory.
    // Only explicit /dir/... child routes can be opened through the folder selector.
    if(folder&&!/^dir\/[+a-z0-9_-]+\/?$/i.test(folder))throw new Error('Nieprawidłowy katalog Vider.');
    const url=query?viderURL('/search/movies/'+encodeURIComponent(query)+'/'+(page-1),source.url)?.href:folder?viderURL('/'+folder,source.url)?.href:source.url;
    if(!url)throw new Error('Katalog wykracza poza źródło Vider.');
    const html=await sourceBrowser.html(source,url);
    const parsed=parseViderCatalog(html,url,{kind,query});
    if(page>1&&!query)return {...parsed,items:[],folders:[],searchScope:'Vider: odczytywana jest tylko bieżąca strona katalogu.'};
    if((parsed.challenge||/<title[^>]*>[^<]*(?:404|not found|nie znaleziono)/i.test(html))&&!parsed.items.length&&!parsed.folders.length)throw Object.assign(new Error('Vider nie udostępnił katalogu. Otwórz ręczne logowanie / CAPTCHA w ustawieniach i sprawdź adres źródła.'),{status:409});
    return parsed;
  }
  if(source.type==='filman') {
    const cacheKey=source.id+':'+(kind==='series'?'series':'movies');let entry=schemas.get(cacheKey),first;
    const baseRoute=new URL(kind==='series'?'seriale/':kind==='children'?'dla-dzieci-pl/':'filmy/',source.url).href;
    const initialRoute=kind==='all'&&!query&&!Object.values(filters).some(v=>v?.length)&&page===1?source.url:baseRoute;
    if(!entry||entry.expires<Date.now()){first=await sourceBrowser.html(source,initialRoute);const parsed=parseCatalog(first,initialRoute);if(parsed.challenge)return parsed;const filters=parsed.filters.length||initialRoute===baseRoute?parsed.filters:parseCatalog(await sourceBrowser.html(source,baseRoute),baseRoute).filters;entry={schema:filters,expires:Date.now()+3600000};schemas.set(cacheKey,entry);}const schema=entry.schema;
    const hasFilters=Object.values(filters).some(v=>v?.length);let url=kind==='all'&&!query&&!hasFilters&&page===1?source.url:buildFilterURL(source.url,kind,filters,page,schema);
    let html;
    if(query) {
      buildFilterURL(source.url,kind,filters,page,schema);
      // Use the portal's full search form, rather than its autocomplete fragment.
      const searchURL=new URL('search',source.url);searchURL.searchParams.set('phrase',query);if(page>1)searchURL.searchParams.set('page',String(page));
      const result=parseCatalog(await sourceBrowser.html(source,searchURL.href),searchURL.href,{includeRecommendations:false,searchResults:true});
      if(result.requiresLogin)throw Object.assign(new Error('Sesja Filman wygasła. Otwórz logowanie / CAPTCHA w ustawieniach źródła i zaloguj się ponownie.'),{status:409,requiresAction:true});
      let items=result.items.filter(i=>kind==='all'||i.kind===(kind==='series'?'series':'movie'));
      // Search the portal before applying the selected media type and metadata.
      if(hasFilters) {const full=[];for(const item of items){const d=await detail(source,item);if(matchesFilters(d,filters,schema))full.push(d);}items=full;}
      const order=filters.sort?.[0];if(['rate','filmweb'].includes(order))items.sort((a,b)=>(order==='filmweb'?b.imdb:b.rating||0)-(order==='filmweb'?a.imdb:a.rating||0));if(order==='premiere')items.sort((a,b)=>(b.year||0)-(a.year||0));
      return {...result,items,filters:schema};
    }
    html=url===initialRoute&&first?first:await sourceBrowser.html(source,url);
    const result=parseCatalog(html,url,{includeRecommendations:kind==='all'});
    if(kind==='all'&&page===1&&!hasFilters){
      const seriesRoute=new URL('seriale/',source.url).href;
      try{
        const series=parseCatalog(await sourceBrowser.html(source,seriesRoute),seriesRoute);
        result.recommendations=[...new Map([...result.recommendations,...series.recommendations].map(item=>[item.url,item])).values()];
      }catch{/* Optional recommendations must not hide an otherwise available catalog. */}
    }
    return {...result,filters:schema};
  }
  if(source.type==='plex') {
    const headers=credentialsHeaders(source),allowedOrigins=[networkURL(source.url).origin];
    const sections=load(await textRequest(new URL('library/sections',source.url).href,{headers,allowedOrigins}),{xml:true});const items=[];
    for(const dir of sections('Directory').toArray()) {const d=sections(dir);if(!['movie','show'].includes(d.attr('type')))continue;if(kind==='series'&&d.attr('type')!=='show'||kind==='movies'&&d.attr('type')!=='movie')continue;
      const u=new URL(`library/sections/${d.attr('key')}/all`,source.url);if(query)u.searchParams.set('title',query);u.searchParams.set('X-Plex-Container-Start',String((page-1)*60));u.searchParams.set('X-Plex-Container-Size','60');const $=load(await textRequest(u.href,{headers,allowedOrigins}),{xml:true});
      $('Video,Directory[type="show"]').each((_,el)=>{const a=$(el);items.push({url:new URL(`library/metadata/${a.attr('ratingKey')}`,source.url).href,title:a.attr('title')||'Bez tytułu',kind:a.attr('type')==='show'?'series':'movie',poster:a.attr('thumb')?new URL(a.attr('thumb'),source.url).href:'',description:a.attr('summary')||'',year:Number(a.attr('year'))||null,rating:Number(a.attr('rating'))||null,ratingScale:10,genres:a.find('Genre').map((_,g)=>$(g).attr('tag')).get()});});
    }return {items,filters:[],pages:items.length>=60?[{page:page+1,label:'Następna'}]:[],loggedIn:true};
  }
  if(source.type==='przystan') {
    const root=safePath(source.options?.startFolder||'').replace(/\/$/,'');
    const current=safePath(folder||root).replace(/\/$/,'');
    if(root&&current!==root&&!current.startsWith(root+'/'))throw new Error('Folder wykracza poza katalog początkowy Przystani.');
    const recursive=source.options?.recursive!==false;
    const pending=[{path:current,depth:0}],seen=new Set(),items=[],folders=[];
    while(pending.length) {
      if(seen.size>=60||items.length>=1500)throw new Error('Limit skanowania Przystani. Wybierz węższy katalog początkowy.');
      const next=pending.shift();
      if(seen.has(next.path))continue;
      seen.add(next.path);
      const result=await przystanEntries(source,next.path);
      for(const entry of result.entries) {
        if(entry.kind==='video') {
          const media=new URL('media',source.url);
          media.searchParams.set('path',entry.path);
          const item=fileItem(media.href,entry.name,{bytes:entry.size});
          items.push({...item,sources:[{id:'file',host:source.name,version:'Oryginał',quality:'Oryginał',url:item.url,bytes:item.bytes}]});
        } else if(entry.kind==='folder'&&entry.path!==next.path) {
          if(next.depth===0)folders.push({title:entry.name,path:entry.path});
          if(recursive&&next.depth<8&&!seen.has(entry.path))pending.push({path:entry.path,depth:next.depth+1});
        }
      }
    }
    return {items:kind==='series'?[]:items.filter(i=>!query||i.title.toLowerCase().includes(query.toLowerCase())),folders,filters:[],pages:[],searchScope:recursive?'Przystań: filmy z katalogu początkowego i podfolderów.':undefined};
  }
  if(source.type==='http') {
    const base=new URL(folder?safePath(folder).replace(/\/?$/,'/'):'./',source.url).href;const $=load(await textRequest(base,{headers:credentialsHeaders(source),allowedOrigins:[networkURL(source.url).origin]}));const items=[],folders=[];
    $('a[href]').each((_,a)=>{let url;try{url=sameSourceURL(new URL($(a).attr('href'),base).href,source.url);}catch{return;}const u=new URL(url);if(!u.pathname.startsWith(new URL(source.url).pathname)||url===base)return;const title=$(a).text().trim()||decodeURIComponent(u.pathname.split('/').pop());if(u.pathname.endsWith('/'))folders.push({title,path:decodeURIComponent(u.pathname.slice(new URL(source.url).pathname.length))});else if(videoFile.test(u.pathname))items.push(fileItem(url,title));});return {items:items.filter(i=>!query||i.title.toLowerCase().includes(query.toLowerCase())),folders,filters:[],pages:[]};
  }
  if(['ftp','webdav','s3'].includes(source.type)) {const {list}=await remoteList(source,folder);const items=list.filter(f=>!f.IsDir&&videoFile.test(f.Name)).map(f=>fileItem('remote:'+safePath([folder,f.Path].filter(Boolean).join('/')),f.Name,{bytes:f.Size}));const folders=list.filter(f=>f.IsDir).map(f=>({title:f.Name,path:safePath([folder,f.Path].filter(Boolean).join('/'))}));return {items:items.filter(i=>!query||i.title.toLowerCase().includes(query.toLowerCase())),folders,filters:[],pages:[]};}
  if(source.type==='device'){const {db}=await import('./store.mjs');const items=db.prepare('SELECT value FROM items WHERE source_id=? ORDER BY updated DESC').all(source.id).map(r=>JSON.parse(r.value));return {items:items.filter(i=>!query||i.title.toLowerCase().includes(query.toLowerCase())),filters:[],pages:[],device:true};}
  throw new Error('Nieobsługiwany typ źródła.');
}
export async function detail(source,item) {
  if(source.type==='vider') {
    if(item.kind==='series'&&item.episodes?.length)return item;
    const url=viderURL(item.url,source.url);
    if(!url||!/^\/vid\/[+a-z0-9_-]+\/?$/i.test(url.pathname))throw new Error('Nieprawidłowy adres wideo Vider.');
    const parsed=parseViderDetail(await sourceBrowser.html(source,url.href),url.href);
    if(parsed.challenge)throw Object.assign(new Error('Vider wymaga ręcznego zalogowania lub rozwiązania CAPTCHA w ustawieniach.'),{status:409});
    return {...item,...parsed};
  }
  if(source.type==='filman'){const parsed=parseDetail(await sourceBrowser.html(source,item.url),item.url);if(!parsed.title)throw Object.assign(new Error('Portal nie udostępnił danych tytułu. Sprawdź sesję lub wykonaj CAPTCHA w ustawieniach.'),{status:409});return {...item,...parsed};}
  if(source.type==='plex') {
    const headers=credentialsHeaders(source),allowedOrigins=[networkURL(source.url).origin];const $=load(await textRequest(item.url,{headers,allowedOrigins}),{xml:true});const a=$('Video,Directory').first();
    const episodes=[];if(item.kind==='series'){const xml=load(await textRequest(item.url+'/allLeaves',{headers,allowedOrigins}),{xml:true});xml('Video').each((_,e)=>{const v=xml(e);episodes.push({url:new URL(`library/metadata/${v.attr('ratingKey')}`,source.url).href,title:v.attr('title')||'',season:Number(v.attr('parentIndex')),number:Number(v.attr('index'))});});episodes.sort((a,b)=>a.season-b.season||a.number-b.number);}
    const sources=[];a.find('Media').each((_,m)=>{const media=$(m);if(!['h264','vp9','av1'].includes(media.attr('videoCodec')))return;media.find('Part').each((_,p)=>{const part=$(p);if(!part.attr('key'))return;sources.push({id:part.attr('id')||String(sources.length),url:new URL(part.attr('key'),source.url).href,host:source.name,version:media.find('Stream[streamType="2"]').first().attr('language')||'Oryginał',quality:media.attr('height')?media.attr('height')+'p':media.attr('videoResolution')||'Oryginał'});});});
    return {...item,description:a.attr('summary')||item.description,genres:a.find('Genre').map((_,g)=>$(g).attr('tag')).get(),episodes,sources};
  }
  return {...item,episodes:[],sources:[{id:'file',host:source.name,version:'Oryginał',quality:item.quality||'Oryginał',url:item.url,bytes:item.bytes}]};
}
export async function resolveLink(source,pageURL,link,onProgress,{signal,fresh=false}={}) {
  signal?.throwIfAborted();
  if(source.type==='vider')return sourceBrowser.resolveVider(source,pageURL,link,onProgress,{signal});
  if(source.type==='filman')return sourceBrowser.resolve(source,pageURL,link,onProgress,{signal,fresh});
  const remote=['ftp','webdav','s3'].includes(source.type);
  const candidate=remote?{kind:'remote',url:link.url,sourceId:source.id,userId:source.user_id,bytes:link.bytes,host:link.host,version:link.version,quality:link.quality}:{kind:/m3u8/i.test(link.url)?'hls':/\.webm(?:[?#]|$)/i.test(link.url)?'webm':'mp4',url:sameSourceURL(link.url,source.url),headers:credentialsHeaders(source),allowedOrigins:[networkURL(source.url).origin],host:link.host,version:link.version,quality:link.quality};
  if(!remote)await verifyMedia(candidate,{signal});const {probeMedia}=await import('./media.mjs');const meta=await probeMedia(candidate,{signal});candidate.quality=meta.height+'p';candidate.bytes=Number(meta.size)||candidate.bytes;candidate.audioCodec=meta.audioCodec;candidate.duration=Number(meta.duration)||undefined;return candidate;
}
