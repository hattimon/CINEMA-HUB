# Cinema Hub 1.3.19

- **Playlisty** pozwalają mieszać filmy i pojedyncze odcinki, ustalać ich kolejność, odtwarzać po kolei, w pętli lub losowo i wracać do zapisanego miejsca. Możesz tworzyć własne listy oraz importować i eksportować pliki JSON i CSV. [Instrukcja playlist](https://github.com/hattimon/CINEMA-HUB/blob/main/docs/PLAYLISTS.md)
- **Filman.cc** korzysta z ostatniej potwierdzonej sesji. Po pomyślnym logowaniu Cinema Hub zapisuje dane w formie zaszyfrowanej. Próbuje obsłużyć prosty checkbox i otwiera drogę do ręcznej weryfikacji, gdy portal wymaga rozwiązania zadania. Konto możesz zmienić przez **Wyloguj / Zmień konto**.

Obraz `ghcr.io/hattimon/cinema-hub:1.3.19` jest przeznaczony dla Windows z Docker Desktop w trybie kontenerów Linux oraz dla Linuksa na amd64 i ARM64, w tym Raspberry Pi z systemem 64-bitowym. Pobierz aktualizację w DCC Container Updater lub użyj dotychczasowego projektu Compose i zachowaj podpięcie `/data`. [Instrukcja aktualizacji](https://github.com/hattimon/CINEMA-HUB/blob/v1.3.19/docs/INSTALL.md)

Tabele playlist powstają przy pierwszym użyciu sekcji **Playlisty**. Tabela z zaszyfrowanymi danymi Filmana powstaje przy zapisie pierwszego potwierdzonego logowania. Klient Android TV ma wersję **1.3.11**.
