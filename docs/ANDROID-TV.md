# Cinema Hub na Android TV

Gotowy klient: **[CinemaHub-AndroidTV-v1.3.6.apk](https://github.com/hattimon/CINEMA-HUB/releases/latest)**. Android 6 lub nowszy; pakiet `pl.cinemahub.tv`. Klient zawiera Media3/ExoPlayer i obsługę pilota. Był przygotowywany i weryfikowany z myślą o projektorze Magcubic L018; działanie dekoderów i pilota zależy także od urządzenia.

## Instalacja

1. Zainstaluj serwer Cinema Hub na Windows albo Raspberry Pi.
2. Pobierz APK z Releases lub z adresu swojego serwera `/download/cinema-hub.apk`.
3. Przenieś APK na TV lub projektor i otwórz w menedżerze plików. W razie potrzeby zezwól temu menedżerowi na instalowanie aplikacji.
4. Uruchom Cinema Hub i wpisz IP z portem, np. `IP_SERWERA:8090` albo `IP_PI:9999`.
5. Zaloguj się do swojego konta Cinema Hub.

APK 1.3.6 w tym repozytorium jest podpisany tym samym kluczem co poprzednia wersja i działa z serwerem 1.3.7. Instaluj go jako aktualizację istniejącej Cinema Hub. Adres można zmienić przez **MENU → Adres IP / URL serwera**.

## Aktualizacje aplikacji

Cinema Hub sprawdza nowe wydanie po uruchomieniu i pyta, czy pobrać aktualizację. Ręczne sprawdzenie jest dostępne w **MENU → Sprawdź aktualizacje**. Po pobraniu APK aplikacja weryfikuje sumę SHA-256 i otwiera instalator Androida. Zatwierdź instalację na ekranie systemowym. Przy pierwszej aktualizacji włącz dla Cinema Hub opcję **Zezwalaj z tego źródła**; Android może poprosić o nią przed instalacją.

## Pilot i odtwarzanie

| Przycisk / akcja | Działanie |
| --- | --- |
| Strzałki | Poruszanie się po panelu i przyciskach |
| OK na liście odcinków | Wejście do wierszy i wybór odcinka |
| Pełny ekran | Ukrycie menu podczas seansu |
| OK na pełnym ekranie | Pauza i pokazanie menu |
| Wznów | Odtwarzanie z ukrytym menu |
| Lewo / prawo podczas odtwarzania | Przewijanie o 10 sekund |
| MENU albo góra na pełnym ekranie | Pauza i przyciski odtwarzacza |
| Wstecz | Wyjście z pełnego ekranu, następnie zamknięcie seansu |
| MENU → Odśwież | Pobranie aktualnego panelu z serwera |

Wybrany pełny ekran i postęp oglądania są zachowywane między odcinkami. Preferencje Autoplay i hostingu zmienisz podczas seansu.

## Android TV 1.3.6

Menu obrazu i dźwięku wysuwa się jako kompaktowa karta z prawej strony. Film i przyciski odtwarzacza pozostają widoczne, a tło nie jest przyciemniane. Każda droga otwarcia menu podczas seansu prowadzi do tego samego panelu. Obejmuje profile obrazu dla projektora, kino i łagodne SD, opcjonalne efekty CRT oraz wzmocnienie dźwięku.

W trakcie automatycznego sprawdzania można otworzyć źródła i uruchomić wcześniej sprawdzony hosting. Ograniczenie całego portalu pokazuje licznik, jeśli portal poda czas; limit pojedynczego hostingu kieruje automat do następnego.

## Logowanie do Vider i innych źródeł

W **Ustawienia → Źródła** wybierz **Zaloguj / CAPTCHA**. Wyświetlany jest zdalny pulpit Chromium, działającego w kontenerze.

Na Android TV rozsuń panel **noVNC po lewej stronie** i użyj ikony klawiatury. Następnie wpisz login lub hasło do zaznaczonego pola. Możesz też użyć klawiatury USB/Bluetooth albo dokończyć logowanie przez panel z komputera, na tym samym koncie Cinema Hub. Na końcu wybierz **Zakończ i zachowaj sesję**.

Kliknięcie pola w zdalnym pulpicie nie musi automatycznie otworzyć klawiatury Androida — to pole przeglądarki kontenera. Sesja przeglądarki używanej do przeglądania GitHub lub Codex nie jest sesją źródła Cinema Hub.

## Zapis na urządzeniu

Pobieranie jest ręczne. Android zapisuje wybrany materiał przez systemową usługę Pobierania; postęp oglądania pozostaje na koncie serwera.

## Android TV 1.3.4

Nowy pasek odtwarzania ma kompaktowe ikony w jednym wierszu. Zaznaczenie ikony pilotem pokazuje opis przy osi czasu. Ikona **⋮** otwiera menu korekcji obrazu, efektów CRT i wzmocnienia cichych nagrań (100%, 150%, 200%). Profile do projektora i efekty retro są opcjonalne; domyślnie obraz oraz dźwięk pozostają naturalne. W menu jest też ponowienie odtwarzania tego samego odcinka.

Instaluj APK jako aktualizację poprzedniej aplikacji. Podpis wersji 1.3.4 jest zgodny z 1.3.3. Nie odinstalowuj aplikacji, jeśli chcesz zachować adres serwera i lokalną sesję WebView. Pełne zapisywanie nowych opcji w profilu wymaga aktualnego panelu z serwera.

## Android TV 1.3.5

MENU podczas seansu otwiera efekty bez pauzy. Wybór obrazu, CRT i głośności pozostaje otwarty do porównywania zmian. Góra podczas buforowania pokazuje szczegóły; w aktualnym panelu przy źródłach jest przycisk „Wznów oglądanie”. Instaluj jako aktualizację 1.3.4, bez odinstalowywania aplikacji.
