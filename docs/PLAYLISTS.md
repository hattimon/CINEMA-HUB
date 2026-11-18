# Playlisty i kolejność odtwarzania

## Pierwsza playlista Stargate

1. Zaloguj się do Cinema Hub i dodaj źródło z filmami oraz serialami do swojego katalogu.
2. Otwórz **Playlisty** w bocznym menu.
3. W sekcji **Gotowe chronologie Stargate** wybierz **SG-1 + Atlantis + filmy (317)** lub krótszą listę **Od SG-1 S08 (162)**. Możesz też zaimportować własny plik JSON albo CSV.
4. Po imporcie sprawdź liczbę powiązanych pozycji. W przypadku brakującego tytułu kliknij ikonę łącza przy pozycji, wyszukaj właściwy serial lub film i w razie potrzeby wybierz dokładny sezon oraz odcinek.
5. Kliknij **Odtwórz playlistę**. Program pamięta bieżącą pozycję i czas oglądania dla Twojego konta.

Pakiet Stargate zawiera **wyłącznie opisy i kolejność**: 214 odcinków SG-1, 100 Atlantis oraz trzy filmy. Nie zawiera plików wideo ani odnośników do pirackich strumieni. Cinema Hub korzysta z pozycji faktycznie dostępnych w Twoim katalogu. Bez powiązania danej pozycji nie rozpocznie jej odtwarzania.

## Własne playlisty

- **Utwórz** listę i wyszukaj dowolny film albo odcinek; można mieszać odcinki z różnych seriali i filmy na tej samej liście.
- **Dodawanie**: wybierz miejsce na liście, a w przypadku serialu także konkretny odcinek.
- **Kolejność**: przeciągaj pozycje lub użyj strzałek i przycisku `#`.
- **Po kolei**: po ostatniej pozycji odtwarzanie się kończy; **W pętli**: powrót do początku; **Losowo**: wszystkie pozostałe pozycje pojawiają się w losowej kolejności przed nowym cyklem.
- **Kontynuuj playlistę** wraca do ostatnio zapamiętanej pozycji. **Od początku** czyści postęp, oznaczenia obejrzenia, czas wznowienia oraz stan losowania dla **całej** playlisty i rozpoczyna pierwszą pozycję.
- **Odtwarzacz** pokazuje nazwę playlisty, numer pozycji i zapowiedź następnej. Ma przyciski poprzedni/następny oraz powrót do edytora playlist. W jego dolnym pasku możesz zmienić tryb **Po kolei / W pętli / Losowo** bez ponownego uruchamiania bieżącego filmu.
- **Powiązanie** pozwala naprawić pozycje, których katalog nie rozpoznał podczas importu.
- **Duplikuj** tworzy osobną kopię; **Usuń** usuwa wyłącznie wybraną playlistę.

## Import i eksport

W widoku playlisty możesz pobrać **JSON** lub **CSV**. Eksport zawiera opisy, kolejność, numery sezonów i odcinków oraz postęp. Import akceptuje także gotowe pliki Stargate w schemacie `items`. W CSV respektowana jest kolumna `order`, a wartości w cudzysłowach mogą zawierać średniki i znaki nowej linii.

Identyfikatory mediów różnią się między instalacjami. Podczas importu system próbuje dopasować pozycje do bieżącego katalogu, a przy braku dopasowania zachowuje oryginalne opisy i poprzedni identyfikator w `metadata.original_item_id` do ręcznej naprawy.

## Dane i uprawnienia

Playlisty, ich zawartość, stan losowania oraz postęp są przechowywane osobno dla każdego użytkownika w bazie Cinema Hub. Żądania API sprawdzają właściciela playlisty. Pliki JSON/CSV mogą zawierać historię oglądania — udostępniaj je świadomie.

## Sprawdzenie implementacji

Z katalogu projektu uruchom `node --test tests/playlist.test.mjs` dla testów kolejek, importu, postępu i uprawnień, następnie `npm run build`. Pozostałe testy aplikacji można uruchomić przez `npm test`; część testów integracyjnych wymaga dostępu do lokalnej przeglądarki i serwera.
