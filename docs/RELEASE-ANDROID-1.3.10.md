## Cinema Hub 1.3.10 — Android TV

Aktualizacja aplikacji Android TV z wyszukiwaniem głosowym, wyborem języka i diagnostyką mikrofonu. Osobny tag aplikacji: `android-v1.3.10`.

### Co nowego i co poprawiono

- **Wyszukiwanie filmów i seriali głosem.** Przycisk mikrofonu obok wyszukiwarki przekazuje rozpoznany tytuł do istniejącego wyszukiwania, z zachowaniem źródeł, filtrów i sortowania.
- **English i inne języki.** Dostępny jest język urządzenia, 35 wariantów, w tym English (US/UK), oraz własny kod języka. Wybór jest zapamiętywany na urządzeniu.
- **Wybór usługi rozpoznawania.** Nowe **MENU → Mikrofon i rozpoznawanie** pozwala wskazać dostępną usługę dla Cinema Hub albo ponownie wybrać aplikację systemowego okna mowy. Ustawienie dotyczy Cinema Hub i nie zmienia domyślnych aplikacji Androida.
- **Test sygnału mikrofonu.** Dziesięciosekundowy pomiar pokazuje poziom dźwięku i używane wejście. Diagnostyka wyświetla również uprawnienie do mikrofonu oraz dostępne usługi i wejścia audio. Nagrania nie są zapisywane ani wysyłane na serwer.
- **Powrót z okna rozpoznawania.** Aplikacja kończy oczekiwanie, gdy systemowe okno wróci bez wyniku. Anulowanie i przełączenie aplikacji zwalniają używane zasoby mikrofonu.

### Instalacja i aktualizacja

W Cinema Hub wybierz **MENU → Sprawdź aktualizacje**, pobierz aktualizację i zatwierdź instalator Androida. Można również pobrać `CinemaHub-AndroidTV-v1.3.10.apk` z plików tego wydania.

Instaluj jako aktualizację istniejącej aplikacji, zachowując jej dane i adres serwera. Pakiet `pl.cinemahub.tv` i podpis pozostają zgodne z Android TV 1.3.9; `versionCode` wzrasta z 13 do 14. Android TV 1.3.9 pozostaje dostępny jako poprzednie wydanie.

### Kompatybilność

Aplikacja obsługuje Android 6 lub nowszy, także urządzenia z systemem 32-bitowym. Menu diagnostyki działa natywnie w aplikacji. Przyciski mikrofonu i języka w panelu wymagają panelu serwera z obsługą wyszukiwania głosowego, dostępnego w lokalnej wersji kontenera 1.3.14. Aktualizacja APK nie aktualizuje kontenera.

Dostęp do mikrofonu Bluetooth, języki i tryb offline zależą od systemu oraz usługi rozpoznawania. Klawisz mikrofonu zarezerwowany dla Asystenta może nadal uruchamiać Asystenta. Samo działanie mikrofonu w Asystencie nie potwierdza jego dostępności dla Cinema Hub.

### Weryfikacja

Sprawdzono kompilację APK, Android Lint, zgodność podpisu z 1.3.9 oraz testy adresów i pochodzenia komunikatów, sterowania pilotem, wersjonowania aktualizacji, sesji głosowych, języków i pomiaru sygnału. Rzeczywiste rozpoznawanie z mikrofonu pilota na Magcubic L018 wymaga potwierdzenia na urządzeniu; testy automatyczne nie potwierdzają dostępu firmware do tego mikrofonu.
