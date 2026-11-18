import { catalog, detail } from './adapters.mjs';
import { sameTitle } from './catalog-match.mjs';
import { db, getSource, saveItem } from './store.mjs';

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
  if (code === 'SG1' || code === 'SGA') {
    if (Number.isInteger(entry.season) && Number.isInteger(entry.episode)) return code;
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
  try {
    const address = new URL(url);
    if (address.origin === new URL(source.url).origin) return address.pathname.replace(/\/$/, '');
  } catch { /* Invalid catalog URL. */ }
}

function matchTitle(target, items, source) {
  const matches = items.filter(item => (
    item.kind === target.kind && sourcePath(item.url, source) && sameTitle(target, item)
  ));
  const candidates = [...new Map(matches.map(item => [sourcePath(item.url, source), item])).values()];
  const canonical = candidates.find(item => sourcePath(item.url, source) === target.path);
  if (canonical) return canonical;
  const dated = candidates.filter(item => item.year === target.year);
  if (dated.length === 1) return dated[0];
  if (candidates.length === 1) return candidates[0];
}

function setLinks(links, requested, item, source) {
  if (!item) return;
  const episodes = new Map();
  for (const episode of item.episodes ?? []) {
    if (!sourcePath(episode.url, source)) continue;
    const key = episode.season+':'+episode.number;
    if (!episodes.has(key)) episodes.set(key, episode.url);
    else if (episodes.get(key) !== episode.url) episodes.set(key, null);
  }
  for (const entry of requested) {
    if (links.has(entry.id)) continue;
    const episodeUrl = episodes.get(entry.season+':'+entry.episode);
    if (item.kind === 'movie' || episodeUrl) links.set(entry.id, { itemId: item.id, episodeUrl: episodeUrl ?? null });
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
      if (!sameTitle(target, item)) return;
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
