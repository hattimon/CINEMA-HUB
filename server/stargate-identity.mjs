// Provider identities must be exact. Names and approximate titles are not
// evidence that an upload belongs to a particular television series.
export const STARGATE_SERIES = Object.freeze({
  SG1: '/s/1942/gwiezdne-wrota-stargate-sg-1',
  SGA: '/s/1963/gwiezdne-wrota-atlantyda-stargate-atlantis',
  SGU: '/s/1977/gwiezdne-wrota-wszechswiat-stargate-universe',
  ORIGINS: '/s/1679/gwiezdne-wrota-poczatek-stargate-origins',
});

export function providerPath(value, origin) {
  try {
    const url = new URL(value), provider = new URL(origin);
    if (url.origin !== provider.origin || url.username || url.password) return;
    return url.pathname.replace(/\/$/, '');
  } catch { return; }
}

export function stargateProviderCode(item, source) {
  if (!item || !source || source.type !== 'filman' || item.kind !== 'series') return;
  return canonicalStargateCode(item.url, source);
}

export function canonicalStargateCode(url, source) {
  if (!source || source.type !== 'filman') return;
  const path = providerPath(url, source.url);
  return Object.keys(STARGATE_SERIES).find(code => STARGATE_SERIES[code] === path);
}

export function validStargateEpisode(code, entry, source) {
  const canonical = STARGATE_SERIES[code];
  if (!canonical || !source || !Number.isSafeInteger(entry?.season)
    || entry.season < 1 || !Number.isSafeInteger(entry.number) || entry.number < 1) return false;
  const path = providerPath(entry.url, source.url);
  // Filman episode URL format: /e/<canonical-series-slug>/<provider-id>/...
  return !!path && path.startsWith('/e/' + canonical.split('/').at(-1) + '/')
    && /^\/e\/[^/]+\/\d+\/[^/]+\/[^/]+$/.test(path);
}

export function uniqueStargateEpisodes(code, episodes, source) {
  const bySlot = new Map(), slotsByURL = new Map(), slotsByProviderID = new Map(), rejected = new Set();
  for (const episode of episodes ?? []) {
    // A malformed or foreign URL for an otherwise identifiable slot is a
    // conflict, not a missing episode. Retaining a previously cached link
    // without quarantining it would let a bad refresh go unnoticed.
    const hasSlot = Number.isSafeInteger(episode?.season) && episode.season >= 1
      && Number.isSafeInteger(episode?.number) && episode.number >= 1;
    if (!hasSlot) continue;
    const slot = episode.season + ':' + episode.number;
    if (!validStargateEpisode(code, episode, source)) {
      rejected.add(slot);
      continue;
    }
    const url = providerPath(episode.url, source.url);
    const prior = bySlot.get(slot);
    if (prior && providerPath(prior.url, source.url) !== url) rejected.add(slot);
    if (!prior) bySlot.set(slot, episode);
    if (!slotsByURL.has(url)) slotsByURL.set(url, new Set());
    slotsByURL.get(url).add(slot);
    const providerId = /^\/e\/[^/]+\/(\d+)\//.exec(url)?.[1];
    if (providerId) {
      if (!slotsByProviderID.has(providerId)) slotsByProviderID.set(providerId, new Set());
      slotsByProviderID.get(providerId).add(slot);
    }
  }
  for (const slots of [...slotsByURL.values(), ...slotsByProviderID.values()]) {
    if (slots.size > 1) for (const slot of slots) rejected.add(slot);
  }
  return { episodes: [...bySlot].filter(([slot]) => !rejected.has(slot)).map(([, e]) => e), rejected: [...rejected] };
}
