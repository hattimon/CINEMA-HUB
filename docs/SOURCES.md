# Źródła i logowanie

Dodaj źródło w **Ustawienia → Źródła → Dodaj źródło**. Edycja każdej pozycji dotyczy jej własnego adresu, danych logowania i opcji. Przełącznik **Aktywne** zachowuje konfigurację przy wyłączeniu.

Ikona kosza przy źródle otwiera potwierdzenie **Usuń konfigurację**. Usunięcie dotyczy Twojego konta: usuwa dane logowania, profil przeglądarki oraz powiązane pozycje katalogu, ulubione, historię i zadania. Pliki w źródle i na Twoim urządzeniu pozostają na miejscu.

| Źródło | Konfiguracja |
| --- | --- |
| Filman | Domyślne źródło nowego konta; ręczne logowanie / CAPTCHA |
| Vider.info / Vider.pl | Strona główna, adres `/dir/+...` albo `/vid/+...`; osobna sesja |
| Przystań | Adres HTTP serwera, katalog początkowy i podfoldery; opcjonalne Basic Auth |
| Plex | Adres serwera i token |
| HTTP / Nginx | Katalog z linkami do plików, opcjonalne Basic Auth |
| FTP / FTPS, WebDAV, S3 | Adres oraz dane odpowiedniego magazynu |
| To urządzenie | Pliki wybierane lokalnie, bez wysyłania ich do serwera |

## Vider

Obsługiwane są `https://vider.info/` i `https://vider.pl/`, także przy przekierowaniu między tymi domenami. Możesz wskazać konkretny katalog lub film.

W wydaniu 1.3.5 wyszukiwanie Vider filtruje tytuły w aktualnie odczytanym katalogu. Wyszukiwanie całego portalu, grupowanie seriali w sezony i odcinki oraz rozpoznawanie polskiej wersji i jakości są planowane jako osobna poprawka. Obecnie każdy materiał Vider jest osobną pozycją w katalogu filmów.

Po zapisaniu wybierz **Zaloguj / CAPTCHA**, zaloguj się do portalu, zaakceptuj wymagane ustawienia strony i zakończ sesję przyciskiem **Zakończ i zachowaj sesję**. Sprawdzanie źródła rozpoczniesz w szczegółach materiału. Brak dostępnego standardowego strumienia jest zgłaszany w panelu. Weryfikacja publicznego katalogu nie jest gwarancją odtwarzania każdego filmu bez logowania.

## Przystań

Wpisz adres swojej Przystani, np. `http://ADRES_PRZYSTANI:8765/`.

- **Katalog początkowy:** np. `FILMY`; pusty oznacza katalog główny.
- **Skanuj również podfoldery:** włącza wyszukiwanie plików w podkatalogach.
- Po zapisaniu otwórz edycję i kliknij **Test połączenia / Otwórz folder**.
- Przejdź do katalogu i wybierz **Ustaw ten katalog jako początkowy**, następnie zapisz.

Adapter korzysta z `GET /api/list?path=...` i `GET /media?path=...`. Skanowanie ma limity wielkości i głębokości — przy dużym zbiorze wybierz węższy katalog.

## Dostęp z kontenera

Serwer Docker musi mieć połączenie ze źródłem. Sam dostęp z TV lub przeglądarki na komputerze nie wystarczy. Jeżeli Windows i Pi są w różnych sieciach, sprawdź trasę do serwera mediów i jego zaporę.

Dostępność portali, CAPTCHA, limity zapytań i kodeki zależą od konkretnego źródła. Aplikacja korzysta z dostępnych materiałów i zwykłego logowania.
