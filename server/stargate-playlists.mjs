import { catalog, detail } from './adapters.mjs';
import { sameTitle } from './catalog-match.mjs';
import { db, getSource, saveItem } from './store.mjs';
import { providerPath, stargateProviderCode, canonicalStargateCode, validStargateEpisode, uniqueStargateEpisodes, STARGATE_SERIES } from './stargate-identity.mjs';

// Catalog pages verified in Filman. Resolve episodes and players through the
// configured source, so the playlist stays independent of hosting URLs.
const titles = new Map([
  ['SG1', {
    kind: 'series', year: 1997, label: 'Stargate SG-1',
    title: 'Stargate SG-1 / Stargate SG1 / Gwiezdne wrota',
    path: '/s/1942/gwiezdne-wrota-stargate-sg-1',
  }],
  ['SGA', {
    kind: 'series', year: 2004, label: 'Stargate Atlantis',
    title: 'Stargate Atlantis / Gwiezdne wrota: Atlantyda',
    path: '/s/1963/gwiezdne-wrota-atlantyda-stargate-atlantis',
  }],
  ['SGU', {
    kind: 'series', year: 2009, label: 'Stargate Universe',
    title: 'Stargate Universe / Gwiezdne wrota: Wszechświat',
    path: STARGATE_SERIES.SGU,
  }],
  ['ORIGINS', {
    kind: 'series', year: 2018, label: 'Stargate Origins',
    title: 'Stargate Origins / Gwiezdne wrota: Początek',
    path: STARGATE_SERIES.ORIGINS,
  }],
  ['FILM:1994', {
    kind: 'movie', year: 1994, label: 'Stargate (1994)',
    title: 'Stargate / Gwiezdne Wrota',
    path: '/m/zuCitIpV249kEcxnTg7S5K08h',
  }],
  ['FILM:ARK', {
    kind: 'movie', year: 2008, label: 'Stargate: Arka Prawdy',
    title: 'Stargate: The Ark of Truth / Gwiezdne Wrota: Arka Prawdy',
    path: '/m/yKtzA2P8awZFix7NTbd3HkEjo',
  }],
  ['FILM:CONTINUUM', {
    kind: 'movie', year: 2008, label: 'Stargate: Continuum',
    title: 'Stargate: Continuum / Gwiezdne Wrota: Continuum',
    path: '/m/VXsByK6OLotHg9Pizhnb2GmU4',
  }],
]);

export function stargateTitle(entry) {
  const code = entry.metadata?.series_code;
  if (titles.get(code)?.kind === 'series') {
    if (Number.isSafeInteger(entry.season) && entry.season >= 1
      && Number.isSafeInteger(entry.episode) && entry.episode >= 1) return code;
  } else if (code === 'FILM' && entry.season == null && entry.episode == null) {
    if (titles.get(entry.metadata.key)?.kind === 'movie') return entry.metadata.key;
    const item = { kind: 'movie', title: entry.metadata.title ?? entry.label, year: entry.metadata.year };
    return [...titles].find(([, title]) => title.kind === 'movie' && sameTitle(title, item))?.[0];
  }
}

export function stargateEntryKey(entry) {
  const title = stargateTitle(entry);
  return title && (titles.get(title).kind === 'series' ? title+':'+entry.season+':'+entry.episode : title);
}

export function needsStargateLink(entry) {
  const title = titles.get(stargateTitle(entry));
  if (!title) return false;
  return entry.media?.kind !== title.kind || (title.kind === 'series' && !entry.episodeUrl);
}

function sourcePath(url, source) {
  return providerPath(url, source.url);
}

// A cached title alone cannot prove a serial episode belongs to the right
// Filman series. Use the provider's canonical series page as its identity.
export function stargateSeriesCode(item, source) {
  return stargateProviderCode(item, source);
}

