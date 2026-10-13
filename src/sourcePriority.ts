import type { Playable } from './types';

function versionRank(version:string) {
  const v=version.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_-]/g,' ');
  if(/lektor/.test(v)&&!/(ai|syntetycz|maszynow)/.test(v))return 1;
  if(/dubb/.test(v))return 2;
  if(/lektor/.test(v)&&/(ai|syntetycz|maszynow)/.test(v))return 3;
  if(/\b(polsk(i|a|ie)|pl)\b/.test(v)&&!/(napis|sub|translat|tlumacz)/.test(v))return 0;
  if(/napis|subtit|sub\b/.test(v)&&!/(eng|english|angiel|\ben\b)/.test(v))return 4;
  if(/translat|tlumacz|przeklad|pl\b/.test(v)&&!/(eng|english|angiel)/.test(v))return 5;
  if(/oryg|original|eng|english|angiel/.test(v))return 7;
  return 6;
}
function qualityRank(value:string) {
  const v=value.toLowerCase(),match=v.match(/(\d{3,4})\s*p?\b/);
  return match?Number(match[1]):/4k|uhd/.test(v)?2160:/full\s*hd|fhd/.test(v)?1080:/\bhd\b/.test(v)?720:0;
}
export function orderPlayable<T extends Pick<Playable,'version'|'quality'> & {host?:string}>(sources:T[],preferredVersion='Lektor',preferredHosts:string[]=['voe.sx']):T[] {
  const chosen=versionRank(preferredVersion);
  const languages=(v:string)=>{const rank=versionRank(v);return chosen<7&&rank===chosen?0:rank+1;};
  const hosts=preferredHosts.filter(Boolean).map(h=>h.toLowerCase());
  const hosting=(v?:string)=>{const rank=hosts.indexOf((v||'').toLowerCase());return rank<0?hosts.length:rank;};
  return [...sources].sort((a,b)=>languages(a.version)-languages(b.version)||qualityRank(b.quality)-qualityRank(a.quality)||hosting(a.host)-hosting(b.host));
}
