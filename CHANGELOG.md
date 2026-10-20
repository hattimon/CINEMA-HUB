# Historia wydań

## Serwer i kontener 1.3.8 — katalog, strony i automatyczny wybór źródła

- **Proponowane tytuły tylko w Bibliotece.** Sekcje z prawdziwymi filmami i serialami polecanymi przez Filman są dostępne wyłącznie na pierwszej, niefiltrowanej stronie Biblioteki. Widoki Filmy i Seriale zaczynają się od właściwej listy wyników. Karuzela portalu, boczne panele i komentarze nie są częścią tej listy.
- **Kolejne strony od początku nowych wyników.** Po wybraniu następnej, poprzedniej lub wpisanej strony panel przewija się do góry po załadowaniu wyników. Zachowuje wyszukiwanie, filtry i sortowanie. Pole „Strona … z …” pokazuje liczbę stron danego wyboru; numer można zatwierdzić Enterem lub przyciskiem „Przejdź”.
- **Auto nie zatrzymuje się na żądaniu w tle.** Ładowanie ramki społecznościowej albo niezwiązanego z hostingiem żądania AJAX nie jest już traktowane jako otwarcie wybranego odtwarzacza. Usuwa to odtworzony w teście przypadek, w którym automat kończył bez wideo, a ręczne ponowienie tego samego źródła działało.
- **Czytelne priorytety hostingów.** Bez preferencji decydują wersja językowa, jakość i kolejność dostępnych linków. Z ustawionymi hostingami w ramach tej samej wersji językowej obowiązuje kolejność hostingów 1–3, od najwyższej jakości w każdym, a następnie pozostałe źródła. Preferencje nie wykluczają pozostałych hostingów. Panel i serwer stosują tę samą kolejność.
- **Windows i Raspberry Pi:** jeden numer serwera 1.3.8, obrazy `linux/amd64` i `linux/arm64`, publikowane dopiero po testach na obu architekturach. Aktualizacja zachowuje istniejący wolumen `/data`.
- **Bez nowego APK.** To wydanie serwera i kontenera. Dotychczasowy klient Android TV pobiera poprawiony panel z serwera; wydania Androida pozostają osobne.

Weryfikacja: 55 testów bez pominięć na Windows i w lokalnym kontenerze Linux, w tym paginacja w widoku komputerowym, mobilnym i TV, filtry, wyszukiwanie, rzeczywiste MP4/HLS oraz odtworzenie błędu Auto na obrazie 1.3.7 i poprawne działanie tego samego scenariusza po poprawce. Szczegóły aktualizacji: [wydanie 1.3.8](docs/RELEASE-1.3.8.md).

## Wydanie 1.3.7 — nowe funkcje

- **Vider:** seriale są grupowane w sezony i odcinki, filmy trafiają do osobnej kategorii, a pozostałe nagrania są pokazywane na końcu. Opcjonalne łączenie zgodnych tytułów pozwala traktować Vider jako dodatkowe źródło filmu lub odcinka.
- **Biblioteka:** regulowany rozmiar okładek i dodatkowe zwarte układy mieszczą więcej tytułów na ekranie. Ulubione i lista „Chcę obejrzeć” są dostępne po otwarciu szczegółów filmu lub serialu.
- **Android TV 1.3.6:** menu korekcji obrazu, efektów CRT i wzmocnienia dźwięku otwiera się jako boczny panel bez przyciemniania obrazu. Zmiany są dostępne pilotem podczas seansu.
- **Odtwarzanie automatyczne:** można przejść do ręcznego wyboru źródła także podczas sprawdzania kolejnych hostingów. Globalny limit portalu pokazuje licznik, jeśli portal poda termin; limit pojedynczego hostingu przełącza sprawdzanie na następny.
- **Motyw i dźwięki:** ustawienia wyglądu, układów i dźwięków interfejsu są zebrane w zakładce „Motyw”; można wybrać styl dźwięku i ustawić głośność menu do 200%.
- **Biblioteka ładuje się sprawniej:** równoległe odczyty tej samej strony katalogu współdzielą pracę.

## Serwer 1.3.6

- Resolver VOE nie przełącza już aktywnego odtwarzacza w pauzę podczas buforowania; autoplay może wykryć i zweryfikować strumień.
- Sprawdzono pełny zestaw 36 testów w Chrome.

## Android TV 1.3.3

- Automatyczne sprawdzanie aktualizacji przy uruchomieniu oraz ręczna opcja w menu aplikacji.
- Pobieranie APK z publicznego wydania, weryfikacja SHA-256 i przekazanie instalacji do systemowego instalatora Androida.
- Android TV wymaga zatwierdzenia instalacji; przy pierwszym użyciu potrzebna jest zgoda „Zezwalaj z tego źródła”.
## Serwer 1.3.5

- Osobna konfiguracja źródeł; zachowanie zapisanych danych przy wyłączaniu i edycji.
- Przystań: katalog początkowy, skanowanie podfolderów, przeglądanie folderów i linki do plików.
- Vider: opcjonalne źródło, ręczne logowanie, przekierowanie `vider.info → vider.pl`, aktualne tytuły i okładki.
- Poprawione generowanie linków i sprawdzanie wcześniej zapisanych plików.
- Usuwanie konfiguracji źródła z potwierdzeniem, czyszczeniem sesji i powiązanych danych.
- Vider: oczekiwanie na katalog po zalogowaniu i odtwarzacz w ramce; poprawne karty bez komentarzy.
- Czytelne rozróżnienie błędu DNS, połączenia z Przystanią i ręcznej CAPTCHA.
- Weryfikacja 35 testów z Chromium, odtwarzaniem oraz izolacją kont.

## Android TV 1.3.2

- Pasek czasu w menu pauzy oraz przewijanie pilotem.
- Poprawiona nawigacja między odcinkami.
- Natywny odtwarzacz Media3, zachowanie postępu i wybór serwera.
- Klient korzysta z aktualnego panelu serwera; wydanie serwera 1.3.5 nie wymaga nowego APK.
