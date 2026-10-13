import { load } from 'cheerio';
import { sameSourceURL } from './net.mjs';
const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
const absolute=(value,base)=>{try{return new URL(value,base).href;}catch{return ''}};
export function parseFilters(html) {
  const $=load(html), filters=[];
  $('[id^="filter-"]').each((_,el)=>{
    const key=$(el).attr('id').replace('filter-',''); if(!/^[a-z]+$/.test(key)) return;
    const options=[]; $(el).find('li').each((_,li)=>{const raw=$(li).attr('data-sort')||$(li).attr('data-id'); if(!raw)return; options.push({value:raw.replace(key+':',''),label:clean($(li).find('a').first().text()||$(li).text()),selected:$(li).hasClass('active')});});
    if(options.length) filters.push({key,label:({sort:'Sortowanie',quality:'Jakość',version:'Wersja',category:'Gatunki',year:'Rok',country:'Kraj'})[key]||key,multiple:!$(el).hasClass('single-select'),options});
  }); return filters;
}
export function buildFilterURL(base,kind,filters={},page=1,schema=[]) {
  const route=kind==='series'?'seriale':kind==='children'?'dla-dzieci-pl':'filmy'; let path=route+'/';
  for(const field of schema) {const values=Array.isArray(filters[field.key])?filters[field.key]:[filters[field.key]].filter(Boolean);if(values.length>20)throw new Error('Za wiele wybranych filtrów.'); const allowed=new Set(field.options.map(o=>o.value));if(values.some(v=>!allowed.has(v)))throw new Error('Filtr nie jest oferowany przez portal.'); if(values.length) path+=field.key+':'+values.map(encodeURIComponent).join(',')+'/';}
  const u=new URL(path,base); if(page>1)u.searchParams.set('page',String(page));return u.href;
}
export function parseCatalog(html,base) {
  const $=load(html),items=new Map();
  $('a[href]').each((_,el)=>{const a=$(el),href=absolute(a.attr('href'),base);let u;try{u=new URL(href);if(u.origin!==new URL(base).origin)return;}catch{return;}
    if(!/^\/(m\/|s\/|film-online-pl\/|serial-online-pl\/)/.test(u.pathname)||a.closest('#comments,.comments,.c-add-comment').length)return;
    const image=a.find('img').first();if(!image.length)return;
    const title=clean(a.attr('title')||image.attr('alt')||a.find('h1,h2,h3').text());if(!title)return;
    const parent=a.closest('li').length?a.closest('li'):a.parent();const poster=absolute(image.attr('data-src')||image.attr('data-original')||image.attr('src'),base);
    const old=items.get(href);if(old&&/\/poster\//.test(old.poster))return;
    const ratingText=clean(a.find('.rate').text()||parent.find('.rate').first().text());const rating=Number(ratingText.match(/\d+[.,]\d+/)?.[0].replace(',','.'))||null;
    const year=Number(clean(parent.find('.year,.date').first().text()).match(/(?:19|20)\d{2}/)?.[0]||clean(parent.text()).match(/\b(?:19|20)\d{2}\b/)?.[0])||null;
    const qv=clean(a.find('.quality-version').text()).split('|');
    items.set(href,{url:href,title,kind:/^\/(s|serial-online-pl)\//.test(u.pathname)?'series':'movie',poster,description:clean(a.attr('data-text')||a.find('.description').text()),year,rating,ratingScale:5,version:clean(qv[0]),quality:clean(qv[1])});
  });
  const pages=[];$('.pagination a[href],a[rel="next"]').each((_,el)=>{try{const href=sameSourceURL(absolute($(el).attr('href'),base),base);if(href.includes('?page='))pages.push({label:clean($(el).text()),page:Number(new URL(href).searchParams.get('page'))});}catch{}});
  return {items:[...items.values()],pages,filters:parseFilters(html),loggedIn:/Zalogowany jako:/i.test($('#belt').text()||$('#dropdown').text()),challenge:/Just a moment|Verify you are human|Potwierdź.*człowiek/i.test($('title').text())};
}
export function parseDetail(html,url) {
  const $=load(html);const info=$('#single-info');const heading=info.find('h1').first().clone();heading.find('.flm-online-badge,span').remove();
  const episodes=[];$('.episode-list a[href],#episode-list a[href]').each((_,el)=>{const a=$(el),label=clean(a.text()),match=/s(\d+)e(\d+)/i.exec(label);if(!match)return;try{episodes.push({url:sameSourceURL(absolute(a.attr('href'),url),url),title:label.replace(/\[?s\d+e\d+\]?/i,'').trim(),season:Number(match[1]),number:Number(match[2])});}catch{}});
  episodes.sort((a,b)=>a.season-b.season||a.number-b.number);
  const sources=[];$('#links tbody a[data-link-id]').each((_,el)=>{const a=$(el),row=a.closest('tr'),cells=row.find('td');const id=a.attr('data-link-id');if(!/^\d+$/.test(id)||row.hasClass('visible-0')||row.hasClass('disabled'))return;sources.push({id,host:clean(a.find('img').attr('alt')||a.text().split(' dodane ')[0]),version:clean(cells.eq(1).text()),quality:clean(cells.eq(2).text())});});
  const description=clean($('#item-content > p,.item-content > p,#item-content h4 + p,.item-content h4 + p,[itemprop="description"]').first().text());
  const genres=info.find('a[href*="category:"]').map((_,el)=>clean($(el).text())).get();
  const country=info.find('a[href*="country:"]').map((_,el)=>clean($(el).text())).get();
  const ratingText=clean($('#single-poster').text());
  const rating=Number(ratingText.match(/(?:OCENA UŻYTKOWNIKÓW|OCENA)\s*(\d+[.,]\d+)/i)?.[1].replace(',','.'))||null;
  const imdb=Number(ratingText.match(/(?:IMDB|iMDB)\s*(\d+[.,]\d+)/i)?.[1].replace(',','.'))||null;
  const episodeText=clean(info.find('.episode-subtitle').text()),code=/s(\d+)e(\d+)/i.exec(episodeText);
  const poster=absolute($('#single-poster img.main-poster,#single-poster img').first().attr('src'),url);
  const ids=key=>info.find(`a[href*="${key}:"]`).map((_,el)=>$(el).attr('href')?.match(new RegExp(key+':([\\d,]+)'))?.[1]).get().flatMap(v=>v.split(','));
  return {url,title:clean(heading.text()).replace(/ online pl$/i,''),description,poster,genres,country,filterIds:{category:ids('category'),country:ids('country')},rating,ratingScale:5,imdb,year:Number(clean(info.text()).match(/\b(?:19|20)\d{2}\b/)?.[0])||null,episodes,sources,episode:code?{season:Number(code[1]),number:Number(code[2]),title:episodeText.replace(/\[?s\d+e\d+\]?/i,'').trim(),url}:null};
}
