# Cinema Hub 1.3.27 — wydanie wyłącznie serwerowe

Aktualizacja presetów Stargate w obrazach Docker dla `linux/amd64` i
`linux/arm64`. Punktem wyjścia jest poprawka `9c2f038` na gałęzi `main`.

## Zmiana w serwerze

- W `stargate_chronologia_cinema_hub.json` oraz
  `stargate_od_s08_cinema_hub.json` pozycja Atlantis S01E18
  „The Gift” jest oznaczona jako źródło niepotwierdzone
  (`availability: unverified`, `series_code: null`). Nie przypisujemy
  automatycznie niezweryfikowanego wideo.
- Zachowane są kolejność playlist, pozostałe metadane i blokada
  niezweryfikowanego odcinka Atlantis S01E09.
- Zmieniono manifesty serwera, instalatory i konfiguracje Compose:
  `ghcr.io/hattimon/cinema-hub:1.3.27` po publikacji obrazu.

## Android TV bez zmian

**Nie istnieje nowe APK 1.3.27.** W obrazie serwera i w archiwum serwera
pozostaje `CinemaHub-AndroidTV-v1.3.26.apk` (Android TV
`versionName 1.3.26`, `versionCode 18`). Pobranie z nowego serwera:
`/download/cinema-hub.apk`. Oryginalny APK i jego SHA256:
[wydanie v1.3.26](https://github.com/hattimon/CINEMA-HUB/releases/tag/v1.3.26).

GitHub Release `v1.3.27` zawiera serwerowy ZIP, sumę SHA256 serwera,
manifest z dwoma niezależnymi numerami wersji oraz **ponownie udostępniony,
niezmieniony APK 1.3.26** z oryginalną sumą SHA256. Dzięki temu starsze
telewizory nadal mogą wykryć aktualizację Android TV do 1.3.26 przez
`releases/latest`. Urządzenia z zainstalowaną wersją 1.3.26 nie otrzymają
fałszywego powiadomienia o nowszym APK. Nie budujemy ani nie publikujemy
aplikacji Android TV 1.3.27.

## Wydanie i katalog DCC

1. Przetestuj build oraz testy natywne `linux/amd64` i `linux/arm64`.
2. Po zatwierdzeniu opublikuj commit i tag `v1.3.27`; workflow
   publikuje obrazy `1.3.27-amd64`, `1.3.27-arm64`,
   wieloarchitekturowy `1.3.27` i `latest`, a następnie GitHub Release.
3. Po potwierdzeniu manifestu dla obu architektur aktualizuj **wyłącznie**
   wpis Cinema Hub w `hattimon/DCC` według
   [proponowanej zmiany](DCC-CATALOG-v1.3.27.patch), albo odśwież
   metadane przez `catalog-maintenance.yml` → `workflow_dispatch`.
4. W DCC odśwież skan **Kontenery**; updater powinien wskazywać
   `ghcr.io/hattimon/cinema-hub:1.3.27`.

Nie usuwaj ani nie zastępuj istniejącego wolumenu `/data`.
[Instrukcja instalacji](INSTALL.md) · [Audyt Stargate](AUDIT-1.3.27.md).

Testy metadanych nie potwierdzają prawidłowości materiałów wideo na
zewnętrznych serwisach ani odbioru na fizycznym Android TV.
