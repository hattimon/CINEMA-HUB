# Cinema Hub 1.3.15 — AUTO i Normalizer w przeglądarce

Zmiany względem kontenera **1.3.14**. Wersja **1.3.15** dodaje do odtwarzacza przeglądarkowego funkcje dźwięku, które wcześniej były dostępne w natywnym kliencie Android. Tag `v1.3.15`, obraz `ghcr.io/hattimon/cinema-hub:1.3.15`, Windows/Linux amd64 i Raspberry Pi arm64. Dołączony APK pozostaje w wersji **1.3.11**; wyszukiwanie głosowe i ręczny dostęp do wyłączenia/włączenia Asystenta Google są zachowane. [Wcześniejsze zmiany od kontenera 1.3.10, w tym obsługa mikrofonu](RELEASE-1.3.14.md) · [Opis Androida 1.3.11](RELEASE-ANDROID-1.3.11.md).

## Menu odtwarzacza → Wzmocnienie dźwięku

- **Normalnie / 150% / 200% / 250% / 300%** — stałe wzmocnienie, stosowane również od początku następnego filmu lub odcinka. „Normalnie” oznacza 100%.
- **AUTO — dopasuj do nagrania** — zwykłe nagrania pozostają na 100%. Ciche są wzmacniane do najbliższego poziomu dostępnej skali, maksymalnie 300%; nadmiernie głośne są ściszane. AUTO koryguje skrajne poziomy, zachowując zakres zwykłych nagrań.
- **Normalizer — wyrównaj poziom** — na bieżąco wzmacnia albo ścisza dźwięk do wybranego poziomu odniesienia. Pod pozycją Normalizer pojawia się wybór od **−30 do −12 dBFS RMS**, domyślnie **−21 dBFS**. Mniejsza wartość daje cichszy poziom. Wzmocnienie jest ograniczone do 300%; bardzo cichy materiał może nie osiągnąć wybranego celu.

Tryb i poziom zapisują się osobno dla każdego konta. Po ponownym otwarciu przeglądarki lub rozpoczęciu kolejnego materiału ustawienie jest przywracane. Szybkie zmiany w menu zapisują się w kolejności wyboru. Zmiany poziomu są wygładzane, cisza nie powoduje narastania wzmocnienia, a ogranicznik chroni szczyty sygnału przed przekroczeniem skali cyfrowej. Ręczna głośność odtwarzacza, Windows i urządzenia nadal działa niezależnie.

Poziom dBFS opisuje sygnał cyfrowy, a nie decybele mierzone w pokoju. Analiza działa podczas odtwarzania, z krótkim czasem dopasowania; nie skanuje całego filmu z wyprzedzeniem. RMS nie jest pomiarem LUFS, więc nagrania o różnej charakterystyce mogą być odbierane nieco inaczej mimo tego samego poziomu RMS. Przetwarzanie odbywa się w przeglądarce przez Web Audio; kontener nie transkoduje ani nie zapisuje dźwięku.

## Aktualizacja

Zachowaj istniejący wolumen `/data`, `.env`, bazę, klucz szyfrowania i profile przeglądarki. W istniejącym `.env` przypnij `APP_IMAGE=ghcr.io/hattimon/cinema-hub:1.3.15`, następnie wykonaj `docker compose pull` i `docker compose up -d`. Na Raspberry Pi użyj tego samego pliku Compose co dotychczas, np. `-f compose.pi.yaml`. Instalatory zachowują istniejący `.env`. Nie usuwaj wolumenów.

Po aktualizacji odśwież panel przez **Ctrl+F5**, otwórz film i menu **⋯**. Nie jest potrzebna ponowna instalacja APK. Na Androidzie film nadal obsługuje natywny odtwarzacz i jego ustawienia.

## Weryfikacja

Testy obejmują prawdziwie dekodowany dźwięk PCM w Chromium: 250/300%, przywrócenie poziomu w kolejnym filmie, AUTO w obu kierunkach, wyrównanie cichego i głośnego materiału do −24 dBFS, ponowne otwarcie panelu oraz ręczne ściszanie. Osobne testy sprawdzają walidację API, niezależność kont, stereo o przeciwnych fazach, ciszę i łagodne dostosowanie wzmocnienia. Weryfikacja nie zastępuje odsłuchu na rzeczywistych głośnikach ani pomiaru akustycznego.
