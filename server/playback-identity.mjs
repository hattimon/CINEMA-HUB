import { getItem, getSource } from './store.mjs';
import { canonicalStargateCode } from './stargate-identity.mjs';
import { stargatePlaybackStatus } from './stargate-playlists.mjs';

const invalid = message => Object.assign(new Error(message), { status: 409 });

// A playback token or persisted download can outlive a catalog refresh.
// Check the current item on every playback/export, including HLS segments.
export function assertPlaybackIdentity(playback, userId, savedJob) {
  if (!playback?.itemId) throw invalid('Sesja odtwarzania nie ma powiązania z pozycją katalogu. Wybierz materiał ponownie.');
  let item, source;
  try {
    item = getItem(playback.itemId, userId);
    source = getSource(item.sourceId, userId);
  } catch (error) {
    if (error.status === 404) throw invalid('Pozycja lub źródło zostały usunięte z katalogu. Wybierz materiał ponownie.');
    throw error;
  }
  const canonical = canonicalStargateCode(item.url, source);
  if (canonical && playback.sourceId !== item.sourceId) {
    throw invalid('Odcinek Stargate wskazuje inne źródło niż jego serial.');
  }
  const status = stargatePlaybackStatus(item, source, playback.episode);
  if (!status.valid) throw invalid(status.reason);
  if (savedJob) {
    if (savedJob.itemId && savedJob.itemId !== item.id
      || savedJob.sourceId && savedJob.sourceId !== playback.sourceId
      || savedJob.episode?.url !== playback.episode?.url
      || savedJob.episode && (savedJob.episode.season !== playback.episode?.season
        || savedJob.episode.number !== playback.episode?.number)
      || savedJob.pageURL && savedJob.pageURL !== playback.pageURL
      || savedJob.link?.id && savedJob.link.id !== playback.link?.id
      || savedJob.link?.sourceId && savedJob.link.sourceId !== playback.link?.sourceId
      || canonical && (!savedJob.itemId || !savedJob.episode)) {
      throw invalid('Zapis pobierania wskazuje nieaktualny odcinek lub źródło. Wybierz materiał ponownie.');
    }
  }
  return playback;
}
