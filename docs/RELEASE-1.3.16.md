# Cinema Hub 1.3.16 – logowanie do Filmana

Okno **Zaloguj / CAPTCHA** otwiera formularz Filmana w zwykłym Chromium. Zmiana usuwa konfigurację Playwright z ręcznego logowania, która w kontenerze prowadziła do powtarzania weryfikacji Cloudflare. W teście na Docker Desktop użytkownik przeszedł weryfikację i zobaczył formularz logowania.

1. Otwórz **Ustawienia → Źródła → Filman → Zaloguj / CAPTCHA**.
2. Wykonaj weryfikację portalu i zaloguj się w otwartym oknie.
3. Kliknij **Zakończ i zachowaj sesję**. Cinema Hub zamknie okno po zapisaniu profilu.

Test integracyjny sprawdza zapis świeżego ciasteczka sesji, ponowne użycie profilu i zgodność identyfikacji Chromium podczas odczytu katalogu. Odczyt odbywa się na osobnym ekranie wirtualnym, poza widokiem logowania użytkownika.

Obraz `ghcr.io/hattimon/cinema-hub:1.3.16` obsługuje `linux/amd64` i `linux/arm64`. DCC wykrywa wydanie po odświeżeniu katalogu dla instalacji opartych na repozytorium `ghcr.io/hattimon/cinema-hub`. Projekty Docker Compose na Windows korzystają z procedury PowerShell udostępnianej przez DCC. [Instrukcja aktualizacji](https://github.com/hattimon/CINEMA-HUB/blob/v1.3.16/docs/INSTALL.md)
