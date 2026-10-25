# Wyszukiwanie głosowe — Android TV 1.3.9 / panel 1.3.13

Wydanie Android z wielojęzycznym rozpoznawaniem mowy. Podpis APK 1.3.9 jest zgodny z publicznym APK 1.3.7; versionCode wzrósł z 11 do 13. Testy automatyczne korzystają z symulowanych odpowiedzi usług mowy; nie potwierdzają działania mikrofonu Bluetooth ani jakości rozpoznawania. Test fizycznego Magcubic L018 pozostaje do wykonania; opis wydania jasno odróżnia testy automatyczne od rzeczywistego audio.

## Uruchomienie

1. Zaktualizuj panel serwera do przygotowanej wersji 1.3.13 i APK do 1.3.9 (`pl.cinemahub.tv`, versionCode 13). Zachowaj dotychczasowy wolumen `/data`, `.env`, adres serwera i dane aplikacji. Aktualizacja panelu wymaga przebudowania/aktualizacji kontenera, z zachowaniem dotychczasowych portów, wolumenów i zmiennych.
2. Obok pola „Szukaj filmów i seriali” wybierz ikonę mikrofonu i naciśnij OK. Nie trzeba uruchamiać dyktowania Gboard.
3. W oknie Androida powiedz np. „Pingwiny z Madagaskaru” po wybraniu języka polskiego albo „The Lord of the Rings” po wybraniu English. Po wyniku aplikacja wpisuje tekst do kontrolowanego pola React i uruchamia tę samą funkcję wyszukiwania co zatwierdzenie formularza. Wybrane źródła, filtry i sortowanie pozostają; numer strony wraca do 1.
4. Wstecz lub Anuluj zamyka rozpoznawanie bez zmiany tekstu i uruchamiania wyszukiwania. Zaznaczenie wraca do mikrofonu.

Pilot: prawo na końcu tekstu wybiera mikrofon; kolejne prawo wybiera Szukaj. Lewo wraca do pola. Góra/dół pozwalają opuścić pole i poruszać się po panelu. W oknach działają strzałki, OK i Wstecz. Kursor pozostaje opcją klienta dla urządzeń, które go potrzebują.

## Język rozpoznawania / Speech language

Domyślny wybór to **Język urządzenia / Device language**. Android otrzymuje bieżący język urządzenia, np. `en-GB` albo `pl-PL`. To nie jest automatyczne zgadywanie języka wypowiedzi; automatyczne przełączanie między językami zależy od silnika i nie jest wymagane przez tę funkcję.

Ikona języków obok mikrofonu otwiera wybór obsługiwany pilotem. Dostępnych jest 35 popularnych wariantów, m.in. English (US/UK), polski, niemiecki, francuski, hiszpański, portugalski, ukraiński, arabski, hindi, chiński, japoński i koreański. Pozycja **Inny język / Other language** pozwala wpisać inny poprawny tag BCP 47, np. `zh-Hant-TW`. Lista nie deklaruje obsługi przez konkretny silnik; rzeczywista dostępność zależy od usługi Androida. Wybór zapisuje się lokalnie na urządzeniu, osobno dla adresu serwera. Sam wybór języka nie aktywuje mikrofonu.

Aby dyktować angielskie tytuły na polskim urządzeniu, wybierz **English (US)** lub **English (UK)**, zapisz i użyj mikrofonu, np. „The Lord of the Rings”. Tekst jest przekazywany do dotychczasowej wyszukiwarki bez tłumaczenia, także z alfabetami innymi niż łaciński. Znalezienie filmu zależy od nazw i możliwości wyszukiwania wybranego źródła: rozpoznanie angielskiego tytułu nie zapewnia tłumaczenia go na polską nazwę katalogową.

**English:** Open the language icon next to the microphone, choose the language you will speak, save, and start voice search. Device language follows Android settings. Other language accepts a BCP 47 tag. Available languages and offline packs depend on your Android speech provider. Cinema Hub sends the transcript to the existing catalog search; it does not translate movie titles or localize the entire application interface.

Wariant bezpośredni Androida ma teksty systemowego okna Cinema Hub po polsku i domyślnie po angielsku. Wybór języka mowy jest niezależny od tłumaczenia interfejsu. Starszy APK 1.3.8 nie deklaruje obsługi wyboru języka; aktualny panel nie pokazuje na nim tego ustawienia ani nie obiecuje zmiany jego stałego `pl-PL`.

## Mechanizm i uprawnienia

Pierwsza ścieżka to `RecognizerIntent.ACTION_RECOGNIZE_SPEECH`: firmware TV może obsłużyć mikrofon pilota we własnym oknie rozpoznawania, podobnie jak w wyszukiwaniu Google Play. To jest decyzja implementacji, a nie potwierdzenie zgodności konkretnego pilota. Używamy `LANGUAGE_MODEL_FREE_FORM`, `EXTRA_LANGUAGE z wybranym tagiem BCP 47 (np. en-US, pl-PL)`, jednego wyniku i bez wyników częściowych.

