# Instalacja kontenerowa

Serwer 1.3.12 obsługuje platformy `linux/amd64` i `linux/arm64`. Na Windows używaj Docker Desktop w trybie kontenerów Linux. Na Raspberry Pi używaj systemu 64-bit i Docker Compose. Profil Pi ogranicza kontener do 2 CPU i 1536 MB RAM.

## Instalacja przez DCC

Cinema Hub jest już w kategorii **Media** sklepu aplikacji [Docker Control Center (DCC)](https://github.com/hattimon/DCC). Wybierz host Docker na Windows lub Linux, następnie **SKLEP → Media → Cinema Hub → Instaluj**. DCC uruchomi lokalny kontener z gotową konfiguracją. Na Windows używaj działającego Docker Desktop z kontenerami Linux; na Linux wymagany jest Docker. Możesz także wybrać zdalny host obsługiwany przez DCC, np. Raspberry Pi ARM64.

Opis i zrzuty aplikacji: **[hattimon.github.io/CINEMA-HUB](https://hattimon.github.io/CINEMA-HUB/)**.

## Windows

1. Pobierz i rozpakuj [paczkę serwera 1.3.12](https://github.com/hattimon/CINEMA-HUB/releases/tag/v1.3.12) albo sklonuj repo.
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

## Aktualizacje

```sh
docker compose pull
docker compose up -d
```

Na Pi dodaj `-f compose.pi.yaml` do obu poleceń. W przypadku instalacji ze źródeł pobierz nowe pliki i użyj `up -d --build`. W `.env` możesz przypiąć konkretną wersję przez `APP_IMAGE`.

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