function matchTitle(target, items, source) {
  const matches = items.filter(item => (
    item.kind === target.kind && sourcePath(item.url, source) && sameTitle(target, item)
  ));
  const candidates = [...new Map(matches.map(item => [sourcePath(item.url, source), item])).values()];
  const canonical = candidates.find(item => sourcePath(item.url, source) === target.path);
  if (canonical) return canonical;
  // A series must have the known provider identity. A matching title or year
  // on another page is not enough to identify its individual episodes.
  if (target.kind === 'series') return;
  const dated = candidates.filter(item => item.year === target.year);
  if (dated.length === 1) return dated[0];
  if (candidates.length === 1) return candidates[0];
}

export function stargateLinkStatus(entry, item, source) {
  const code = stargateTitle(entry), target = titles.get(code);
  if (!target) return { valid: true };
  if (!item || !source || source.type !== 'filman'
    || item.kind !== target.kind || !sameTitle(target, item)
    || (target.kind === 'series' && sourcePath(item.url, source) !== target.path)) {
    return { valid: false, reason: 'Pozycja Stargate nie jest powiązana z właściwą stroną serialu i źródłem Filman.' };
  }
  if (target.kind === 'movie') return { valid: !entry.episodeUrl && entry.season == null && entry.episode == null };
  // The source of Atlantis S01E09 was reported to play an unrelated film.
  // No upload has been verified for this episode; never silently reselect one.
  if (code === 'SGA' && entry.season === 1 && entry.episode === 9) {
    return { valid: false, reason: 'Atlantyda S01E09 „Dom” jest niedostępna: brak potwierdzonego nagrania. Postęp oglądania został zachowany.' };
  }
  if ((item.stargateConflicts ?? []).includes(entry.season + ':' + entry.episode)) {
    return { valid: false, reason: 'Zmiana adresu odcinka podczas synchronizacji wymaga weryfikacji nagrania.' };
  }
  const { episodes, rejected } = uniqueStargateEpisodes(code, item.episodes, source);
  if (rejected.includes(entry.season + ':' + entry.episode)) {
    return { valid: false, reason: 'Odcinek ma sprzeczne adresy źródłowe w katalogu.' };
  }
  const matching = episodes.filter(episode => episode.season === entry.season && episode.number === entry.episode);
  if (matching.length !== 1 || matching[0].url !== entry.episodeUrl
    || !validStargateEpisode(code, matching[0], source)) {
    return { valid: false, reason: 'Brak jednoznacznego adresu dla wskazanego sezonu i odcinka Stargate.' };
  }
  return { valid: true };
}

// Used by direct playback, hosting lookups and cached playback tokens as well
// as playlists. A correct series page does not establish the video upload's
// identity; SGA S01E09 is quarantined until the upload is actually verified.
export function stargatePlaybackStatus(item, source, episode) {
  if (canonicalStargateCode(item?.url, source) && item?.kind !== 'series') {
    return { valid: false, reason: 'Źródło zgłosiło film zamiast serialu Stargate.' };
  }
  const code = stargateSeriesCode(item, source);
  if (!code) {
    if (source?.type === 'filman' && item?.kind === 'series'
      && [...titles.values()].some(target => target.kind === 'series' && sameTitle(target, item))) {
      return { valid: false, reason: 'Strona źródła nie odpowiada identyfikatorowi serialu Stargate.' };
    }
    return { valid: true };
  }
  if (!episode) return { valid: false, reason: 'Wybierz odcinek serialu Stargate.' };
  return stargateLinkStatus({
    metadata: { series_code: code }, season: episode.season,
    episode: episode.number, episodeUrl: episode.url,
  }, item, source);
}

