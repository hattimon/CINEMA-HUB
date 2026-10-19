# Poprawka automatycznego odtwarzania — Windows, 19.10.2026

## Ustalenia

Logi lokalnego kontenera dla Stargate SG-1, sezon 2, odcinki 14 i 16,
pokazują reklamowy link zasłaniający tabelę hostingów Filman. Próby kliknięcia
dochodziły do reklamy; odtwarzacz nie otrzymywał strumienia. Występowały też
próby weryfikacji krótkich MP4 z media.tenor.com jako filmu. To potwierdza
problem z obsługą strony i jej reklam; nie dowodzi awarii całego Filman ani
błędu dekodera konkretnego telewizora.

Przy badaniu zapisanych limitów nie było aktywnej blokady z terminem.
Obecności zwykłej ramki reCAPTCHA nie traktujemy jako dowodu zablokowania konta.

## Zachowanie po poprawce

- Ręczny hosting można wybrać podczas Auto. Wybór anuluje poprzednie sprawdzanie.
- Anulowanie przerywa kolejkę Chromium, zamyka przygotowywane strony i anuluje
  żądania weryfikacji oraz ffprobe. Spóźniona odpowiedź nie zmienia źródła.
- `Zatrzymaj automat` działa w szczegółach odcinka i podczas przygotowania
  następnego odcinka. `Ponów odtwarzanie` uzyskuje nowy strumień bez zmiany odcinka.
- Jedno źródło ma budżet 75 s, całe sprawdzanie 4 min. Między hostingami jest
  1,2 s przerwy. To limity aplikacji, nie deklarowane terminy blokad portalu.
- Żądania panelu mają limit czasu; odczyt stanu sprawdzania ma limit 12 s.
  Odtwarzacz przeglądarkowy wykrywa brak postępu przez 45 s podczas startu
  lub odtwarzania. Dla istniejącego APK wykrywamy brak pierwszego potwierdzenia
  gotowości; dalsze buforowanie pozostaje pod kontrolą natywnego Media3.
- Rozpoznana reklamowa nakładka nie otrzymuje kliknięcia. Aktywowany jest
  wyłącznie wcześniej wybrany link hostingu. Formularze i CAPTCHA pozostają ręczne.
- Klipy Tenor/Giphy są pomijane przy wyszukiwaniu filmu.
- HTTP 429 portalu zatrzymuje Auto. `Retry-After` daje rzeczywisty licznik;
  brak nagłówka oznacza nieznany termin. Limit hostingu jest raportowany osobno
  i pozwala spróbować następnego hostingu. Wymagane logowanie/CAPTCHA zatrzymuje
  kolejne próby i wskazuje ustawienia źródła.

## Weryfikacja i zakres

Testy regresji obejmują przerwanie aktywnej i oczekującej pracy, limit czasu,
ponowienie bez starego cache, opóźniony wynik, reklamową nakładkę, ręczne
sterowanie w panelu i interfejsie TV, oba rodzaje komunikatów blokad oraz
zachowanie pełnego ekranu i kolejnych odcinków.

Testy z Chromium używają lokalnych stron i prawdziwego syntetycznego MP4/HLS.
Granica komunikacji z Androidem jest symulowana; nie potwierdza to działania
fizycznego pilota, dekodera ani wszystkich rzeczywistych hostingów.

Poprawka jest przygotowana dla serwera na Windows. Klient Android TV 1.3.4 zawiera kompaktowe sterowanie, menu obrazu oraz wzmocnienie dźwięku. Serwer nie jest wdrażany na Raspberry Pi. Nowe wydanie APK jest przygotowane do publikacji GitHub zgodnie z osobnym zleceniem użytkownika.

## Dodatki interfejsu i mediów

- Pełna ramka plakatu przy zaznaczeniu okładki lub tytułu, także w WebView z paint containment.
- Skala plakatów 60–140%, widoki gęsty, ściana okładek i lista; gęste widoki pomijają duży baner.
- Pilot: samo zaznaczenie suwaka rozmiaru okładek nie zmienia wartości. OK włącza regulację; ponowne OK lub Wstecz kończy ją i przywraca przechodzenie strzałkami do innych pól. Opuszczenie suwaka również kończy regulację. Mysz i dotyk zachowują bezpośrednią regulację.
- Ulubione są dostępne po otwarciu szczegółów filmu lub serialu. Na okładkach i banerze biblioteki nie ma osobnego przycisku serduszka zatrzymującego nawigację pilotem.
- W trakcie wyszukiwania hostingu można przejść strzałkami do ulubionych. Góra na pierwszym odcinku wychodzi nad listę; kolejna góra pokazuje okładkę i opis od początku okna.
- „Szczegóły i ulubione” otwiera szczegóły bez przerywania bieżącego odtwarzacza. „Wznów oglądanie” przy źródłach wraca do niego lub wznawia ostatnio zamknięty seans tego samego odcinka od ostatniej pozycji.
- Android TV 1.3.6: menu efektów otwiera kompaktowy panel po prawej bez przyciemniania obrazu. MENU na pilocie i przycisk odtwarzacza kierują do tego samego panelu. W przeglądarce menu otwiera ikona z trzema kropkami lub klawisz M.
- Jednowierszowy pasek ikon odtwarzacza. Opis natywnej ikony pojawia się przy osi czasu po zaznaczeniu pilotem.
- Menu odtwarzacza: naturalny obraz, profil jaśniejszy do projektora, kino i łagodne SD; osobno trzy style CRT. Domyślnie bez efektów. Filtry nie odzyskują utraconych szczegółów materiału.
- Dźwięk 100/150/200%. Android używa LoudnessEnhancer dla sesji filmu, panel Web Audio z ograniczeniem przesterowania. Brak wsparcia wyjścia audio daje komunikat i przywraca 100%.
- Motywy dźwięków interfejsu: miękki, arcade, minimalny, retro, filmowy, wiatr, szkło, futurystyczny.
- Ustawienia → Motyw zbiera kolory, układ, skalę okładek oraz dźwięki interfejsu. Dźwięki menu mają osobny poziom 0–100% i przycisk odsłuchu; 50% zachowuje dotychczasową głośność. Poziom zapisuje się na koncie, niezależnie od wzmocnienia ścieżki filmu. Suwak pilotem wymaga wejścia OK, a ponowne OK lub Wstecz kończy regulację.
- Vider: grupowanie SxxExx / 1x02 / Sezon–Odcinek, oddzielne filmy i pozostałe wideo. Klasyfikacja korzysta z nazw i dostępnych metadanych; nie analizuje treści nagrania.
- Opcjonalne łączenie zgodnych pozycji Vider z innymi źródłami; wyłączony Vider nie dostarcza dodatkowych hostingów. Dopasowanie jest ograniczone do już odczytanego katalogu, bez skanowania całego Vider.
- Równoległe identyczne odczyty strony współdzielą jedną operację; historia oglądania nie blokuje wyświetlenia biblioteki. Pierwszy odczyt Filman wykorzystuje stronę katalogu również do schematu filtrów, gdy go zawiera.

Implementacja dźwięku korzysta z [LoudnessEnhancer](https://developer.android.com/reference/android/media/audiofx/LoudnessEnhancer), a korekcja obrazu Android z [Media3 Brightness](https://developer.android.com/reference/androidx/media3/effect/Brightness) i Contrast. Profil naturalny nie nakłada filtrów. Ścieżka efektów jest inicjalizowana przed odtwarzaniem, aby można było zmieniać profile w czasie seansu. W razie błędu GPU klient wraca do naturalnego obrazu.
