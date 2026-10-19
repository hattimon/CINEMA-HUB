# Cinema Hub dla Magcubic L018

Klient Android panelu z kontenera, pakiet `pl.cinemahub.tv`. Instaluje się obok Filman TV. Konta, katalog, źródła i postęp oglądania obsługuje serwer Cinema Hub.

Po uruchomieniu wpisz **IP z portem lub pełny adres panelu**, np. `IP_SERWERA:9999`, `http://IP_SERWERA:9999/` albo `https://kino.twoja-domena.pl/`. Adres zapisuje się na projektorze. **MENU → Adres IP / URL serwera** pozwala go zmienić. Serwer musi być dostępny z sieci projektora. Logowanie jest takie samo jak w panelu; na pierwszej instalacji `admin / admin`.

Strzałki pilota wybierają przyciski oznaczone ramką, OK zatwierdza. **OK na ramce odcinków** wchodzi do listy; góra/dół wybiera wtedy odcinki. **Lewo/prawo z wiersza** wraca do całej ramki. **Dół z ramki** zaznacza przycisk automatycznego odtwarzania lub dostępne źródła; góra wraca do ramki, a kolejna góra do przycisków nad nią. **Do źródeł** przenosi zaznaczenie do źródeł bez zwijania odcinków. MENU poza filmem otwiera opcje klienta. Opcja kursora pozwala obsługiwać elementy wymagające kliknięcia; Page Up / Page Down przewijają stronę.

Film startuje z widocznym menu. Wybierz **Pełny ekran**, aby podczas odtwarzania był widoczny tylko film. **OK** na pełnym ekranie pauzuje i pokazuje menu; **Wznów** chowa wszystkie paski. Lewo/prawo przewija o 10 sekund. MENU otwiera efekty bez pauzowania; strzałka w górę pauzuje i pokazuje menu. Przyciski obejmują przewijanie, pauzę, Poprzedni, Następny, Zmień źródło, Autoplay i zapis. Wstecz na pełnym ekranie przywraca widok z menu; kolejne Wstecz zamyka film. Okno zmiany źródła i okno zapisu można zamknąć bez kończenia seansu. Autoplay i zmiana preferencji hostingu nie restartują odtwarzania. Wybrany pełny ekran jest zachowany w kolejnych odcinkach.

Zweryfikowany MP4/HLS jest przekazywany do Media3/ExoPlayer. Postęp wraca do profilu na serwerze, a ponowne otwarcie wznawia seans. Zwykła przeglądarka komputera nadal używa HTML5/HLS. Pliki wskazane na urządzeniu korzystają z lokalnego WebView i systemowego wyboru pliku.

Zapis filmu jest wyłącznie ręczny, po użyciu przycisku w panelu. Na Androidzie trafia do systemowych Pobierań i folderu `Download` projektora; nazwa zachowuje tytuł, sezon/odcinek oraz jakość i otrzymuje datę zapisu. Chmurowe cele zapisuje się w ustawieniach panelu. Serwer nie zapisuje filmów na swoim dysku.

APK: `../releases/CinemaHub-AndroidTV-v1.3.6.apk` (versionCode 10). Można ją pobrać z `http://IP_SERWERA:9999/download/cinema-hub.apk`. Aplikacja sprawdza wydania GitHub po uruchomieniu i pyta o aktualizację; można też użyć **MENU → Sprawdź aktualizacje**. Po pobraniu Android otwiera własny instalator i wymaga zatwierdzenia. Przy pierwszej aktualizacji włącz jednorazowo **Zezwalaj z tego źródła** dla Cinema Hub. Instaluj jako aktualizację istniejącej aplikacji; pakiet i podpis pozostają zgodne z poprzednim APK. APK można także przenieść przez USB i otworzyć w menedżerze plików projektora.

W 1.3.6 menu obrazu i dźwięku otwiera się jako kompaktowa karta po prawej stronie. Nie przyciemnia obrazu ani nie zasłania całego paska sterowania. Przycisk menu odtwarzacza i MENU na pilocie otwierają ten sam panel z profilami projektora, efektami CRT i wzmocnieniem dźwięku. W trakcie sprawdzania źródeł można wybrać dostępny hosting; globalne ograniczenie portalu ma licznik, a ograniczony hosting jest pomijany na rzecz kolejnego.

W 1.3.2 menu pauzy ma własny, widoczny pasek czasu nad przyciskami. Kliknięcie lub dotknięcie paska przewija bez wznawiania filmu. Pilot: z przycisku **Wznów** naciśnij **górę**, aby zaznaczyć pasek; **lewo/prawo** zmienia pozycję o 10 sekund, **OK** zatwierdza. Podczas oglądania lewo/prawo również przewija o 10 sekund. W liście odcinków **OK na ramce** przechodzi do wierszy, góra/dół wybiera odcinek; prawo/lewo wraca do nadrzędnych przycisków. Wybór odcinka zachowuje rozwiniętą listę na Android TV.

Preferencje trzech hostingów: **Ustawienia → Odtwarzanie i hostingi**. Lokalne kody odzyskiwania hasła i opcjonalne parowanie Google Authenticator: **Ustawienia → Konto**. Serwer weryfikuje kody samodzielnie, bez usług Google i wysyłania maili.

Budowa z istniejącą lokalną toolchain:

```powershell
cd android
.\build-local.ps1
```

Skrypt wykonuje test polityki adresów, wersjonowania aktualizacji, widoczności menu i granic przewijania, kompilację release, Android Lint i sprawdzenie podpisu. Używa istniejącego podpisu z toolchain do tej instalacji poza sklepem; zachowaj toolchain, aby kolejne wersje mogły aktualizować aplikację bez utraty ustawień. Aplikacja obsługuje Android 6+ i nie zawiera bibliotek przypisanych do jednej architektury CPU. Test na fizycznym Magcubic wymaga projektora; kompilacja i test komunikacji z panelem nie potwierdzają działania jego konkretnego dekodera ani pilota.
