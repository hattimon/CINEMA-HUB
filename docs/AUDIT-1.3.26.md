# Audyt Stargate — Cinema Hub 1.3.26

Zakres audytu: wcześniejsze zarchiwizowane migawki `cinema.sqlite` i
metadane **314 wpisów** przypisanych do SG-1 (214) i Atlantis (100).
Zweryfikowano strukturę identyfikatorów dostawców i adresów odcinków.
To nie jest kontrola plików wideo ani potwierdzenie tożsamości treści na ekranie.

Przykładowa playlista mieszana „Stargate — SG-1 + Atlantis (chronologicznie)”
liczy **315 pozycji**. Test regresji w wersji 1.3.26 sprawdza zachowanie
ich kolejności oraz bieżącej pozycji, lecz nie potwierdza 315 nagrań w serwisach.

**Stargate Atlantis S01E09 „Dom” pozostaje zablokowany:** nie znaleziono
potwierdzonego nagrania. Nie wolno uznawać przypisanego wcześniej obcego filmu
za prawidłowy odcinek. Liczba zweryfikowanych klatek rzeczywistego wideo: 0.

Obowiązujący szerszy protokół znajduje się w
[audycie 1.3.24](AUDIT-1.3.24.md). Testy na fizycznym Android TV,
rozpoznanie prawidłowego wideo S01E09 i potwierdzenie poprawności
bieżących sesji źródeł wymagają osobnego sprawdzenia z dostępem do usług.
