Android TV 1.3.5 pozwala wybierać efekty podczas trwania filmu.

- MENU na pilocie otwiera „Obraz i głośność” bez pauzy. Obecne menu pauzy pozostaje dostępne przez OK lub strzałkę w górę podczas seansu.
- Wybór profilu obrazu, CRT i wzmocnienia dźwięku pozostaje otwarty do porównania ustawień na żywo. „Wróć” prowadzi do głównego menu efektów.
- Filtry są inicjalizowane przed startem filmu, także przy profilu naturalnym. Zmiana filtra podczas pauzy odświeża klatkę, a błąd GPU przywraca naturalny obraz w tej samej pozycji.
- Strzałka w górę podczas buforowania pokazuje szczegóły filmu lub serialu, bez zamykania bieżącej sesji odtwarzacza.
- Z aktualnym panelem można przejść do ulubionych podczas autoplay, wyjść w górę z pierwszego odcinka do okładki i wznowić seans przyciskiem „Wznów oglądanie” przy źródłach. Panel w tym etapie jest aktualizowany na Windows.

Instaluj jako aktualizację wersji 1.3.4, bez jej odinstalowywania. Identyfikator pakietu i certyfikat podpisu są zachowane; versionCode wzrasta do 9.

Sprawdzono kompilację release, Android Lint i podpis APK. Obsługę panelu i komunikacji z Androidem sprawdzono w Chromium; fizyczny pilot, GPU i projektor wymagają sprawdzenia na urządzeniu.
