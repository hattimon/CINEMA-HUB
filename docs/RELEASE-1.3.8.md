# Cinema Hub — serwer i kontener 1.3.8

Wydanie z 20 października 2026 poprawia katalog Filman, nawigację stron i automatyczny wybór hostingu. Jest przeznaczone dla Dockera na Windows i Raspberry Pi z systemem 64-bit ARM64.

## Katalog i strony

Górna karuzela portalu zawiera polecane tytuły i powtarza się na stronach seriali. Wcześniej aplikacja dodawała ją do właściwych wyników, przez co różne strony i filtry mogły zaczynać się od tych samych seriali.

Panel rozdziela teraz te dane. Proponowane filmy ze strony głównej oraz proponowane seriale trafiają wyłącznie do Biblioteki, na jej pierwszą stronę bez aktywnego wyszukiwania, filtrów i własnego sortowania. Filmy i Seriale zawsze zaczynają się od właściwych wyników. Brak możliwości pobrania dodatkowych propozycji nie usuwa dostępnego katalogu.

Po zmianie strony panel przewija się do góry po wyrenderowaniu nowych wyników. Filtry, sortowanie i wyszukiwanie pozostają wybrane. Między przyciskami „Poprzednia” i „Następna” znajduje się pole numeru strony oraz liczba dostępnych stron. Numer zatwierdza się Enterem lub przyciskiem „Przejdź”; wartości poza zakresem nie uruchamiają przejścia.

## Auto i preferowane hostingi

Niezwiązane z hostingiem żądania AJAX i ramki w tle mogły zakończyć etap otwierania źródła, zanim portal faktycznie otworzył odtwarzacz. To tłumaczyło odtworzony przypadek, w którym Auto nie znajdowało wideo, a ponowny ręczny wybór działał. Automat rozpoznaje teraz żądania wybranego hostingu i nadal weryfikuje rzeczywisty strumień.

Kolejność sprawdzania:

- Bez wybranych hostingów: preferowana wersja językowa, następnie jakość malejąco, a przy remisie kolejność linków portalu.
- Z wybranymi hostingami: preferowana wersja językowa, następnie hostingi 1–3 w zapisanej kolejności, jakość malejąco w każdym z nich, a potem pozostałe hostingi.
- Przykład: VOE jako pierwszy hosting z lektorem 720p poprzedza inne źródło z lektorem 1080p. VOE z samymi napisami nie wyprzedza dostępnego lektora, jeżeli preferowaną wersją jest Lektor.

Hosting jest preferencją, a nie filtrem wykluczającym inne źródła. Sprawdzanie pozostaje sekwencyjne i zatrzymuje się na pierwszym potwierdzonym strumieniu. Rzeczywiste limity portalu i hostingu nadal są respektowane.

## Aktualizacja kontenera

Obrazy `ghcr.io/hattimon/cinema-hub:1.3.8` i `ghcr.io/hattimon/cinema-hub:latest` obejmują `linux/amd64` oraz `linux/arm64`. Docker wybiera właściwą architekturę hosta. Oba warianty przechodzą testy w GitHub Actions przed opublikowaniem wspólnego tagu.

Aktualizację można wykonać przez Aktualizator kontenerów albo w istniejącym katalogu Compose, zachowując dotychczasowy port, zmienne środowiskowe i montowanie `/data`. Dla kontenera przypiętego do konkretnej wersji należy wybrać obraz 1.3.8, a dla śledzącego `latest` pobrać nowszy obraz tego tagu. Nie usuwaj wolumenu ani danych aplikacji podczas odtwarzania kontenera.

Paczka `CinemaHub-Server-v1.3.8.zip` zawiera kod serwera, panel i konfigurację dla obu platform. Istniejące pliki `.env`, konta, logowania do źródeł i bazy danych pozostają danymi bieżącej instalacji i nie są dołączane do paczki.

## Android TV

Nie powstaje APK 1.3.8. Dotychczasowy klient Android TV pobiera panel z serwera i korzysta z poprawki po jego aktualizacji. Wydanie `v1.3.8` jest wydaniem kontenera; osobne wydanie Androida pozostaje oznaczone jako najnowsze wydanie aplikacji.

## Weryfikacja

Na Windows i w izolowanym kontenerze Linux przeszło po 55 testów bez pominięć. Obejmują odczyt katalogu, prawdziwe metadane paginacji, przejścia 1 → 2 → 3, powrót, wpisanie numeru, nieprawidłowe numery, zachowanie filtrów, sortowania i wyszukiwania oraz widoki komputerowy, mobilny i TV.

Test odtwarzania z żądaniem w tle nie przechodzi na poprzednim obrazie 1.3.7, a przechodzi po poprawce z potwierdzonym MP4. Pozostałe testy sprawdzają między innymi HLS, ręczny wybór źródła, przerwanie Auto i izolację kont. Nie zastępują testu każdego zewnętrznego hostingu ani fizycznego urządzenia Android TV.