Jeżeli system nie udostępnia aktywności rozpoznawania lub nie można jej uruchomić, klient korzysta z `SpeechRecognizer`. Po błędzie przycisk „Spróbuj usługi w aplikacji” pozwala użytkownikowi jawnie wybrać tę drugą ścieżkę. Nie ma automatycznego ponawiania nagrywania po anulowaniu lub błędzie.

Tylko bezpośredni `SpeechRecognizer` potrzebuje uprawnienia Cinema Hub `RECORD_AUDIO` w czasie działania. Jest żądane przy wyborze tej ścieżki. Odmowa kończy bieżącą próbę i pokazuje instrukcję **Ustawienia Androida → Aplikacje → Cinema Hub → Uprawnienia → Mikrofon → Zezwalaj podczas używania**. Systemowa aktywność rozpoznawania zarządza dostępem własnej aplikacji. Nie dodajemy uprawnień Bluetooth, kontaktów, lokalizacji, usług pierwszoplanowych ani dostępu do wszystkich pakietów. Mikrofon jest opcjonalną cechą sprzętu w manifeście.

Widoczność pakietów na Androidzie 11–14 zapewniają dwie deklaracje `queries`: `android.speech.RecognitionService` i `android.speech.action.RECOGNIZE_SPEECH`. Klient sprawdza dostępność mechanizmu przed jego użyciem. Systemowa usługa może wymagać internetu albo korzystać z własnego pakietu offline; obecność języka polskiego offline nie gwarantuje jego użycia przez każdy silnik. Nie wymuszamy offline kosztem dostępności.

## Most i cykl życia

Rozszerzony jest istniejący `WebViewCompat.addWebMessageListener("CinemaNative", …)`. Nie dodajemy `addJavascriptInterface` ani drugiego mostu. Android akceptuje tylko główną ramkę bieżącego głównego WebView, z originu skonfigurowanego serwera, przy zgodnym aktualnym URL WebView. Okna logowania i ramki zewnętrzne nie mogą uruchamiać funkcji natywnych.

| Kierunek | Typ | Dane |
| --- | --- | --- |
| Panel → Android | `voice_search_capabilities` | `requestId` |
| Android → Panel | `voice_search_capabilities` | `requestId`, `supported`, `available`, `languageSelection`, `defaultLanguage` |
| Panel → Android | `voice_search_start` | `requestId`, `language` (`system` lub tag BCP 47), opcjonalnie `direct: true` |
| Panel → Android | `voice_search_cancel` | `requestId` |
| Android → Panel | `voice_search_result` | `requestId`, `text` |
| Android → Panel | `voice_search_error` | `requestId`, `code` |
| Android → Panel | `voice_search_cancelled` | `requestId` |

`requestId` to 32 małe znaki szesnastkowe. Polecenia odtwarzacza nadal używają `playbackId`; nie zmieniają protokołu. Nowy panel pokazuje mikrofon dopiero po odpowiedzi o obsłudze funkcji. Zwykła przeglądarka i starszy klient zachowują standardowe wyszukiwanie tekstowe.

Tylko jedna próba może być aktywna. Podwójne OK i przytrzymanie klawisza nie uruchamiają kolejnego mikrofonu. Wynik jest przekazywany przez `JavaScriptReplyProxy` do dokumentu, który zainicjował prośbę. Stare, zduplikowane i niepasujące odpowiedzi są odrzucane. Tekst jest ograniczony do 500 znaków, pozbawiany znaków sterujących i renderowany jako tekst React, bez wykonania HTML/JavaScript.

Koniec, błąd, anulowanie i limit 60 sekund zwalniają bezpośredni recognizer przez `cancel()`/`destroy()`, zamykają okno i usuwają zegar. Wyjście aplikacji z pierwszego planu zatrzymuje rozpoznawanie bezpośrednie; otwarcie własnego systemowego okna rozpoznawania może kontynuować bieżącą próbę. Zmiana strony/serwera, odtwarzacz, zniszczenie Activity i awaria renderera również kończą próbę. Demontaż komponentu (np. wejście w ustawienia) anuluje prośbę. Panel ma dodatkowy limit 65 sekund.

Cinema Hub nie zapisuje nagrań ani nie wysyła dźwięku do swojego serwera. Przekazuje tylko tekst do istniejącego API wyszukiwania. Usługa mowy Androida może przetwarzać audio na serwerach swojego dostawcy, zależnie od jej ustawień. Nie ma własnego modelu AI.

## Przycisk mikrofonu pilota

Gdy Android dostarczy do Activity `KEYCODE_SEARCH`, `KEYCODE_VOICE_ASSIST` lub `KEYCODE_ASSIST`, klient uruchamia tę samą funkcję panelu, poza odtwarzaniem i innymi oknami. Nie rejestrujemy globalnych skrótów i nie zastępujemy Asystenta. Jeżeli system przechwytuje przycisk dla Asystenta Google, Cinema Hub go nie otrzyma. Wtedy używaj ekranowej ikony mikrofonu.