function setLinks(links, requested, item, source) {
  if (!item) return;
  const group = stargateTitle(requested[0]);
  const target = titles.get(group);
  if (!target || item.kind !== target.kind
    || (target.kind === 'series' && sourcePath(item.url, source) !== target.path)) return;
  const episodes = new Map();
  for (const episode of uniqueStargateEpisodes(group, item.episodes, source).episodes) {
    const key = episode.season+':'+episode.number;
    if (!episodes.has(key)) episodes.set(key, episode.url);
    else if (episodes.get(key) !== episode.url) episodes.set(key, null);
  }
  for (const entry of requested) {
    if (links.has(entry.id)) continue;
    const episodeUrl = episodes.get(entry.season+':'+entry.episode);
    const proposed = { ...entry, episodeUrl: item.kind === 'movie' ? null : episodeUrl };
    if ((item.kind === 'movie' || episodeUrl) && stargateLinkStatus(proposed, item, source).valid) {
      links.set(entry.id, { itemId: item.id, episodeUrl: proposed.episodeUrl });
    }
  }
}

const actionRequired = error => error.requiresAction || error.status === 429 || error.name === 'TimeoutError';

export async function resolveStargateEntries(userId, entries) {
  const groups = Map.groupBy(entries, stargateTitle);
  groups.delete(undefined);
  const links = new Map();
  const remaining = () => [...groups].filter(([, requested]) => requested.some(entry => !links.has(entry.id)));
  const sources = db.prepare("SELECT id FROM sources WHERE user_id=? AND enabled=1 AND type='filman' ORDER BY rowid")
    .all(userId).map(({ id }) => getSource(id, userId));
  if (!sources.length) return {
    links, message: 'Włącz źródło Filman w Ustawieniach, a potem ponów automatyczne powiązanie.',
  };
  const cached = db.prepare(`
    SELECT value FROM items WHERE source_id=?
    AND (lower(json_extract(value,'$.title')) LIKE '%stargate%'
      OR lower(json_extract(value,'$.title')) LIKE '%gwiezdne wrota%')
    ORDER BY updated
  `);
  for (const source of sources) {
    const items = cached.all(source.id).map(({ value }) => JSON.parse(value));
    for (const [key, requested] of remaining()) {
      setLinks(links, requested, matchTitle(titles.get(key), items, source), source);
    }
  }

  let issue;
  for (const source of sources) {
    if (!remaining().length) break;
    const visited = new Set();
    async function inspect(target, requested, candidate) {
      const url = new URL(candidate?.url ?? target.path, source.url).href;
      const path = sourcePath(url, source);
      if (!path || visited.has(path)) return;
      visited.add(path);
      let item;
      try {
        item = await detail(source, candidate ?? { url, kind: target.kind, title: target.label });
      } catch (error) {
        if (actionRequired(error)) throw error;
        return;
      }
      if (!sameTitle(target, item) || item.kind !== target.kind
        || (target.kind === 'series' && sourcePath(item.url, source) !== target.path)) return;
      const current = getSource(source.id, userId);
      if (!current.enabled || current.type !== 'filman' || current.url !== source.url) return;
      const stored = saveItem(source.id, { ...item, sourceName: source.name });
      setLinks(links, requested, stored, source);
    }
    try {
      for (const [key, requested] of remaining()) await inspect(titles.get(key), requested);
      for (const query of ['Stargate', 'Gwiezdne wrota']) {
        if (!remaining().length) break;
        const result = await catalog(source, { query });
        if (result.challenge || result.requiresLogin) {
          throw Object.assign(new Error('Filman wymaga zalogowania lub weryfikacji w Ustawieniach źródła.'), { requiresAction: true });
        }
        for (const [key, requested] of remaining()) {
          const target = titles.get(key);
          const candidate = matchTitle(target, result.items, source);
          if (candidate) await inspect(target, requested, candidate);
        }
      }
    } catch (error) {
      if (actionRequired(error)) {
        issue = error.name === 'TimeoutError' ? 'Filman nie odpowiedział na czas. Spróbuj ponownie.' : error.message;
      }
    }
  }
  const unresolved = remaining().map(([key]) => titles.get(key).label);
  return {
    links,
    message: unresolved.length ? issue ?? 'Filman nie udostępnił wszystkich pozycji z: '+unresolved.join(', ')+'.' : undefined,
  };
}
