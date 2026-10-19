import { db,getSettings,getSource,hashId } from './store.mjs';
import { detail } from './adapters.mjs';
import { sameTitle } from './catalog-match.mjs';

export function matchingViderItems(userId,item) {
  if(!getSettings(userId).combineSources||getSource(item.sourceId,userId).type==='vider')return [];
  const candidates=db.prepare("SELECT i.value FROM items i JOIN sources s ON s.id=i.source_id WHERE s.user_id=? AND s.enabled=1 AND s.type='vider'").all(userId).map(row=>JSON.parse(row.value)).filter(candidate=>sameTitle(item,candidate));
  const known=db.prepare("SELECT i.value FROM items i JOIN sources s ON s.id=i.source_id WHERE s.user_id=? AND s.enabled=1 AND s.type!='vider'").all(userId).map(row=>JSON.parse(row.value));
  return candidates.filter(candidate=>candidate.kind==='series'||new Set(known.filter(other=>sameTitle(other,candidate)).map(other=>other.year).filter(Boolean)).size<=1);
}
export async function itemLinks(userId,item,source,episode) {
  if(source.enabled===0)throw Object.assign(new Error('To źródło jest wyłączone.'),{status:409});
  const links=[];
  // Only already indexed, exact title/year matches are used. No speculative
  // searches, extra hosting tokens or access to another user's source profile.
  for(const match of matchingViderItems(userId,item).slice(0,5)){
    const selected=episode?match.episodes?.find(e=>e.season===episode.season&&e.number===episode.number):match;
    if(!selected||match.kind==='series'&&!episode)continue;
    const version=/lektor/i.test(selected.title)?'Lektor':/dubbing/i.test(selected.title)?'Dubbing':'Oryginał';
    links.push({id:hashId(match.sourceId+':'+selected.url),originalId:'vider-video',sourceId:match.sourceId,pageURL:selected.url,host:'Vider',version,quality:'Automatyczna'});
  }
  try{const current=episode?await detail(source,{...item,url:episode.url,kind:'episode'}):item.sources?.length?item:await detail(source,item);return [...(current.sources||[]),...links];}catch(error){if(links.length&&[409,429].includes(error.status))return links;throw error;}
}
