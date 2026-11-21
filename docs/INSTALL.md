# Instalacja kontenerowa

Serwer 1.3.24 obsługuje platformy `linux/amd64` i `linux/arm64`. Na Windows używaj Docker Desktop w trybie kontenerów Linux. Na Raspberry Pi używaj systemu 64-bit i Docker Compose. Profil Pi ogranicza kontener do 2 CPU i 1536 MB RAM.

## Instalacja przez DCC

Cinema Hub jest już w kategorii **Media** sklepu aplikacji [Docker Control Center (DCC)](https://github.com/hattimon/DCC). Wybierz host Docker na Windows lub Linux, następnie **SKLEP → Media → Cinema Hub → Instaluj**. DCC uruchomi lokalny kontener z gotową konfiguracją. Na Windows używaj działającego Docker Desktop z kontenerami Linux; na Linux wymagany jest Docker. Możesz także wybrać zdalny host obsługiwany przez DCC, np. Raspberry Pi ARM64.

DCC Container Updater szuka wydania dla obrazu `ghcr.io/hattimon/cinema-hub`. Na 21.11.2026 katalog DCC wskazuje jeszcze `1.3.15`; wydanie `1.3.24` oczekuje na sukces CI i publikację GHCR oraz GitHub Release. Zaktualizuj katalog dopiero po publikacji obu architektur. Następnie odśwież skan **Kontenery**, wybierz Cinema Hub i sprawdź docelowy obraz `ghcr.io/hattimon/cinema-hub:1.3.24`. Kontener utworzony w sklepie DCC możesz zaktualizować przyciskiem **Aktualizuj**. Jeśli używasz lokalnej nazwy obrazu, przełącz instalację na obraz GHCR z zachowaniem dotychczasowego podpięcia `/data`.

Jeśli uruchamiasz Cinema Hub z Compose na Windowsie, użyj akcji **Windows: przygotuj aktualizację z zachowaniem bazy** w DCC Container Updater 1.1.9 lub nowszym. Uruchom pobrany skrypt w PowerShell 7 na hoście Docker Desktop. Sprawdź wynik testu na kopii bazy, potem uruchom skrypt z `-Apply`. Do kolejnych ręcznych uruchomień Compose dołącz wygenerowany plik `images.override.json` albo ustaw tę samą wersję w konfiguracji.

W instalacji Compose na Linuksie, w tym na Raspberry Pi, ustaw w istniejącym `.env` wartość `APP_IMAGE=ghcr.io/hattimon/cinema-hub:1.3.24`. Odśwież skan w DCC i zastosuj aktualizację usługi. DCC musi mieć dostęp do plików projektu i do ścieżki z danymi, jeśli są podpięte z dysku. Jeśli DCC nie zarządza tym projektem, użyj poleceń Compose z sekcji **Aktualizacje przez Compose**.

Opis i zrzuty aplikacji: **[hattimon.github.io/CINEMA-HUB](https://hattimon.github.io/CINEMA-HUB/)**.

## Windows

1. Sklonuj repo do lokalnej kompilacji wersji 1.3.24. Po przejściu CI pobierz i rozpakuj [paczkę serwera 1.3.24](https://github.com/hattimon/CINEMA-HUB/releases/tag/v1.3.24) z opublikowanego wydania.
2. Otwórz PowerShell w katalogu Cinema Hub.
3. Do czasu publikacji obrazu uruchom `.\install-windows.ps1 -Build` (lokalny znacznik `cinema-hub:local-1.3.24`). Po publikacji uruchom `.\install-windows.ps1`: instalator pobierze obraz 1.3.24 i po udanym uruchomieniu zaktualizuje tylko `APP_IMAGE` w `.env`, zachowując kopię poprzedniej konfiguracji. Jeżeli polityka PowerShell blokuje plik, możesz dla tego uruchomienia użyć `powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 -Build`.
4. Otwórz `http://localhost:8090/`. Na TV wpisz adres IP komputera i port 8090.
5. Zaloguj konto `admin` hasłem z lokalnego `.env`.

Instalator bez `-Build` wykonuje najpierw `docker compose pull cinema` i przerywa działanie, jeśli obraz nie jest dostępny. Zachowuje dotychczasowe ustawienia i hasło, także przy aktualizacji z wcześniejszej wersji. Lokalna kompilacja nie zapisuje do `.env` znacznika GHCR i nie usuwa wolumenu `/data`. DCC Updater wymaga później przejścia na opublikowany obraz GHCR.

## Raspberry Pi

1. Pobierz paczkę serwera albo sklonuj repo na Pi.
2. Do czasu publikacji obrazu 1.3.24 wykonaj `sh install-raspberry-pi.sh --build`. Po publikacji wykonaj `sh install-raspberry-pi.sh`, aby pobrać przetestowany obraz GHCR.
3. Otwórz `http://IP_RASPBERRY_PI:9999/`.
4. Zaloguj konto `admin` hasłem z `.env`.

Budowa z kodu na Pi: `sh install-raspberry-pi.sh --build` (lokalny obraz `cinema-hub:local-1.3.24`). Zwykły instalator najpierw pobiera opublikowany obraz 1.3.24, zapisuje poprzedni obraz działającego kontenera jako `cinema-hub:rollback-<czas UTC>`, a po pomyślnym uruchomieniu aktualizuje `APP_IMAGE` w `.env` i tworzy kopię `.env.backup-<czas UTC>`. W celu przywrócenia zapisz tag rollback w `APP_IMAGE` w `.env`, następnie wykonaj `docker compose -f compose.pi.yaml up -d --no-build --pull never cinema`. Zachowaj oryginalne podpięcie `/data`. Paczka wydania zawiera również gotowy panel `dist/` do użycia z `Dockerfile.pi`.

## Ręczne uruchomienie

Skopiuj `.env.example` do `.env` i ustaw własne hasło w `INITIAL_ADMIN_PASSWORD`.

```sh
# Windows / Linux
docker compose up -d
docker compose ps
docker compose logs --tail 50 cinema

# Raspberry Pi
docker compose -f compose.pi.yaml up -d
docker compose -f compose.pi.yaml ps
docker compose -f compose.pi.yaml logs --tail 50 cinema
```

Dodaj `--build` do `up`, aby zbudować obraz lokalnie. Port ustawia `APP_PORT`; przykładowe wartości to 8090 na Windows i 9999 na Pi. `LAN_BIND` pozwala przypisać port do konkretnego interfejsu. TV i serwer muszą mieć połączenie sieciowe, a zapora hosta musi dopuszczać wybrany port.

## Aktualizacje przez Compose

W istniejącym `.env` zaktualizuj `APP_IMAGE` do `ghcr.io/hattimon/cinema-hub:1.3.24`, a następnie uruchom z tego samego katalogu projektu:

```sh
docker compose pull cinema
docker compose up -d --no-build --no-deps --pull never --wait cinema
```

Na Pi dodaj `-f compose.pi.yaml` do obu poleceń, jeśli instalacja używa tego pliku. Instalacje budowane ze źródeł można odświeżyć przez `up -d --build` po pobraniu nowszego kodu.

Wolumen `cinema-state` przechowuje bazę, klucz szyfrowania i profile przeglądarki. Zwykła wymiana kontenera zachowuje te dane. `INITIAL_ADMIN_PASSWORD` jest używane wyłącznie podczas tworzenia pierwszego konta; zmiana tej zmiennej nie resetuje istniejącego hasła.

## Kopia danych

Zatrzymaj usługę `cinema` i wykonaj kopię całego wolumenu danych. Zachowaj razem bazę, `credentials.key` i katalog `browser/`. Klucz jest potrzebny do odczytu zapisanych logowań. Nie usuwaj wolumenu podczas aktualizacji.

Lokalny reset hasła, dostępny z terminala administratora serwera:

```sh
docker compose exec cinema node server/cli.mjs reset-password --user admin
```

## APK z serwera

Kontener udostępnia dołączony klient Android pod `/download/cinema-hub.apk`. Możesz też pobrać go bezpośrednio z [Releases](https://github.com/hattimon/CINEMA-HUB/releases/latest). APK instaluje się na telewizorze lub projektorze, a nie wewnątrz kontenera.

## HTTPS

Za własnym reverse proxy HTTPS ustaw `COOKIE_SECURE=true` i prawidłowe `PUBLIC_ORIGIN`. Bez HTTPS pozostaw `COOKIE_SECURE=false`. Osobny port pulpitu logowania nie jest wystawiany — noVNC jest dostępne przez panel, dla właściciela aktywnej sesji.
