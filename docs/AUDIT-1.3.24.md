# Cinema Hub v1.3.24 — audyt Stargate i gotowość wspólnego wydania

## Zakres i dowody

Analiza dwóch **archiwalnych** migawek bazy `cinema.sqlite`: 314 rekordów odcinków z rozpoznanymi stronami seriali Filman (SG-1: 214; Atlantis: 100; Universe: 0; Origins: 0). Kontrolowano typ źródła, serial, identyfikatory w ścieżkach URL, sezon/odcinek, duplikaty oraz zgodność z pozycjami presetów playlist. Zidentyfikowano również 16 innych wpisów Stargate z pozostałych źródeł, dla których brak dowodu tożsamości nagrania.

**Nie odtworzono ani nie zbadano żadnej klatki wideo.** Dla żadnego odcinka nie potwierdzono więc poprawności rzeczywistej treści. Nie przeprowadzono audytu bieżącej produkcyjnej bazy ani aktywnych playlist użytkowników. Wynik obejmuje tylko istniejące migawki.

| Serial | Sezon / odcinek | Wykryty problem | Wykonana naprawa | Status weryfikacji |
| --- | --- | --- | --- | --- |
| Stargate Atlantis | S01E09 „Dom” | Użytkownik zgłosił odtwarzanie obcego filmu; pierwotna przyczyna źródłowa nieustalona | Blokada bezpośredniego i playlistowego odtwarzania do czasu znalezienia potwierdzonego nagrania; zachowane ID i postęp | Błędna treść zgłoszona; blokada przetestowana; właściwe wideo nieznalezione |
| Stargate Atlantis | Pozostałe 99 pozycji | Nie wykryto konfliktów adresów w archiwalnym katalogu | Walidacja tożsamości i konfliktów podczas synchronizacji | Metadane/URL skontrolowane; wideo niezweryfikowane |
| Stargate SG-1 | 214 pozycji | Nie wykryto konfliktów adresów w archiwalnym katalogu | Walidacja tożsamości i konfliktów podczas synchronizacji | Metadane/URL skontrolowane; wideo niezweryfikowane |
| Stargate Universe | Brak pozycji w migawkach | Brak materiału do kontroli | Przygotowano reguły walidacji nowych odcinków | Brak wideo do zweryfikowania |
| Stargate Origins | Brak pozycji w migawkach | Brak materiału do kontroli | Przygotowano reguły walidacji nowych odcinków | Brak wideo do zweryfikowania |
| Inne źródła Stargate | 16 wpisów katalogu | Tożsamość nagrań niepotwierdzona | Brak automatycznego potwierdzenia; wymagana kontrola ręczna | Nierozstrzygnięte |

Liczba sprawdzonych **rekordów metadanych**: **314**. Liczba zgłoszonych błędów: **1**. Wykryte dodatkowe błędne przypisania w archiwalnych adresach: **0**. Zweryfikowanych i podmienionych wideo: **0**. Zablokowanych niepewnych przypisań: **1** (Atlantis S01E09). W playlistach archiwalnych migawek nie wykryto wadliwych powiązań, co nie potwierdza stanu aktywnych playlist.

### Lista odcinków bez potwierdzenia treści wideo

- SG-1: sezony 1–7, **S01E01–S07E22** (22 na sezon), oraz sezony 8–10, **S08E01–S10E20** (20 na sezon): razem 214.
- Atlantis: sezony 1–5, **S01E01–S05E20** (20 na sezon): razem 100, w tym S01E09 wyłączony z odtwarzania.
- Universe i Origins: brak odcinków w badanych archiwach, więc nie można ich uznać za skontrolowane.
- Dodatkowe 16 wpisów z innych dostawców: tożsamość nagrania niepotwierdzona.

## Testy lokalne

- Ukierunkowany zestaw testów Stargate, playlist, migracji, dziennika postępu, CLI oraz CI (`node --test tests/stargate.test.mjs tests/playlist.test.mjs tests/cli.test.mjs tests/playlist-journal.test.mjs tests/playlist-migration.test.mjs tests/release-ci.test.mjs`): **51/51 OK** ponownie po uzupełnieniu zawartości obrazu `ci_test`. Obejmuje m.in. blokadę S01E09 przy pobieraniu/eksporcie, zachowanie postępu po zmianie źródła, odrzucanie błędnych ID, migrację i dziennik offline.
- `npm run build`: **OK**, TypeScript i Vite.
- Izolowany `node --test tests/cli.test.mjs` zmiany hasła na nowej bazie tymczasowej: **1/1 OK**. Test integracyjny wymaga ukończenia wcześniejszego tworzenia konta `viewer` przez HTTP; ta zależność pozostaje niezweryfikowana przy zablokowanym localhost.
- Android TV: `assembleRelease` i `lintRelease` **OK** (49 zadań Gradle), automatyczne zestawy testów Java **159/159 OK**. APK 1.3.24 ma `versionCode` 16 i zostało podpisane zgodnym certyfikatem; brak testu na sprzęcie.
- Korygowano `.dockerignore`, który pomijał wymagane przez `Dockerfile` APK 1.3.24; workflow sprawdza plik przed budowaniem obu obrazów.
- `npm test`: **80 OK / 35 niepowodzeń / 21 pominiętych** (136 łącznie), log `output/cinema-test-1.3.24-recheck2.log`. Testy integracyjne nie miały dostępu do `127.0.0.1`: `connect EACCES`, `fetch failed`, `net::ERR_NETWORK_ACCESS_DENIED`; test resetu hasła w pełnym przebiegu zależał od wcześniej nieutworzonego konta HTTP. Wymagane ponowienie całego zestawu przy sprawnym localhost.
- `docker info`: **odmowa dostępu** do `npipe:////./pipe/dockerDesktopLinuxEngine`. DCC MCP umożliwił wyłącznie kontrolę stanu lokalnych kontenerów (produkcyjna wersja 1.3.23 zdrowa); nie uruchomiono nowego obrazu. Przygotowano etap Dockerfile `ci_test` i workflow CI, ale nie zweryfikowano ich wewnątrz kontenera.
- Test rzeczywistego obrazu oraz fizycznego pilota i odtwarzania Android TV: **nieprzeprowadzony**.

## DCC Updater / publikacja

Obraz docelowy: `ghcr.io/hattimon/cinema-hub:1.3.24`, architektury `linux/amd64` i `linux/arm64`; kontener zachowuje wolumen `/data`. Workflow `.github/workflows/container.yml` może zbudować obrazy po wypchnięciu tagu `v1.3.24`, ale lokalnie nie zweryfikowano ich instalacji. Aktualny katalog DCC wskazuje `1.3.23`: zastosuj `docs/DCC-CATALOG-v1.3.24.patch` w repozytorium DCC **dopiero po** publikacji obu manifestów GHCR i release GitHub. Funkcja `_catalog_candidate` DCC Updater odczytuje docelowy tag z katalogu.

Stan odnotowany przed publikacją: przygotowana wersja **1.3.24**, APK Android TV, pakiet ZIP i manifest (po każdej zmianie plików wymagane ponowne pakowanie i sprawdzenie sum). GitHub Release nie był jeszcze utworzony. Nadal brak weryfikacji Android TV na urządzeniu, całego zestawu testów w obrazie CI/GHCR, inspekcji bieżących playlist oraz rzeczywistego wideo dla odcinków Stargate. Atlantis S01E09 pozostaje zablokowany do czasu potwierdzenia właściwego nagrania.
