const normal=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').replace(/Ł/g,'L').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const technical=/\b(?:2160p|1080p|720p|480p|4k|uhd|webrip|web[ .-]?dl|bluray|brrip|hdtv|x26[45]|h26[45]|lektor|dubbing|napisy|pl|polish|eng|english)\b/gi;
export function episodeFromTitle(title) {
  const text=String(title||'');
  const found=/\bS\s*(\d{1,2})\s*[._ -]*E\s*(\d{1,3})\b|\b(\d{1,2})x(\d{1,3})\b|\bsezon\s*(\d{1,2})\s*[,._ -]*(?:odc(?:inek|\.)?|ep)\s*(\d{1,3})\b/i.exec(text);
  if(!found)return null;
  const base=text.slice(0,found.index).replace(/[\s[\]()._-]+$/g,'').trim();
  if(normal(base).length<3)return null;
  return {title:base,season:Number(found[1]||found[3]||found[5]),number:Number(found[2]||found[4]||found[6])};
}
export function sameTitle(left,right) {
  if((left.kind==='series')!==(right.kind==='series'))return false;
  const year=item=>Number(item.year||/\b((?:19|20)\d{2})\b/.exec(item.title||'')?.[1]||0);if(year(left)&&year(right)&&year(left)!==year(right))return false;
  const aliases=item=>String(item.title||'').split(/\s+\/\s+|\s+aka\s+/i).map(title=>normal(title.replace(technical,' ').replace(/\b(?:19|20)\d{2}\b/g,' '))).filter(title=>title.length>=3);
  const a=aliases(left),b=aliases(right);return a.some(title=>b.includes(title));
}
export function classifyVider(title,description='',durationSeconds=0) {
  const episode=episodeFromTitle(title);if(episode)return {kind:'episode',episode,year:null};
  const year=/\b((?:19|20)\d{2})\b/.exec(title);
  return {kind:year||/\bfilm(?:\b|owy)/i.test(title)||durationSeconds>=40*60?'movie':'video',year:year?Number(year[1]):null};
}
export function organizeVider(items,base,kind='all') {
  const series=new Map(),other=[];
  for(const item of items){const identity=episodeFromTitle(item.title);if(!identity){other.push(item);continue;}
    const key=normal(identity.title);let group=series.get(key);
    if(!group){const url=new URL(base);url.hash='cinema-series='+encodeURIComponent(key);group={...item,url:url.href,title:identity.title,kind:'series',episodes:[],sources:[]};series.set(key,group);}
    if(!group.episodes.some(e=>e.url===item.url))group.episodes.push({...identity,title:item.title,url:item.url});
  }
  for(const group of series.values())group.episodes.sort((a,b)=>a.season-b.season||a.number-b.number);
  return [...series.values(),...other].filter(item=>kind==='all'||kind==='series'&&item.kind==='series'||kind!=='series'&&item.kind==='movie').sort((a,b)=>Number(a.kind==='video')-Number(b.kind==='video'));
}
export function combineCatalog(groups,sourceTypes) {
  const primary=groups.flatMap(group=>sourceTypes.get(group.sourceId)!=='vider'?group.items:[]);
  return groups.map(group=>sourceTypes.get(group.sourceId)!=='vider'?group:{...group,items:group.items.filter(item=>{
    const matches=primary.filter(candidate=>sameTitle(candidate,item));if(matches.length!==1)return true;
    const match=matches[0];match.alternateSources=[...(match.alternateSources||[]),{itemId:item.id,sourceId:item.sourceId,sourceName:group.sourceName}];return false;
  })});
}
