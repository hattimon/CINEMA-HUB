# Cinema Hub 1.3.14 — wyszukiwanie głosowe dla Windows i Raspberry Pi

Opis zmian względem ostatniego publicznego kontenera **1.3.10**. Wydanie udostępnia funkcje panelu 1.3.14 testowanego lokalnie na Windowsie. Tag `v1.3.14`, obrazy `ghcr.io/hattimon/cinema-hub:1.3.14` i `latest`, platformy `linux/amd64` i `linux/arm64`. Klient Android ma niezależny numer **1.3.11**.

- **Mikrofon w wyszukiwarce.** Ikona uruchamia usługę rozpoznawania w nowym kliencie Android. Pełny rozpoznany tytuł uruchamia zwykłe wyszukiwanie we wszystkich zaznaczonych źródłach, zachowuje filtry i sortowanie oraz wraca na pierwszą stronę wyników.
- **Wybór języka mowy.** Język urządzenia, 35 wariantów i własny poprawny tag BCP 47; wybór zapisuje się lokalnie. Obsługa polskich, angielskich i innych tytułów bez tłumaczenia zapytania.
- **Obsługa pilotem.** Mikrofon i język są dostępne przez strzałki i OK; Wstecz anuluje próbę. Po zakończeniu rozpoznawania można dalej poruszać się po dotychczasowym katalogu.
- **Anulowanie i diagnostyka.** Identyfikatory prób chronią przed spóźnionym wynikiem; błędy uprawnień, usługi, audio, sieci, języka i ciszy mają osobne komunikaty. Ponowienie używa aktualnej usługi w aplikacji.
- **Zgodność ze zwykłą przeglądarką i starszym APK.** Wpisywanie tekstu pozostaje dostępne, a nieobsługiwane przyciski głosu nie są pokazywane. Dźwięk nie jest wysyłany do API Cinema Hub ani zapisywany w kontenerze.
- **Aktualny klient Android do pobrania z kontenera.** `/download/cinema-hub.apk` udostępnia ten sam podpisany plik 1.3.11 co osobne wydanie Androida.
- **Instalacja Windows / Raspberry Pi.** Instalatory i Compose wskazują wersję 1.3.14. Obie architektury są budowane i testowane przed publikacją wspólnego obrazu.

Wydanie Androida 1.3.11 dodaje również menu ręcznego wyłączenia/włączenia Asystenta Google, poprawkę etykiet menu oraz 250%, 300%, AUTO i Normalizer. Te funkcje i przetwarzanie dźwięku działają w natywnym odtwarzaczu Androida; kontener nie normalizuje strumienia na serwerze. [Pełny opis klienta Android](RELEASE-ANDROID-1.3.11.md).

Aktualizacja zachowuje istniejący wolumen `/data`, `.env`, konta, sesje portali, historię, źródła i IPTV. Nie usuwaj wolumenu ani danych aplikacji. W istniejącym pliku `.env` zmień przypięty `APP_IMAGE` na `ghcr.io/hattimon/cinema-hub:1.3.14`, następnie wykonaj `docker compose pull` i `docker compose up -d`. Instalator nie nadpisuje istniejącego `.env`.
