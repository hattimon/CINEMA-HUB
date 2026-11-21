# Cinema Hub 1.3.25 — wydanie serwera i Android TV

Wydanie 1.3.25 obejmuje poprawki playlist, zabezpieczeń źródeł
Stargate oraz instalatorów przygotowane po publicznym tagu `v1.3.24`.
Tag `v1.3.24` pozostał bez zmian. Publikacja wersji 1.3.25 przez
GitHub Actions następuje dopiero po pomyślnych testach natywnych
`linux/amd64` i `linux/arm64` oraz utworzeniu manifestu GHCR.

## Zmiany

- Odtwarzanie playlist pamięta ostatni odcinek i pozycję, chroni
  dziennik postępu przy przerwanym połączeniu oraz odrzuca błędne
  dopasowania odcinków. Więcej w [1.3.24](RELEASE-1.3.24.md).
- Test pełnoekranowego odtwarzania na ARM64 korzysta z własnego pliku
  VP8/WebM z FFmpeg. Test nadal sprawdza rozpoczęcie rzeczywistego
  odtwarzania w Chromium.
- Instalator Windows pobiera obraz przed aktualizacją, oddziela
  `-Build` od wydania GHCR i zachowuje kopię `.env`.
- Instalator Raspberry Pi zachowuje poprzedni obraz do rollbacku,
  zapisuje kopię `.env` i aktualizuje wskazanie obrazu dopiero po
  pomyślnym uruchomieniu.
- Klient Android TV `pl.cinemahub.tv` ma `versionName 1.3.25`,
  `versionCode 17` i zachowuje identyfikator pakietu.

## Pobieranie i aktualizacja

- Obraz Docker: `ghcr.io/hattimon/cinema-hub:1.3.25` dla AMD64
  (Docker Desktop / Linux) i ARM64 (64-bit Raspberry Pi).
- Archiwum: `CinemaHub-Server-v1.3.25.zip`.
- Android TV: `CinemaHub-AndroidTV-v1.3.25.apk`, również dostępny
  w uruchomionym serwerze jako `/download/cinema-hub.apk`.
- Pliki `SHA256SUMS-Server-v1.3.25.txt` i
  `SHA256SUMS-AndroidTV-v1.3.25.txt` umożliwiają kontrolę pobrań.

Po publikacji wykonaj `.\install-windows.ps1` na Windows lub
`sh install-raspberry-pi.sh` na Raspberry Pi. Skrypty zachowują
dotychczasowe wolumeny, dane kont i konfigurację. Kopia `.env`
oraz tag obrazu rollback ułatwiają powrót do wcześniejszej wersji.
Szczegóły w [instrukcji instalacji](INSTALL.md).

## Ograniczenia

Audyt Stargate obejmuje metadane archiwalne; nie potwierdza obrazu
314 odcinków. Atlantis S01E09 pozostaje zablokowany do czasu
ustalenia prawidłowego materiału. Test na fizycznym Android TV
pozostaje do wykonania. Wyniki CI, digesty i artefakty zweryfikuj
na stronie wydania oraz w GHCR po publikacji.
