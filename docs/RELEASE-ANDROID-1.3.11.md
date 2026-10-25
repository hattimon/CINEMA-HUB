# Android TV 1.3.11 — rozpoznawanie mowy, Asystent Google i dźwięk

Oficjalny klient `pl.cinemahub.tv`, `versionCode 15`, z zachowanym podpisem. Wymaga panelu Cinema Hub 1.3.14. Opis obejmuje wdrożenie usług głosowych oraz pozostałe zmiany od wcześniejszych publicznych klientów 1.3.7/1.3.10.

- **Działające rozpoznawanie mowy w Cinema Hub.** Przycisk mikrofonu przy wyszukiwarce korzysta automatycznie z osobnej aplikacji Google **Rozpoznawanie i synteza mowy** (`com.google.android.tts`). Wynik trafia do istniejącej wyszukiwarki z zachowaniem źródeł, filtrów i sortowania. Nie ma wyboru alternatywnych okien, domyślnego Asystenta ani ścieżki Gboard. Stare zapisane wybory nie zmieniają nowej usługi.
- **Języki.** Język urządzenia, 35 popularnych wariantów oraz własny tag BCP 47. Dostępność zależy od zainstalowanej usługi Google. Tytuły nie są tłumaczone.
- **Możliwość wyłączenia i ponownego włączenia Asystenta Google.** **MENU → Asystent Google — wyłącz / włącz ręcznie** otwiera szczegóły właściwego pakietu w Androidzie. Na Magcubic L018 użytkownik potwierdził wyłączenie `com.google.android.katniss` i poprawne rozpoznawanie bez przejmowania ekranu przez Asystenta. Zmiana jest ręczna i obowiązuje na całym urządzeniu; zwykła aplikacja nie może automatycznie przełączać systemowego pakietu przy uruchamianiu lub zamykaniu. Osobną aplikację „Rozpoznawanie i synteza mowy” należy pozostawić włączoną.
- **Prostsze ustawienia.** Usunięto eksperymentalną blokadę przycisku, usługę dostępności i niedziałające ścieżki konfiguracji. Pozostały stan mikrofonu, pomiar sygnału, uprawnienia oraz diagnostyka aplikacji.
- **Stabilny cykl rozpoznawania.** Obsługa końcowych wyników, podglądu częściowych słów, anulowania, timeoutów, przejścia do tła i spóźnionych callbacków. Cinema Hub nie zapisuje nagrań i nie wysyła ich do swojego serwera; dźwięk przetwarza wybrana usługa Google.
- **Menu ustawień bez samoczynnego okna plików.** OK aktywuje zaznaczony przycisk, a systemowy wybór pliku wymaga wcześniejszego użycia przycisku otwierania lokalnego filmu lub folderu. Celowy wybór plików pozostaje dostępny.
- **Czytelne menu podczas filmu.** Etykiety opcji są ustawione przed pokazaniem panelu i renderowane programowo, aby obejść zgłoszony problem pierwszego rysowania tekstu na Androidzie.
- **Dźwięk od pierwszej próbki nowego filmu.** Zapisany tryb jest podłączany do dekodowanego PCM przed przygotowaniem kolejnego odtwarzacza. Nie trzeba ponownie wybierać 200% po otwarciu następnego filmu.
- **100%, 150%, 200%, 250%, 300%, AUTO i Normalizer** w natywnym menu **Obraz i głośność → Wzmocnienie dźwięku**. AUTO wzmacnia ciche materiały i osłabia bardzo głośne; Normalizer na bieżąco wyrównuje poziom między materiałami. Działa limiter szczytów. Są to ustawienia tego urządzenia Android, nie głośność zapisywana przez serwer dla przeglądarek.

AUTO i Normalizer mierzą RMS podczas odtwarzania; nie wykonują analizy całego filmu ani pełnej normalizacji LUFS. Dźwięk, dekoder i wyświetlanie etykiet wymagają dalszego testu na konkretnym projektorze. Użytkownik potwierdził rzeczywiste rozpoznawanie mowy na Magcubic L018 / Android 14 / RK3562 przed uproszczeniem selektora do tej samej usługi.

Instaluj APK jako aktualizację. Zachowaj adres serwera, dane Cinema Hub, konta, ustawienia i IPTV. Osoby testujące wcześniejszy kandydat z identycznym numerem 1.3.11 muszą ręcznie zainstalować plik oficjalnego wydania. Klient nie może zablokować klawisza przechwyconego wcześniej przez firmware. Nie jest potrzebna zmiana firmware.

[Instrukcja głosu](VOICE-SEARCH.md) · [Kontener 1.3.14](RELEASE-1.3.14.md)
