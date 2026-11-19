# Playlisty i kolejność odtwarzania

## Utwórz pierwszą playlistę

1. Zaloguj się do Cinema Hub i włącz własne źródła filmów oraz seriali w **Ustawienia → Źródła**.
2. Otwórz **Playlisty** w bocznym menu.
3. Wpisz nazwę listy i wybierz **Utwórz**, następnie wyszukaj film lub serial i dodaj wybrany materiał. Do jednej listy można dodać pojedyncze odcinki z różnych seriali i filmy.
4. Ustaw kolejność oraz tryb, a potem wybierz **Odtwórz playlistę**. **Kontynuuj playlistę** wraca do zapisanego miejsca.

Odtwarzacz korzysta ze źródeł udostępnionych w Twoim katalogu. Przy odtwarzaniu automatycznym wybiera hosting zgodnie z zapisanymi preferencjami. Jeśli źródło wymaga zalogowania, otwórz **Zaloguj / CAPTCHA** w jego ustawieniach.

W sekcji gotowych playlist możesz uruchomić chronologię Stargate albo trzy filmy Avatar w kolejności premier: **Avatar** (2009), **Istota wody** (2022) i **Ogień i popiół** (2025). Cinema Hub dopasowuje tytuły do katalogu bieżącego użytkownika; identyfikatory pozycji i postęp pozostają w jego bazie.

## Własne playlisty

- **Utwórz** listę i wyszukaj dowolny film albo odcinek; można mieszać odcinki z różnych seriali i filmy na tej samej liście.
- **Dodawanie**: wybierz miejsce na liście, a w przypadku serialu także konkretny odcinek.
- **Kolejność**: przeciągaj pozycje lub użyj strzałek i przycisku `#`.
- **Po kolei**: po ostatniej pozycji odtwarzanie się kończy; **W pętli**: powrót do początku; **Losowo**: wszystkie pozostałe pozycje pojawiają się w losowej kolejności przed nowym cyklem.
- **Kontynuuj playlistę** wraca do ostatnio zapamiętanej pozycji. **Od początku** czyści postęp, oznaczenia obejrzenia, czas wznowienia oraz stan losowania dla **całej** playlisty i rozpoczyna pierwszą pozycję.
- **Odtwarzacz** pokazuje nazwę playlisty, numer pozycji i zapowiedź następnej. Przycisk **Playlista** wysuwa boczny panel z kolejką. Możesz wyszukać dowolny film lub odcinek i uruchomić go bez wychodzenia z odtwarzacza. W dolnym pasku możesz też zmienić tryb **Po kolei / W pętli / Losowo**.
- **Powiązanie** pozwala naprawić pozycje, których katalog nie rozpoznał podczas importu.
- **Duplikuj** tworzy osobną kopię; **Usuń** usuwa wyłącznie wybraną playlistę.

## Import i eksport

W widoku playlisty możesz pobrać **JSON** lub **CSV**. Eksport zawiera opisy, kolejność, numery sezonów i odcinków oraz postęp. Import akceptuje listy w schemacie `items` lub `entries`. W CSV respektowana jest kolumna `order`, a wartości w cudzysłowach mogą zawierać średniki i znaki nowej linii.

Identyfikatory mediów różnią się między instalacjami. Podczas importu system próbuje dopasować pozycje do bieżącego katalogu, a przy braku dopasowania zachowuje oryginalne opisy i poprzedni identyfikator w `metadata.original_item_id` do ręcznej naprawy.

## Dane i uprawnienia

Playlisty, ich zawartość, stan losowania oraz postęp są przechowywane osobno dla każdego użytkownika w bazie Cinema Hub. Żądania API sprawdzają właściciela playlisty. Pliki JSON/CSV mogą zawierać historię oglądania — udostępniaj je świadomie.

## Sprawdzenie implementacji

Z katalogu projektu uruchom `node --test tests/playlist.test.mjs` dla testów kolejek, importu, postępu i uprawnień, następnie `npm run build`. Pozostałe testy aplikacji można uruchomić przez `npm test`; część testów integracyjnych wymaga dostępu do lokalnej przeglądarki i serwera.
