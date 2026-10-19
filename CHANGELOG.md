# Historia wydań

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
