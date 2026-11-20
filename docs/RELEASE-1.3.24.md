# Cinema Hub 1.3.24 – wspólne zmiany playlist i Stargate

**Status: przygotowane lokalnie; wymaga zakończenia testów na urządzeniu i weryfikacji wideo przed publikacją.** Jeden tag `v1.3.24` i jeden GitHub Release dla obu grup poprawek.

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
- Naprawiono `.dockerignore` (APK 1.3.24 było wyłączone z kontekstu obrazu) i dodano kontrolę obecności APK w workflow dwóch architektur GitHub Actions. Dodano odrębny etap `ci_test`: pełne testy Node otrzymują testowe źródła, TypeScript i pliki do kontroli wydania; obraz `release` ich nie zawiera. Budowanie i testy samego kontenera `ci_test` **nie zostały jeszcze wykonane**. Archiwum serwera zawiera APK 1.3.24 i tylko jawnie dozwolone pliki.
- APK Android TV 1.3.24 korzysta z panelu serwera 1.3.24; zgodność na fizycznym urządzeniu wymaga potwierdzenia. Wydanie publiczne APK 1.3.11 pozostaje dostępne do czasu wspólnej publikacji.

### Pokrycie kluczowych scenariuszy

| Scenariusz | Dowód lokalny | Pozostała weryfikacja |
| --- | --- | --- |
| Trwałość playlist i postępu po utracie sieci, wylogowaniu, zalogowaniu i restarcie | Test migracji SQLite i test dziennika `localStorage` 48/48 w zestawie ukierunkowanym | Prawdziwy backend i restart Android TV |
| Oddzielne tworzenie/lista, następny odcinek, pełny ekran, panel odcinków, pilot D-pad/Back | Kod i udany build, testy jednostkowe logiki playlist | Przejście ekranu po ekranie na Android TV, nawigacja pilotem i odtwarzanie rzeczywistego strumienia |
| Stargate: identyfikacja odcinka, stare tokeny i blokada błędnego źródła | Testy `stargate.test.mjs`; audyt archiwalnych adresów | Rzeczywiste klatki każdego materiału; szczególnie Atlantis S01E09 pozostaje zablokowany |
| Aktualizacja serwera/Android TV przez DCC | Przygotowana paczka i projekt wpisu katalogu | Obraz GHCR `amd64`/`arm64`, wdrożenie oraz weryfikacja zachowania `/data` po restarcie |

**Status odbioru: blokada publikacji.** Pełny zestaw testów nie przeszedł, nie potwierdzono wideo żadnego z 314 odcinków, nie zakończono testów na fizycznym Android TV ani w obrazie CI/GHCR. Nie wiadomo, dlaczego źródłowo obcy film odtwarzał się pod Atlantis S01E09. Nie ma potwierdzonego zamiennika. Żaden tag, obraz GHCR ani GitHub Release 1.3.24 nie został opublikowany.

## Plan pojedynczej publikacji

1. Przejście pełnego zestawu testów oraz weryfikacji obrazu na wszystkich dostępnych materiałach i pilota Android TV.
2. Jeden commit zawierający obie grupy poprawek, tag `v1.3.24`, test i publikacja obrazów GHCR `1.3.24` na obie architektury.
3. Jeden GitHub Release `v1.3.24` z archiwum `CinemaHub-Server-v1.3.24.zip`, **APK `CinemaHub-AndroidTV-v1.3.24.apk`**, sumami SHA-256 i notatkami. Zaktualizowany wpis katalogu DCC powinien wskazywać `1.3.24`, aby Updater wykrył tę wersję.
4. Aktualizacja przez DCC Updater z zachowaniem wolumenu `/data` i potwierdzony test po restarcie.
