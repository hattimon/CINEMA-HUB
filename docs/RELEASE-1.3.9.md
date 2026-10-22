# Cinema Hub — serwer i kontener 1.3.9

Wydanie z 22 października 2026 poprawia wyszukiwanie filmów i seriali oraz układ odtwarzacza. Tag GitHub: `v1.3.9`. Obraz kontenera: `ghcr.io/hattimon/cinema-hub:1.3.9`.

## Wyszukiwanie w wybranych źródłach

Wyszukiwarka korzysta ze źródeł zaznaczonych nad katalogiem. Można wybrać sam Filman, sam Vider, oba serwisy jednocześnie albo dodać kolejne skonfigurowane źródła. Wyłączone serwisy nie są odpytywane, a błąd jednego źródła nie usuwa wyników pozostałych.

Filman korzysta teraz z pełnej strony wyszukiwania, z obsługą jej paginacji. Odczyt uwzględnia tekstowe tytuły filmów i seriali oraz pozycje bez okładki. Jeżeli portal zamiast wyników zwróci stronę logowania, panel wyświetli informację o konieczności ponownego zalogowania w ustawieniach źródła.

Vider korzysta z wyszukiwarki całego serwisu zamiast filtrować wyłącznie pozycje z aktualnie otwartej strony katalogu. Serwer czeka na załadowanie wyników i odczytuje nawigację między stronami. Przykładowe zapytanie „Stargate” zostało sprawdzone na rzeczywistym serwisie i zwróciło między innymi „Stargate SG-1” oraz „Stargate Universe”.

## Odtwarzacz

Usunięto pionowy pasek przewijania widoczny obok filmu. Poprawka obejmuje odtwarzanie w oknie oraz pełny ekran aplikacji z profilami obrazu i filtrami CRT. Odtwarzacz mieści wideo i sterowanie w dostępnej wysokości, a przewijanie strony w tle jest zablokowane. Zamknięcie filmu przywraca normalne przewijanie katalogu.

## Aktualizacja

Obraz `ghcr.io/hattimon/cinema-hub:1.3.9` oraz tag `latest` obejmują `linux/amd64` i `linux/arm64`. Oba warianty przechodzą testy w GitHub Actions przed publikacją wspólnego manifestu. Wersja serwera w diagnostyce i stanie aplikacji wynosi 1.3.9.

Przy aktualizacji zachowaj dotychczasowe montowanie `/data`, port, zmienne środowiskowe i plik `.env`. W konfiguracji przypiętej do starszej wersji wybierz obraz 1.3.9, a następnie pobierz obraz i odtwórz usługę. Standardowa aktualizacja kontenera zachowuje konta, konfigurację źródeł, logowania, historię i zapisane listy.

Paczka `CinemaHub-Server-v1.3.9.zip` zawiera serwer, panel, konfigurację i instalatory dla Windows oraz Raspberry Pi. Nie zawiera danych bieżącej instalacji. Suma SHA-256 jest dostępna w `SHA256SUMS-Server-v1.3.9.txt`.

## Android TV

To wydanie serwera i kontenera. Nie powstaje nowy APK 1.3.9 ani tag Androida. Dotychczasowy klient pobiera poprawiony panel z serwera. Pakiet serwera zawiera ten sam kompatybilny klient, który był dołączony do poprzedniego obrazu.

## Weryfikacja

Zestaw 62 testów obejmuje wyszukiwanie w jednym, dwóch i większej liczbie źródeł, pomijanie wyłączonego serwisu, zachowanie wyników przy wygasłej sesji, oczekiwanie na wyniki Vider i ich kolejne strony. Testy przeglądarkowe sprawdzają komputer i telefon, odtwarzanie w oknie oraz pełnym ekranie z CRT, a także przywrócenie przewijania po zamknięciu filmu. Sprawdzana jest zgodność numeru wersji pakietu, stanu serwera i diagnostyki.

Test rzeczywistego Vider nie wymagał zapisanej sesji. Filman został sprawdzony na izolowanych danych testowych; dostępność zewnętrznych portali i hostingów zależy również od ich działania oraz ważności logowania użytkownika.
