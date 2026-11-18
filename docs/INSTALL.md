# Instalacja kontenerowa

Serwer 1.3.19 obsługuje platformy `linux/amd64` i `linux/arm64`. Na Windows używaj Docker Desktop w trybie kontenerów Linux. Na Raspberry Pi używaj systemu 64-bit i Docker Compose. Profil Pi ogranicza kontener do 2 CPU i 1536 MB RAM.

## Instalacja przez DCC

Cinema Hub jest już w kategorii **Media** sklepu aplikacji [Docker Control Center (DCC)](https://github.com/hattimon/DCC). Wybierz host Docker na Windows lub Linux, następnie **SKLEP → Media → Cinema Hub → Instaluj**. DCC uruchomi lokalny kontener z gotową konfiguracją. Na Windows używaj działającego Docker Desktop z kontenerami Linux; na Linux wymagany jest Docker. Możesz także wybrać zdalny host obsługiwany przez DCC, np. Raspberry Pi ARM64.

DCC Container Updater szuka wydania dla obrazu `ghcr.io/hattimon/cinema-hub`. Odśwież skan **Kontenery**, wybierz Cinema Hub i sprawdź, czy celem jest `ghcr.io/hattimon/cinema-hub:1.3.19`. Kontener utworzony w sklepie DCC możesz zaktualizować przyciskiem **Aktualizuj**. Jeśli używasz lokalnej nazwy obrazu, przełącz instalację na obraz GHCR i zachowaj dotychczasowe podpięcie `/data`.

Jeśli uruchamiasz Cinema Hub z Compose na Windowsie, użyj akcji **Windows: przygotuj aktualizację z zachowaniem bazy** w DCC Container Updater 1.1.9 lub nowszym. Uruchom pobrany skrypt w PowerShell 7 na hoście Docker Desktop. Sprawdź wynik testu na kopii bazy, potem uruchom skrypt z `-Apply`. Do kolejnych ręcznych uruchomień Compose dołącz wygenerowany plik `images.override.json` albo ustaw tę samą wersję w konfiguracji.

W instalacji Compose na Linuksie, w tym na Raspberry Pi, ustaw w istniejącym `.env` wartość `APP_IMAGE=ghcr.io/hattimon/cinema-hub:1.3.19`. Odśwież skan w DCC i zastosuj aktualizację usługi. DCC musi mieć dostęp do plików projektu i do ścieżki z danymi, jeśli są podpięte z dysku. Jeśli DCC nie zarządza tym projektem, użyj poleceń Compose z sekcji **Aktualizacje przez Compose**.

Opis i zrzuty aplikacji: **[hattimon.github.io/CINEMA-HUB](https://hattimon.github.io/CINEMA-HUB/)**.

## Windows

1. Pobierz i rozpakuj [paczkę serwera 1.3.19](https://github.com/hattimon/CINEMA-HUB/releases/tag/v1.3.19) albo sklonuj repo.
2. Otwórz PowerShell w katalogu Cinema Hub.
3. Uruchom `.\install-windows.ps1`. Jeżeli polityka PowerShell blokuje plik, możesz dla tego uruchomienia użyć `powershell -ExecutionPolicy Bypass -File .\install-windows.ps1`.
4. Otwórz `http://localhost:8090/`. Na TV wpisz adres IP komputera i port 8090.
5. Zaloguj konto `admin` hasłem z lokalnego `.env`.

Budowa obrazu z kodu: `.\install-windows.ps1 -Build`.

## Raspberry Pi

1. Pobierz paczkę serwera albo sklonuj repo na Pi.
2. W katalogu projektu wykonaj `sh install-raspberry-pi.sh`.
3. Otwórz `http://IP_RASPBERRY_PI:9999/`.
4. Zaloguj konto `admin` hasłem z `.env`.

Budowa z kodu na Pi: `sh install-raspberry-pi.sh --build`. Paczka wydania zawiera również gotowy panel `dist/` do użycia z `Dockerfile.pi`.

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

W istniejącym `.env` zaktualizuj `APP_IMAGE` do `ghcr.io/hattimon/cinema-hub:1.3.19`, a następnie uruchom z tego samego katalogu projektu:

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
