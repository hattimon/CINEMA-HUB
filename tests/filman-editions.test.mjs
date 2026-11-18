import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFilmanEditions} from '../server/filman-editions.mjs';

test('The joined pilot uses checked uploads and omits its empty second catalog page',()=>{
  const detail={
    url:'https://filman.cc/e/gwiezdne-wrota-atlantyda-stargate-atlantis/36731/wzrost-1/388690',
    episode:{season:1,number:1,title:'Wzrost (1)'},
    sources:[{id:'7716400',host:'voe.sx',version:'Lektor',quality:'720p'}],
  };
  const corrected=applyFilmanEditions(detail);
  assert.deepEqual(corrected.sources.map(source=>source.id),['1563066','4948615']);
  assert.ok(corrected.sources.every(source=>source.minimumDuration===4800));
  assert.equal(corrected.episode.lastNumber,2);
  const series=applyFilmanEditions({
    url:'https://filman.cc/s/1963/gwiezdne-wrota-atlantyda-stargate-atlantis',
    episodes:[1,2,3].map(number=>({url:'https://filman.cc/e/fixture/'+number,season:1,number,title:'Episode '+number})),
  });
  assert.deepEqual(series.episodes.map(episode=>[episode.number,episode.lastNumber]),[[1,2],[3,undefined]]);
  const otherPortal={...detail,url:detail.url.replace('filman.cc','example.org')};
  assert.equal(applyFilmanEditions(otherPortal),otherPortal);
});