Niektóre piloty udostępniają kanał mikrofonu wyłącznie oprogramowaniu producenta lub Asystentowi. Ani `SpeechRecognizer`, ani zainstalowany pakiet językowy nie gwarantują dostępu do takiego kanału. Obsługiwane są Android TV, Google TV i projektory Android z dostępną usługą mowy oraz wejściem audio udostępnionym tej usłudze.

## Diagnostyka

| Objaw / kod | Działanie |
| --- | --- |
| Brak ikony | Sprawdź APK 1.3.9 i panel 1.3.13, odśwież panel; zaktualizuj systemowy WebView, jeśli nie obsługuje istniejącego mostu. |
| `unavailable` | Włącz/zaktualizuj usługę rozpoznawania mowy w Androidzie; sprawdź, czy urządzenie ma okno rozpoznawania lub `RecognitionService`. |
| `permission_denied` | Zezwól Cinema Hub na mikrofon w ustawieniach Androida; nie czyść danych aplikacji. |
| `audio`, `no_speech`, `no_match` | Sprawdź parowanie i baterie pilota, globalny przełącznik mikrofonu Androida 12+, wykonaj próbę w Google Play i Cinema Hub. Porównaj okno systemowe z „Spróbuj usługi w aplikacji”. Sukces Asystenta nie dowodzi dostępu innych aplikacji. |
| `network` | Sprawdź internet; skonfiguruj wybrany język/pakiet offline w usłudze. Połączenie do lokalnego Cinema Hub nie zastępuje internetu dla silnika online. |
| `language` | Włącz obsługę wybranego języka w systemowej usłudze. |
| `busy` | Zamknij inną operację używającą mikrofonu albo inne okno klienta; ponów ręcznie. |
| `timeout`, `client`, `server` | Zamknij okno, sprawdź usługę i spróbuj ponownie. Rozpoznawanie nie pozostaje aktywne w tle. |
| Mikrofon klawisza uruchamia Asystenta | To rezerwacja systemowa; wybierz ikonę obok pola wyszukiwania. |

## Test na Magcubic L018 / Android 14

1. Zainstaluj APK jako aktualizację; sprawdź zachowanie konta, adresu i sesji. Zaktualizuj panel serwera do 1.3.13 i wybierz **MENU → Odśwież**. Nie kasuj wolumenu `/data` ani danych aplikacji.
2. W ikonie języków wybierz Polski. Pilotem przejdź do pola, naciśnij prawo na końcu tekstu, wybierz mikrofon i OK. Powiedz **„Pingwiny z Madagaskaru”**. Warunkiem zaliczenia jest rzeczywiście rozpoznany tekst w polu i wyświetlenie standardowych wyników albo autentycznej informacji o braku pasujących treści z wybranych źródeł.
3. Wybierz English (US), powiedz „The Lord of the Rings”, a potem sprawdź język urządzenia i inny zainstalowany język. Powtórz dla serialu. Ustaw filtr, sortowanie i wybrane źródła, przejdź na stronę 2; po mowie sprawdź zachowanie filtrów oraz powrót do strony 1.
4. Uruchom mikrofon i anuluj Wstecz; tekst i wyszukiwanie nie powinny się zmienić. Powtórz 5 razy, także z podwójnym OK i przytrzymaniem klawisza. Sprawdź powrót zaznaczenia i brak wskaźnika mikrofonu po zakończeniu.
5. Po błędzie wybierz **Spróbuj usługi w aplikacji**. Odrzuć prośbę o mikrofon, sprawdź diagnostykę, następnie przyznaj uprawnienie w ustawieniach i ponów. Jeżeli pierwsza ścieżka działa bez błędu, ten wariant można sprawdzić na urządzeniu bez systemowej aktywności rozpoznawania. Sama odmowa uprawnienia Cinema Hub nie musi blokować okna systemowego innej aplikacji.
6. Sprawdź ciszę, rozłączony pilot, wyłączony systemowy mikrofon oraz brak internetu. Jeżeli usługa potrafi pracować offline, brak internetu może zakończyć się prawidłowym wynikiem zamiast błędem.
7. Podczas bezpośredniego rozpoznawania przejdź do ekranu głównego Androida; sprawdź, że mikrofon został zwolniony. Wróć i ponów. Osobno sprawdź sprzętowy przycisk mikrofonu; jeśli otworzy Asystenta, wróć i użyj ikony w aplikacji.
8. Uruchom dotychczasowy film i kanał IPTV, sprawdź sterowanie, dźwięk, pełny ekran i Wstecz. Funkcja głosowa nie powinna uruchamiać się podczas odtwarzania.

Wynik testu sprzętu zapisz z wersją firmware, WebView, usługi mowy, używaną ścieżką oraz rzeczywistym wynikiem audio. Do tego czasu status to **weryfikacja sprzętowa oczekuje**, nie „mikrofon Bluetooth działa”.

## Źródła platformy

- [RecognizerIntent — systemowe okno, język i wyniki](https://developer.android.com/reference/android/speech/RecognizerIntent)
- [SpeechRecognizer — RECORD_AUDIO, queries, główny wątek i destroy](https://developer.android.com/reference/android/speech/SpeechRecognizer)
