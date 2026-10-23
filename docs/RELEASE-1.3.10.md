# Cinema Hub — serwer i kontener 1.3.10

Wydanie z 23 października 2026. Tag GitHub: `v1.3.10`. Obraz: `ghcr.io/hattimon/cinema-hub:1.3.10`. Jest to następna wersja serwera i kontenera; numeracja klienta Android TV pozostaje oddzielna.

## Ostatni odcinek i pozycja seansu

Po otwarciu serialu przez „Kontynuuj” lub „Ulubione” panel wybiera ostatnio oglądany sezon i odcinek. Odtwarzacz wznawia niedokończony odcinek od zapisanego czasu.

Przyczyną potwierdzonego błędu SG-1 było porównywanie całych adresów odcinków. Filman zmienia końcówkę adresu zależną od sesji lub konta, np. z `/0` na `/388690`. Historia nadal wskazywała sezon 4, odcinek 5, ale aplikacja nie odnajdywała dokładnie takiego URL na świeżej liście i wybierała pierwszy odcinek pierwszego sezonu. Serwer rozpoznaje teraz zapis także po numerze sezonu i odcinka oraz zwraca aktualny adres. Istniejąca historia działa bez czyszczenia bazy i bez ręcznej korekty danych.

Druga poprawka dotyczy chwilowego rozłączenia z serwerem. Postęp jest najpierw zapisywany w przeglądarce, osobno dla każdego konta. Nieudana wysyłka pozostaje w kolejce i jest ponawiana po odzyskaniu połączenia oraz cyklicznie co 10 sekund. Kolejka przetrwa odświeżenie strony. Zapisy obejmują postęp co około 5 sekund, pauzę, przewinięcie, zamknięcie odtwarzacza i opuszczenie strony. Przy przywracaniu filmu stan początkowy odtwarzacza nie nadpisuje zapamiętanego czasu zerem. Serwer ignoruje starszą opóźnioną aktualizację, jeśli ma już nowszy postęp danego odcinka.

Lokalna kopia pomaga w tej samej przeglądarce; inne urządzenie otrzymuje postęp po jego zsynchronizowaniu z serwerem. Wznowienie zależy od dostępności źródła i możliwości przewijania danego strumienia. Błąd zapisu historii nie jest już mylony z brakiem postępu.

## Paski przewijania

Paski katalogu, okna serialu, listy odcinków i ustawień mają ciemny tor oraz uchwyt w kolorze wybranego motywu: fioletowym, turkusowym, bursztynowym albo różowym. Tryb wysokiego kontrastu zachowuje kolory systemowe.

## Aktualizacja kontenera

Obraz obsługuje `linux/amd64` i `linux/arm64`. GitHub Actions testuje oba warianty przed opublikowaniem wspólnego manifestu i tagu `latest`. Paczka wydania to `CinemaHub-Server-v1.3.10.zip`; suma SHA-256 znajduje się w `SHA256SUMS-Server-v1.3.10.txt`.

Zachowaj istniejący wolumen `/data`, plik `.env`, porty i zmienne środowiskowe. Wybierz obraz `ghcr.io/hattimon/cinema-hub:1.3.10`, pobierz go i odtwórz wyłącznie usługę Cinema Hub. Konta, zapisane logowania, ulubione i historia pozostają w dotychczasowym wolumenie. Po aktualizacji odśwież otwarte karty przeglądarki.

Windows jest aktualizowany w ramach tego wydania. Raspberry Pi można zaktualizować samodzielnie z nowego obrazu ARM64.

## Weryfikacja

Test regresji odtwarza zmianę końcówki adresu SG-1, zachowanie istniejącego czasu 2613,452 sekundy, odczyt przez „Ulubione” i „Kontynuuj”, zapis z nadal otwartego odtwarzacza używającego starego URL oraz odrzucenie starszej aktualizacji. Test przeglądarkowy na komputerze i telefonie odtwarza rzeczywiste MP4, wznawia S04E05 od 77 sekundy, przerywa zapis przy 95 sekundzie, odświeża stronę i sprawdza ponowne wznowienie oraz synchronizację. Obejmuje też cofnięcie filmu do 30 sekundy i oddzielenie historii dwóch kont.

Testy używają izolowanych kont i lokalnych danych. Odtworzone adresy odpowiadają rzeczywistej przyczynie błędu; test nie wymaga odtwarzania odcinka z zewnętrznego hostingu.
