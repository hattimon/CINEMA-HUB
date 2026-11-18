// These upload IDs were read from Filman's episode pages and checked against
// the actual recordings. Other uploads on the same host can contain a different show.
const editions = [
  {
    code: 'SG1', seriesPath: '/s/1942/gwiezdne-wrota-stargate-sg-1',
    episodeId: '36485', season: 1, number: 1, lastNumber: 2,
    title: 'Dzieci bogów (1–2)', label: 'Children of the Gods, Parts 1–2',
    uploads: ['974222'], minimumDuration: 4800,
  },
  {
    code: 'SGA', seriesPath: '/s/1963/gwiezdne-wrota-atlantyda-stargate-atlantis',
    episodeId: '36731', season: 1, number: 1, lastNumber: 2,
    title: 'Wzrost (1–2)', label: 'Rising, Parts 1–2',
    uploads: ['1563066', '4948615'], minimumDuration: 4800,
  },
  {
    code: 'SGA', seriesPath: '/s/1963/gwiezdne-wrota-atlantyda-stargate-atlantis',
    episodeId: '36732', season: 1, number: 3,
    uploads: ['3528839', '4948622'],
  },
];

export function filmanEdition(address) {
  const url = new URL(address);
  if (url.hostname !== 'filman.cc' && url.hostname !== 'www.filman.cc') return;
  const episode = /^\/e\/[^/]+\/(\d+)(?:\/|$)/.exec(url.pathname);
  return episode && editions.find(edition => edition.episodeId === episode[1]);
}

export function applyFilmanEditions(item) {
  const edition = filmanEdition(item.url);
  if (edition) return {
    ...item,
    episode: item.episode && {
      ...item.episode,
      ...(edition.lastNumber ? {lastNumber: edition.lastNumber, title: edition.title} : {}),
    },
    sources: edition.uploads.map(id => ({
      id, host: 'voe.sx', version: 'Lektor', quality: '720p',
      ...(edition.minimumDuration ? {minimumDuration: edition.minimumDuration} : {}),
    })),
  };
  const url = new URL(item.url);
  if (url.hostname !== 'filman.cc' && url.hostname !== 'www.filman.cc') return item;
  const groups = editions.filter(edition => edition.lastNumber && edition.seriesPath === url.pathname);
  if (!groups.length || !item.episodes?.length) return item;
  return {
    ...item,
    episodes: item.episodes.flatMap(episode => {
      const group = groups.find(group => group.season === episode.season
        && group.number <= episode.number && episode.number <= group.lastNumber);
      if (!group) return [episode];
      if (episode.number !== group.number) return [];
      return [{...episode, lastNumber: group.lastNumber, title: group.title}];
    }),
  };
}

export function combineFilmanPlaylistEntries(entries, filmanSourceIds) {
  const result = [];
  for (const entry of entries) {
    const previous = result.at(-1);
    const group = editions.find(group => group.lastNumber
      && group.code === entry.metadata?.series_code
      && group.season === entry.season && group.lastNumber === entry.episode);
    const sourceId = previous?.media?.sourceId ?? entry.media?.sourceId;
    if (!group || previous?.metadata?.series_code !== group.code
      || previous.season !== group.season || previous.episode !== group.number
      || sourceId && filmanSourceIds && !filmanSourceIds.has(sourceId)
      || previous.itemId && entry.itemId && previous.itemId !== entry.itemId) {
      result.push(entry);
      continue;
    }
    result[result.length - 1] = {
      ...previous,
      label: group.label,
      metadata: {
        ...previous.metadata, title: group.label, episode_end: group.lastNumber,
        combined_parts: [
          ...(Array.isArray(previous.metadata.combined_parts) ? previous.metadata.combined_parts : []),
          {id:entry.id, episodeUrl:entry.episodeUrl, season:entry.season, episode:entry.episode,
            label:entry.label, metadata:entry.metadata, completed:!!entry.completed,
            playbackPosition:entry.playbackPosition ?? 0},
        ],
      },
      ...(entry.id ? {combinedEntryIds: [...(previous.combinedEntryIds ?? []), entry.id]} : {}),
    };
  }
  return result;
}
