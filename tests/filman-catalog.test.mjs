import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalog,buildFilterURL } from '../server/filman-parser.mjs';

const card=(slug,title=slug)=>`<div class="col-xs-6"><div class="poster"><a href="/s/${slug}" title="${title}"><img data-src="/poster/${slug}.jpg" src="/placeholder.jpg"><span class="rate">4.50</span></a></div></div>`;
const slider='<div id="slider"><div id="owl-slider"><a href="/s/recommended"><img src="/photo/recommended.jpg" alt="Polecany serial"></a></div></div>';
const listing=slugs=>`<div id="item-list">${slugs.map(slug=>card(slug)).join('')}</div>`;
const pagination=page=>`<ul class="pagination"><li><a href="?page=1">1</a></li><li class="active"><a href="#!" data-pagenumber="${page}">${page}</a></li><li><a href="?sort=rate&amp;page=${page+1}">Następna</a></li><li><a href="?page=386" data-pagenumber="3">386</a></li><li><a rel="last" href="?page=387">Ostatnia</a></li></ul>`;

test('Recommendations stay separate from the real ordered first-page catalog',()=>{
  const parsed=parseCatalog(slider+listing(['first','recommended','second'])+card('sidebar')+pagination(1),'https://filman.cc/seriale/');
  assert.deepEqual(parsed.items.map(item=>item.title),['first','recommended','second']);
  assert.deepEqual(parsed.recommendations.map(item=>item.title),['Polecany serial']);
  assert.equal(parsed.items[0].poster,'https://filman.cc/poster/first.jpg');
  assert.equal(parsed.items[0].rating,4.5);
  assert.equal(parsed.currentPage,1);
  assert.equal(parsed.totalPages,387);
});

test('Pages two and three start with their own results and exclude the repeated slider',()=>{
  for(const page of [2,3]){
    const parsed=parseCatalog(slider+listing([`page-${page}-first`,`page-${page}-second`])+pagination(page),`https://filman.cc/seriale/?page=${page}`);
    assert.deepEqual(parsed.items.map(item=>item.title),[`page-${page}-first`,`page-${page}-second`]);
    assert.deepEqual(parsed.recommendations,[]);
    assert.equal(parsed.currentPage,page);
    assert.equal(parsed.totalPages,387);
  }
});

test('Filters, sort order and search cannot prepend unrelated recommendations',()=>{
  for(const route of ['seriale/category:1/','seriale/sort:rate/category:1,2/','filmy/year:2026/']){
    const parsed=parseCatalog(slider+listing(['matching-result']),new URL(route,'https://filman.cc/').href);
    assert.deepEqual(parsed.items.map(item=>item.title),['matching-result']);
    assert.deepEqual(parsed.recommendations,[]);
  }
  const search=parseCatalog(slider+`<ul>${card('search-result')}</ul>`,'https://filman.cc/',{includeRecommendations:false});
  assert.deepEqual(search.items.map(item=>item.title),['search-result']);
  assert.deepEqual(search.recommendations,[]);
});

test('An empty result container does not turn recommendations or sidebar links into results',()=>{
  const parsed=parseCatalog(slider+listing([])+card('sidebar'),'https://filman.cc/seriale/?page=2');
  assert.deepEqual(parsed.items,[]);
  assert.deepEqual(parsed.recommendations,[]);
  assert.equal(parsed.totalPages,2);
});

test('Pagination uses real links instead of incorrect data attributes and ignores invalid destinations',()=>{
  const html=listing(['last'])+pagination(387)+'<ul class="pagination"><li class="disabled"><a href="?page=99999">…</a></li><li><a href="https://elsewhere.invalid/seriale/?page=99999">99999</a></li><li><a href="/filmy/?page=99999">99999</a></li><li><a href="?page=1.5">Next</a></li><li><a href="?page=0">Previous</a></li></ul>';
  const parsed=parseCatalog(html,'https://filman.cc/seriale/?page=387');
  // The fixture's ordinary next link is outside its last-page range; omit it as the portal does.
  const actual=parseCatalog(html.replace('?sort=rate&amp;page=388','#!'),'https://filman.cc/seriale/?page=387');
  assert.equal(parsed.pages.find(page=>page.label==='386').page,386);
  assert.equal(actual.totalPages,387);
  assert.equal(actual.pages.filter(page=>page.page===387).length,1);
  assert.ok(actual.pages.every(page=>Number.isInteger(page.page)&&page.page>=1&&page.page<=387));
});

test('Jumping to an arbitrary page retains all real filter values and their order',()=>{
  const schema=[{key:'sort',options:[{value:'rate'}]},{key:'category',options:[{value:'1'},{value:'12'}]}];
  for(const page of [2,3,177]){
    assert.equal(buildFilterURL('https://filman.cc/','series',{sort:['rate'],category:['1','12']},page,schema),`https://filman.cc/seriale/sort:rate/category:1,12/?page=${page}`);
  }
});
