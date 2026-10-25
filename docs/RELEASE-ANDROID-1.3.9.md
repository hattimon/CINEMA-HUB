# Android 1.3.9 — wielojęzyczne wyszukiwanie głosowe

Wydanie z 25 października 2026. Tag wydania Android: **`android-v1.3.9`**. APK: **`CinemaHub-AndroidTV-v1.3.9.apk`**, pakiet `pl.cinemahub.tv`, versionCode **13**. Wymagany panel serwera **1.3.12** (tag kontenera `v1.3.12`).

## Nowości

- **Mikrofon przy wyszukiwarce.** Wybierz ikonę pilotem i naciśnij OK, a następnie powiedz tytuł w systemowym oknie Androida. Funkcja nie zależy od mikrofonu Gboard. Po wyniku aktualizuje istniejące pole React i uruchamia standardowe wyszukiwanie. Filtry, źródła i sortowanie pozostają; wyniki zaczynają się od strony 1.
- **Języki świata.** Domyślnie używany jest język urządzenia. Ikona języków pozwala wybrać 35 popularnych wariantów, w tym English (US/UK), polski, niemiecki, francuski, hiszpański, arabski i japoński, albo własny tag BCP 47. Wybór zapisuje się lokalnie. Zmieniasz język mówionego tytułu niezależnie od języka interfejsu. Dostępność zależy od usługi Androida; lista nie gwarantuje obsługi wszystkich języków przez każdy silnik.
- **Dwie ścieżki Androida.** Systemowy `RecognizerIntent` jest wyborem domyślnym. Gdy go nie ma lub użytkownik po błędzie wybierze „Spróbuj usługi w aplikacji”, działa `SpeechRecognizer`. Tylko ta bezpośrednia ścieżka żąda dla Cinema Hub uprawnienia do mikrofonu w czasie działania.
- **Pilot i diagnostyka.** Strzałki, OK, Wstecz i Anuluj obsługują funkcję. Są komunikaty o odmowie uprawnienia, braku usługi, audio, sieci, mowy lub języka. Jedna aktywna próba, limity czasu i sprzątanie zapobiegają pozostawieniu mikrofonu w tle.
- **Istniejąca architektura.** Rozszerzony most `CinemaNative` sprawdza origin, główną ramkę, bieżący URL i identyfikator prośby. Do panelu trafia tylko tekst. Cinema Hub nie zapisuje audio ani nie wysyła go do swojego serwera. Usługa Androida może przetwarzać je online według własnych ustawień.

## Aktualizacja istniejącej aplikacji

1. W Cinema Hub wybierz **MENU → Sprawdź aktualizacje**, albo uruchom aplikację ponownie. Nowy APK jest załączony do najnowszego wydania GitHub, którego szuka istniejący aktualizator.
2. Zatwierdź pobranie i systemowy instalator Androida. Przy pierwszej takiej instalacji może być potrzebne „Zezwalaj z tego źródła”. **Nie odinstalowuj poprzedniej aplikacji i nie czyść jej danych.** Pakiet i podpis pozostają zgodne z publicznym APK 1.3.7 (versionCode 11); zbadano także zgodność z lokalnym 1.3.6.
3. Jeżeli aktualizator nie znajdzie wydania (np. limit API GitHub), pobierz APK ręcznie z Assets tego wydania i zainstaluj jako aktualizację. SHA-256 jest w `SHA256SUMS-AndroidTV-v1.3.9.txt`; aktualizator weryfikuje również digest publikowany przez GitHub.
4. Zaktualizuj panel/kontener serwera do **1.3.12**, zachowując istniejące `/data`, `.env`, porty, konta i sesje. Odśwież panel na Androidzie. Sama instalacja APK nie dodaje przycisku do starego interfejsu pobieranego z serwera.

Wydanie serwera jest osobne: `v1.3.12`. Zmienia numer domyślnego obrazu w konfiguracji i instalatorach; nie zmienia portów ani wolumenów. GitHub Actions testuje obrazy `amd64` i `arm64` przed publikacją `ghcr.io/hattimon/cinema-hub:1.3.12` i `latest`. Samo wydanie APK nie aktualizuje automatycznie Twojego kontenera.

## Przykład po angielsku / English example

Wybierz ikonę języków → **English (US)** → **Zapisz / Save**, a następnie mikrofon i powiedz **“The Lord of the Rings”**. Wyszukiwarka otrzyma angielski tekst.

**English:** Select the language icon, choose the language you will speak, save, and start voice search. The default follows your device language. Your Android speech provider must support that language. Cinema Hub does not translate movie titles: results depend on the titles and search capabilities of your selected sources. This change does not translate the entire app interface.

## Weryfikacja i ograniczenia

Kompilacja panelu, testy przeglądarkowe, testy sesji i języków Java, kompilacja release Androida, Android Lint i podpis APK zostały zweryfikowane lokalnie. Dokładne wyniki i SHA-256 znajdują się w dołączonym `CinemaHub-VoiceSearch-verification-1.3.12.json`.

**Nie wykonano rzeczywistego testu mikrofonu Bluetooth na Magcubic L018.** Odpowiedzi rozpoznawania w testach przeglądarkowych są symulowane. Testy kodu, kompilacja i zgodny podpis nie potwierdzają dostępu firmware do mikrofonu pilota ani jakości rozpoznawania. Pilot może udostępniać mikrofon tylko Asystentowi. Sprzętowy klawisz zarezerwowany przez system nadal uruchomi Asystenta; wtedy użyj ikony ekranowej. Działanie offline zależy od dostawcy usługi i pobranych pakietów.

[Szczegółowa instrukcja, protokół i test Magcubic L018](VOICE-SEARCH.md).
