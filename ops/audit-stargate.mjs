// Offline, read-only audit. It never validates actual playback frames.
// Usage: node ops/audit-stargate.mjs path/to/cinema.sqlite [output.json]
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalStargateCode, validStargateEpisode, uniqueStargateEpisodes } from '../server/stargate-identity.mjs';

const file=process.argv[2];
if(!file)throw Error('Pass the path to a Cinema Hub database snapshot.');
const db=new DatabaseSync(resolve(file),{readOnly:true});
const tables=new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(row=>row.name));
const sourceRows=db.prepare('SELECT id,type,url FROM sources').all();
const sources=new Map(sourceRows.map(row=>[row.id,row]));
const catalog=db.prepare('SELECT id,source_id,value FROM items').all().map(row=>({
  ...JSON.parse(row.value), id:row.id, sourceId:row.source_id,
}));
const preset=JSON.parse(readFileSync(new URL('../public/playlists/stargate_chronologia_cinema_hub.json',import.meta.url),'utf8'));
const expected=new Map(['SG1','SGA','SGU','ORIGINS'].map(code=>[
  code,new Map(preset.items.filter(e=>e.series_code===code).map(e=>[e.season+':'+e.episode,e.title])),
]));
const audited=[];
const issues=[];
const bySeries=new Map();
const canonicalCodes=new Set();
for(const item of catalog){
  const source=sources.get(item.sourceId);
  const code=canonicalStargateCode(item.url,source);
  if(code){
    canonicalCodes.add(code);
    const episodes=item.episodes??[];
    const { rejected }=uniqueStargateEpisodes(code,episodes,source);
    for(const slot of rejected) issues.push({series:code,slot,reason:'duplicate-or-ambiguous-slot'});
    if(item.kind!=='series')issues.push({series:code,reason:'canonical-series-categorized-as-film'});
    const byURL=new Map(),byProviderID=new Map(),slots=new Set();
    for(const episode of episodes){
      const slot=episode.season+':'+episode.number;
      const valid=validStargateEpisode(code,episode,source);
      const uploadId=/\/e\/[^/]+\/(\d+)\//.exec(new URL(episode.url).pathname)?.[1];
      const entry={series:code,season:episode.season,episode:episode.number,title:episode.title,
        sourceUrl:episode.url,canonicalProviderPath:valid,videoVerified:false};
      audited.push(entry);
      slots.add(slot);
      if(!valid)issues.push({series:code,slot,reason:'invalid-provider-url',sourceUrl:episode.url});
      if(code==='SGA'&&slot==='1:9')issues.push({series:code,slot,reason:'reported-wrong-footage-quarantined',sourceUrl:episode.url});
      for(const [key,value,map,reason] of [['url',episode.url,byURL,'reused-episode-url'],['id',uploadId,byProviderID,'reused-provider-episode-id']]){
        if(!value)continue;
        const prior=map.get(value);
        if(prior&&prior!==slot)issues.push({series:code,slot,otherSlot:prior,reason,key:value});
        map.set(value,slot);
      }
    }
    bySeries.set(code,{title:item.title,sourceUrl:item.url,episodeCount:episodes.length,
      uniqueSlots:slots.size,canonicalUrlCount:audited.filter(e=>e.series===code&&e.canonicalProviderPath).length,
      expectedCount:expected.get(code)?.size??null,
      missingExpected:[...(expected.get(code)?.keys()??[])].filter(slot=>!slots.has(slot)),
      extraSlots:[...slots].filter(slot=>expected.get(code)?.size&&!expected.get(code).has(slot))});
  }
}
const otherSources=catalog.filter(item=>
  !canonicalStargateCode(item.url,sources.get(item.sourceId)) &&
  /stargate|gwiezdne\s+wrota|gwiezdne\s+wrot/i.test(item.title??''))
  .map(item=>({kind:item.kind,title:item.title,provider:sources.get(item.sourceId)?.type,
    episodeCount:item.episodes?.length??0,identityVerified:false}));
const playlistReview=[];
if(tables.has('playlists')&&tables.has('playlist_entries')){
  const rows=db.prepare('SELECT e.*,p.user_id FROM playlist_entries e JOIN playlists p ON p.id=e.playlist_id').all();
  const byId=new Map(catalog.map(item=>[item.id,item]));
  for(const row of rows){
    let metadata;
    try{metadata=JSON.parse(row.metadata??'{}');}catch{metadata={};}
    const code=metadata.series_code;
    if(!['SG1','SGA','SGU','ORIGINS'].includes(code))continue;
    const item=byId.get(row.media_item_id);
    const source=sources.get(item?.sourceId);
    const episode=item?.episodes?.find(e=>e.season===row.season&&e.number===row.episode);
    const consistent=!!item && canonicalStargateCode(item.url,source)===code
      && item.kind==='series' && !!episode && episode.url===row.episode_url
      && validStargateEpisode(code,episode,source)
      && !(item.stargateConflicts??[]).includes(row.season+':'+row.episode);
    if(!consistent || code==='SGA'&&row.season===1&&row.episode===9){
      playlistReview.push({playlistId:row.playlist_id,entryId:row.id,series:code,
        slot:row.season+':'+row.episode,issue:code==='SGA'&&row.season===1&&row.episode===9
          ?'known-wrong-footage' : 'inconsistent-or-unverified-link',
        hasBinding:!!row.media_item_id||!!row.episode_url,
        playbackPosition:row.playback_position,completed:!!row.completed});
    }
  }
}
const report={sourceDatabase:resolve(file),kind:'offline-metadata-only',videoFramesInspected:0,
  canonicalSeries:[...bySeries].map(([series,details])=>({series,...details})),
  episodeRowsAudited:audited.length,otherStargateCatalogEntries:otherSources,
  issues,playlistEntriesFlagged:playlistReview,
  episodesNotVideoVerified:audited};
db.close();
const json=JSON.stringify(report,null,2)+'\n';
if(process.argv[3])writeFileSync(resolve(process.argv[3]),json);
else process.stdout.write(json);
