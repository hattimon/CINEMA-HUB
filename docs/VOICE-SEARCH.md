# Wyszukiwanie głosowe — Android TV 1.3.11 / panel 1.3.14

Cinema Hub używa bezpośrednio usługi Google **Rozpoznawanie i synteza mowy** (`com.google.android.tts`). Jest domyślna: nie trzeba wybierać dostawcy przy każdym uruchomieniu. Stare wybory Gboard, okna Androida i domyślnego Asystenta nie są używane.

## Uruchomienie

1. Zainstaluj APK 1.3.11 jako aktualizację i zaktualizuj panel do 1.3.14. Zachowaj dane aplikacji, adres serwera i wolumen kontenera.
2. W **MENU → Asystent Google — wyłącz / włącz ręcznie** otwórz ustawienia Google. Jeśli Asystent przejmuje przycisk mikrofonu, wybierz w Androidzie **Wyłącz** przy pakiecie `com.google.android.katniss`. Pozostaw włączoną osobną aplikację **Rozpoznawanie i synteza mowy**.
3. Przy wyszukiwarce wybierz ikonę mikrofonu i naciśnij OK. Przyznaj Cinema Hub dostęp do mikrofonu, jeśli Android o to poprosi. Powiedz „Pingwiny z Madagaskaru”. Tekst uruchamia zwykłe wyszukiwanie z zachowaniem źródeł, filtrów i sortowania.
4. Wstecz lub Anuluj kończy próbę. Częściowe słowa są tylko podglądem; katalog otrzymuje wynik końcowy.

Na Magcubic L018 użytkownik potwierdził działanie tej usługi bez Asystenta po ręcznym wyłączeniu pakietu Google. Przełącznik eksperymentalnej blokady nie miał wpływu na wynik i został usunięty razem z usługą dostępności. Ponowne włączenie Asystenta jest dostępne w tym samym ekranie szczegółów Google przez **Włącz**. Zmiana obowiązuje na całym urządzeniu, także po zamknięciu Cinema Hub. Automatyczna zmiana systemowego pakietu wymaga uprawnień, których standardowy APK nie ma.

## Język

Ikona języków obok mikrofonu udostępnia język urządzenia, 35 wariantów oraz własny tag BCP 47, np. `pl-PL`, `en-US`, `en-GB`, `zh-Hant-TW`. Wybór jest zapisywany lokalnie dla adresu serwera. Dostępność języków i trybu offline zależy od usługi Google. Rozpoznany tytuł nie jest tłumaczony; wyniki zależą od katalogu danego źródła.

## Mikrofon i diagnostyka

**MENU → Mikrofon i rozpoznawanie** zawiera stan usługi, dziesięciosekundowy test poziomu mikrofonu, uprawnienia Cinema Hub oraz diagnostykę ostatnich zamknięć aplikacji. Test poziomu nie rozpoznaje słów i nie zapisuje próbek. Brak sygnału w tej próbie nie ustala samodzielnie przyczyny sprzętowej.

Gdy usługa jest niedostępna, włącz lub zaktualizuj **Rozpoznawanie i synteza mowy Google**. Aplikacja nie przełącza się automatycznie na Asystenta. Gboard pozostaje zwykłą klawiaturą systemową i można go używać przez pole tekstowe, ale nie jest alternatywną opcją nowego selektora.

Dźwięk przetwarza usługa Google zgodnie z jej ustawieniami; Cinema Hub dostaje tekst, nie zapisuje nagrań i nie przesyła audio do swojego serwera. Klient wiąże odpowiedzi z bieżącą próbą, anuluje ją po przejściu do tła i odrzuca spóźnione callbacki. Rzeczywisty kanał mikrofonu pilota i klawisze zarezerwowane przez firmware zależą od urządzenia.

## Menu dźwięku Androida

**Obraz i głośność → Wzmocnienie dźwięku**: 100%, 150%, 200%, 250%, 300%, AUTO, Normalizer. Zapisany tryb jest stosowany od początku kolejnego filmu. AUTO podnosi ciche i osłabia zbyt głośne materiały; Normalizer wyrównuje RMS podczas odtwarzania. To lokalne przetwarzanie PCM w Androidzie, z ogranicznikiem szczytów, bez analizy LUFS całego nagrania. Pozostaje do sprawdzenia słuchowo na projektorze.

[Android 1.3.11](RELEASE-ANDROID-1.3.11.md) · [Kontener 1.3.14](RELEASE-1.3.14.md)
