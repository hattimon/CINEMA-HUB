# Kontener 1.3.13 — panel wyszukiwania głosowego

Tag kontenera: `v1.3.13`. Oddzielny klient Android: `android-v1.3.9` / APK 1.3.9 / versionCode 13. Pakiet i podpis APK są zachowane.

Panel dodaje ikonę mikrofonu, wybór języka urządzenia lub jednego z 35 wariantów oraz własnego tagu BCP 47, obsługę D-pad/OK/Wstecz i diagnostykę. Rozpoznany tekst uruchamia istniejące wyszukiwanie z zachowaniem źródeł, filtrów i sortowania. Dostępność języków oraz mikrofonu Bluetooth zależy od usługi mowy i firmware Androida. Funkcja nie tłumaczy tytułów ani całego interfejsu.

Wersja 1.3.13 poprawia synchronizację testu przeglądarkowego ujawnioną podczas weryfikacji 1.3.12 na Linux amd64 i ARM64: po wyniku głosowym test czeka na rzeczywistą odpowiedź katalogu, zanim sprawdzi przechwycone zapytanie. React może wyświetlić nagłówek przed wykonaniem efektu sieciowego. Nie zmienia to działania APK ani mechanizmu wyszukiwania. Tagi i pliki wydania 1.3.12 pozostają zachowane; jego workflow nie opublikował wspólnego obrazu po nieudanych testach.

GitHub Actions buduje i testuje obie architektury przed publikacją `ghcr.io/hattimon/cinema-hub:1.3.13` i `latest`. Przy aktualizacji zachowaj istniejący wolumen `/data`, `.env`, porty, konto, sesje oraz historię. Nowa instalacja używa obrazu 1.3.13; istniejąca konfiguracja z przypiętym starszym obrazem wymaga wyboru nowej wersji. Nie usuwaj danych ani wolumenów.

Nowa funkcja wymaga **obu aktualizacji**: panelu w kontenerze i klienta APK. Zainstalowana aplikacja Android szuka najnowszego wydania GitHub; wydanie Androida jest oznaczone osobno jako Latest. Instaluj APK bez odinstalowywania poprzedniej wersji.

**Test fizycznego mikrofonu Bluetooth na Magcubic L018 pozostaje do wykonania.** Testy automatyczne symulują odpowiedzi usług mowy; testy katalogu i MP4/HLS nie potwierdzają jakości rozpoznawania dźwięku ani udostępnienia mikrofonu pilota aplikacjom.

[Instrukcja wyszukiwania głosowego](VOICE-SEARCH.md) · [Opis Android 1.3.9](RELEASE-ANDROID-1.3.9.md).
