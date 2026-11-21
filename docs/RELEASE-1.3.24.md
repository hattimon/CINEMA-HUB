# Cinema Hub 1.3.24 – wspólne zmiany playlist i Stargate

**Status z 21.11.2026: publikacja wstrzymana.** Tag Git `v1.3.24` wskazuje commit `c57494c6`, wcześniejszy niż aktualna gałąź `main`. Poprawki wymagane do ukończenia CI powstały już po utworzeniu publicznego tagu. Nie wolno publikować GitHub Release `v1.3.24` z artefaktami z poprawionego `main`, bo kod nie zgadzałby się z tagiem; bezpieczne wydanie wymaga kolejnej wersji lub jawnej decyzji o procedurze naprawczej. [GitHub Release](https://github.com/hattimon/CINEMA-HUB/releases/tag/v1.3.24) nie został utworzony, a testy kontenera nie zakończyły się powodzeniem na obu architekturach. Ostatni przebieg [CI #33](https://github.com/hattimon/CINEMA-HUB/actions/runs/44755069865) zakończył się jako anulowany: ARM64 miał 135/136 zaliczonych testów i jeden timeout odtwarzania w Chromium, a amd64 nie dokończył testowania. Zadanie publikacji GHCR zostało pominięte. Najnowsze potwierdzone wydanie GitHub to `v1.3.23`.

## Playlisty

- Zachowanie identyfikatora wpisu, aktywnego odcinka i czasu oglądania w bazie konta. Dziennik w pamięci przeglądarki odtwarza niezapisane zmiany po chwilowej utracie połączenia, ponownym logowaniu lub odświeżeniu panelu.
- „Kontynuuj oglądanie”, odtwarzanie następnego odcinka, pełny ekran, panel odcinków z oznaczeniem bieżącego odcinka i sterowanie pilotem Android TV; oddzielne tworzenie i przeglądanie playlist.
- Przy zmianie lub unieważnieniu źródła odcinka zachowywane są postęp oglądania, wpis i jego identyfikator. Aktualizacja aplikacji zachowuje wolumen `/data` i dane kont.

## Stargate

- Stargate SG-1, Atlantis, Universe i Origins rozpoznawane według jednoznacznej ścieżki serialu na stronie dostawcy Filman. Adres odcinka musi zawierać właściwą ścieżkę serialu i numer ID dostawcy.
- Odcinki z konfliktowymi adresami, nieprawidłowym typem materiału lub ponownie użytym ID dostawcy zostają odłączone od automatycznego odtwarzania. Nie następuje automatyczna podmiana na materiał dopasowany jedynie po tytule.
- Stare tokeny odtwarzania i zapisane zadania pobierania są ponownie sprawdzane względem aktualnej pozycji katalogu, odcinka i hostingu. Walidacja obejmuje strumienie, kolejne segmenty HLS, eksporty FFmpeg oraz kolejki zapisu na urządzenie i do chmury. Nieaktualne zadania są wstrzymywane, a ich dane i postęp pozostają zapisane.
- **Atlantis S01E09 „Dom” jest zablokowany** z powodu zgłoszonego odtwarzania obcego filmu. Nie udało się potwierdzić właściwego pliku wideo; bez weryfikacji filmu nie wolno odblokować tego odcinka.
- Lokalny audyt dwóch archiwalnych migawek bazy: 214 odcinków SG-1, 100 Atlantis, 0 Universe i 0 Origins w canonicalnym źródle Filman. Dodatkowo 16 pozycji w innych źródłach nie ma potwierdzonej tożsamości nagrania. **Sprawdzono tylko powiązania metadanych i adresy, 0 klatek obrazu.** Każdy z 314 odcinków wymaga weryfikacji faktycznej zawartości strumienia. Archiwalne migawki nie dowodzą aktualnego stanu bazy ani playlist użytkowników.
- Raport lokalny: `ops/audit-stargate.mjs` uruchamiany na wybranej kopii `cinema.sqlite`; dostęp do bazy tylko do odczytu. Raporty zawierające adresy i lokalne ścieżki do migawki nie są częścią publicznej paczki.

## Testy i ograniczenia

- Ukierunkowany zestaw `tests/stargate.test.mjs`, `tests/playlist.test.mjs`, `tests/playlist-migration.test.mjs`, `tests/playlist-journal.test.mjs`, `tests/cli.test.mjs` i `tests/release-ci.test.mjs`: **51/51 OK** (ponowiony po naprawie etapu CI). Obejmuje migrację bazy playlist, trwałość dziennika postępu, odrzucanie błędnego odcinka, reset hasła i kontrolę zawartości obrazu testowego. `npm run build`: **OK** (ponownie 20.11.2026). Pełne `npm test`: **80/136 OK, 35 błędów, 21 pominiętych** (`output/cinema-test-1.3.24-recheck2.log`). Dominują błędy lokalnego HTTP/Playwright (`EACCES`, `ERR_NETWORK_ACCESS_DENIED`); również test CLI w pełnym przebiegu nie przeszedł z powodu zależności od wcześniejszego tworzenia konta przez HTTP. Lokalny Docker CLI otrzymał `permission denied` dla `npipe:////./pipe/dockerDesktopLinuxEngine`; odczyt przez DCC potwierdził obecność silnika i zdrowy kontener produkcyjny 1.3.23, ale nie zastępuje testu nowego obrazu.
- Izolowany test CLI resetowania hasła na bazie tymczasowej `node --test tests/cli.test.mjs`: **1/1 OK** (zmiana hasła, unieważnienie wyłącznie sesji docelowego konta). W oryginalnym teście integracyjnym konto `viewer` powstaje we wcześniejszym teście zależnym od HTTP; przy jego niepowodzeniu stan testów może być niekompletny.
- Android TV **1.3.24** (`versionCode` 16): Gradle `assembleRelease` i `lintRelease` **OK**, 49 zadań; wszystkie uruchomione zestawy testów Java **159/159 OK**. `apksigner verify` potwierdził ten sam certyfikat SHA-256 co w APK 1.3.11 (`f61f30e38931de88b91bcfb54691a6688061a7faf040664084c2c7111f39058b`); SHA-256 pliku APK: `5eebaf3886be5fc69f02848104d8cabc13349f4c6cfebf4bbf926c70bf27c22c`. Obecny pakiet jest przygotowany lokalnie.
- Testy UI na Android TV i odtworzenie klatek rzeczywistych odcinków Stargate muszą zostać wykonane osobno na urządzeniu i w autoryzowanym strumieniu. W archiwalnych migawkach nie znaleziono zweryfikowanego zamiennika dla Atlantis S01E09.
- Zgodność DCC: oczekiwany obraz `ghcr.io/hattimon/cinema-hub:1.3.24` na `linux/amd64` i `linux/arm64`. DCC Updater korzysta z katalogu obrazu i wersji; samo oznaczenie wydania w GitHub bez obrazu GHCR i odświeżenia katalogu DCC nie wystarczy do aktualizacji.
- Naprawiono `.dockerignore` (APK 1.3.24 było wyłączone z kontekstu obrazu) i dodano kontrolę obecności APK w workflow GitHub Actions. Osobny etap `ci_test` uruchamia pełny zestaw testów w natywnych kontenerach na amd64 i ARM64; ostatni przebieg nie przeszedł bramki testów, więc obrazy nie zostały opublikowane w tym przebiegu. Lokalna poprawka testu ARM64 wymaga nowej weryfikacji.
- APK Android TV 1.3.24 korzysta z panelu serwera 1.3.24. Zgodności na fizycznym urządzeniu nie potwierdzono; wcześniejsze wydanie APK pozostaje dostępne.

### Pokrycie kluczowych scenariuszy

| Scenariusz | Dowód lokalny | Pozostała weryfikacja |
| --- | --- | --- |
| Trwałość playlist i postępu po utracie sieci, wylogowaniu, zalogowaniu i restarcie | Test migracji SQLite i test dziennika `localStorage` 48/48 w zestawie ukierunkowanym | Prawdziwy backend i restart Android TV |
| Oddzielne tworzenie/lista, następny odcinek, pełny ekran, panel odcinków, pilot D-pad/Back | Kod i udany build, testy jednostkowe logiki playlist | Przejście ekranu po ekranie na Android TV, nawigacja pilotem i odtwarzanie rzeczywistego strumienia |
| Stargate: identyfikacja odcinka, stare tokeny i blokada błędnego źródła | Testy `stargate.test.mjs`; audyt archiwalnych adresów | Rzeczywiste klatki każdego materiału; szczególnie Atlantis S01E09 pozostaje zablokowany |
| Aktualizacja serwera/Android TV przez DCC | Przygotowana paczka zawierająca APK oraz poprawka katalogu DCC | Po przejściu CI: obraz GHCR `amd64`/`arm64`, GitHub Release, wpis katalogu i weryfikacja zachowania `/data` po restarcie |

**Status odbioru: oczekiwanie na poprawne CI i publikację.** Nie potwierdzono wideo żadnego z 314 odcinków ani nie zakończono testu na fizycznym Android TV. Atlantis S01E09 pozostaje zablokowany, dopóki właściwy materiał nie zostanie potwierdzony. Katalog DCC wskazuje obecnie 1.3.15; przygotowana łatka do 1.3.24 wymaga publikacji wydania i obrazu.

## Artefakty przygotowane do publikacji

- Lokalnie: paczka serwera, APK Android TV, sumy SHA-256 i manifest wydania w katalogu `releases/`.
- Docelowo GHCR: `ghcr.io/hattimon/cinema-hub:1.3.24` oraz `:latest`, manifest wieloarchitekturowy dla `linux/amd64` i `linux/arm64` po udanym CI.
- Android TV: APK 1.3.24 (`versionCode` 16), podpis zgodny z poprzednią linią wydań.
- Wydanie publiczne wymaga zakończenia CI, publikacji release z artefaktami i aktualizacji katalogu DCC. Test sprzętowy i weryfikacja wideo pozostają do wykonania.
