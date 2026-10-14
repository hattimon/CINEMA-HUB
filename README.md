# Cinema Hub

Prywatny katalog filmów i seriali dla sieci lokalnej. Każdy użytkownik ma własne źródła, logowania, ustawienia, ulubione, historię i kolejkę zapisu.

## Uruchomienie

Na Windows, w katalogu tego projektu:

```powershell
docker compose up -d --build
```

Panel: `http://localhost:8090/` lub adres IP komputera i port 8090. Pierwsze konto: **admin / admin**. Przycisk „Załóż nowe konto” na ekranie logowania tworzy zwykłe konto użytkownika. Administrator może też tworzyć konta w ustawieniach. Można zapamiętać logowanie na 30 dni.

Instalacja Raspberry Pi korzysta z natywnego obrazu ARM64, katalogu `/mnt/nvme/apps/cinema-hub` i wolumenu danych `/mnt/nvme/apps/cinema-hub/data`. Panel tej instalacji: **http://192.168.11.20:9999/**. Konfiguracja `compose.pi.yaml` wiąże port **9999** z adresem LAN określonym w `.env`. Frontend buduje się na Windows; `Dockerfile.pi` używa gotowego `dist` i instaluje natywne narzędzia na Pi.

```powershell
npm ci
npm run build
```

```sh
cd /mnt/nvme/apps/cinema-hub
docker compose -f compose.pi.yaml build
docker compose -f compose.pi.yaml up -d
docker compose -f compose.pi.yaml ps
docker compose -f compose.pi.yaml logs --tail 50 cinema
```

## Filman i odtwarzanie

Domyślnym źródłem każdego nowego konta jest Filman. W ustawieniach wybierz logowanie do źródła; osobna karta pokazuje przeglądarkę kontenera. Zaloguj się ręcznie, rozwiąż ewentualną CAPTCHA i użyj „Zakończ i zachowaj sesję”. Okno logowania ma przewijanie, skalowanie i pełny ekran. Sesja przeglądarki Codex jest osobna.

W szczegółach filmu lub odcinka wybierz **„Odtwórz automatycznie”** albo **„Sprawdź i odtwórz”** przy wybranym hostingu. Automat sprawdza linki kolejno i zatrzymuje się na pierwszym działającym. Domyślna kolejność to lektor PL, dubbing PL, lektor AI, napisy PL, tłumaczenie PL, pozostałe języki. W każdej grupie najpierw wybierana jest najwyższa jakość, a następnie preferowany hosting. Trzy hostingi i preferowaną wersję zapisuje się osobno dla każdego konta; domyślnie pierwszy hosting to VOE. VOE z napisami nie wyprzedza dubbingu. Materiały krótsze niż 60 sekund są pomijane.

Otwarcie katalogu lub szczegółów nie uruchamia sprawdzania hostingów. Sprawdzanie można anulować i wybrać źródło ręcznie. Otrzymany adres odtwarzacza pozostaje zaszyfrowany przez 10 minut, aby ponowienie nie pytało portalu o ten sam link. Komunikat 429 wstrzymuje kolejne próby; odliczanie pojawia się wyłącznie przy znanym terminie odblokowania. Zmiana identyfikatora linku jest dopasowywana po hostingu, wersji i jakości, gdy dopasowanie jest jednoznaczne.

Resolver otwiera strony hostingu w tle, zamyka reklamy i obsługuje właściwe przyciski odtwarzacza. W panelu jest własne wideo HTML5/HLS, bez osadzania reklamowych stron. CAPTCHA wymagają ręcznego działania; DRM, konta premium, płatne dostępy i nieobsługiwane formaty nie są obchodzone. Dostępność zewnętrznych linków może zmieniać się niezależnie od aplikacji.

### Opcjonalny Vider.info (Windows i Raspberry Pi)

W **Ustawienia → Źródła → Dodaj źródło** wybierz **Vider.info**. Adres `https://vider.info/` otwiera stronę główną, a adres `https://vider.info/dir/+...` lub `https://vider.info/vid/+...` ogranicza źródło do wskazanego katalogu lub filmu. Po zapisaniu źródła kliknij przy nim **Zaloguj / CAPTCHA**, zaloguj się ręcznie w oknie przeglądarki, a następnie wybierz **Zakończ i zachowaj sesję**. Logowanie jest opcjonalne dla publicznie dostępnych filmów; osobne sesje użytkowników zapisują się w katalogu danych aplikacji. W szczegółach filmu uruchom **Odtwórz automatycznie** lub **Sprawdź i odtwórz** przy Vider. Weryfikowane są tylko dostępne standardowe strumienie MP4/HLS/WebM; brak dostępnego strumienia jest zgłaszany w panelu.

Na Raspberry Pi ręczne logowanie jest widoczne przez wbudowany noVNC; konfiguracja `Dockerfile.pi` / `compose.pi.yaml` zawiera Chromium i serwer wirtualnego ekranu. Na Windows ten sam panel wykorzystuje lokalną przeglądarkę Playwright; przy uruchomieniu bez Dockera wymaga zainstalowanego Chromium dla Playwright. Kontener Windows zawiera własną przeglądarkę. Vider nie zastępuje Filmana i można go w dowolnym momencie wyłączyć przełącznikiem **Aktywne**.

## Katalog i własne źródła

Można wybrać jedno źródło albo kilka naraz i zapisać wybór startowy w swoim profilu. Filman dostarcza rzeczywiste okładki, opisy, oceny, gatunki, lata, wersje i filtry; wielokrotny wybór oraz sortowanie są przekazywane do jego katalogu. W serialu wybiera się sezon i odcinek. Ulubione, „Chcę obejrzeć” i „Kontynuuj” są osobne dla każdego konta. Przyciski Poprzedni i Następny przechodzą również między sezonami. Autoplay jest opcjonalny, domyślnie wyłączony i działa także po ręcznym wyborze źródła. Opcja „Ten hosting w kolejnych odcinkach” daje temu hostingowi pierwszeństwo przy takiej samej wersji i jakości.

W ustawieniach są źródła HTTP/Nginx z Basic Auth, Plex z tokenem, Przystań (`http://192.168.0.170:8765/`), FTP/FTPS, WebDAV i magazyny zgodne z S3. Pliki urządzenia można wskazać lokalnie bez wysyłania ich do serwera. Dysk sieciowy lub chmurę można udostępnić przez jeden z obsługiwanych protokołów. Wideo jest odtwarzane bez transkodowania, dlatego musi mieć kodeki zgodne z przeglądarką, np. H.264/AAC w MP4 lub HLS.

Każde źródło ma własny formularz edycji. Dla Przystani ustaw katalog początkowy (pusty oznacza katalog główny) i opcję **Skanuj również podfoldery**. Po zapisaniu otwórz edycję i użyj **Test połączenia / Otwórz folder**, aby przejść po katalogach oraz wybrać katalog początkowy. Adres i opcjonalne dane Basic Auth są przypisane do tego źródła. Wyłączenie źródła zachowuje jego ustawienia i logowanie. Katalog udostępnia API `/api/list?path=...`, a filmy `/media?path=...`.

Wersja serwera 1.3.6 zachowuje obsługę Vider i aktualizuje resolver hostingu VOE, aby nie przełączał odtwarzacza w pauzę podczas buforowania. Sesja Vider w przeglądarce Codex jest oddzielna od sesji źródła w Cinema Hub.

## Ręczny zapis i kolejka

**Nie ma automatycznego pobierania filmów.** „Zapisz film” / „Zapisz odcinek” przy sprawdzonym źródle tworzy zadanie dopiero po kliknięciu. Nazwa pochodzi z tytułu, numeru sezonu i odcinka, nazwy odcinka i potwierdzonej jakości.

Cel „Urządzenie” korzysta z pobierania w przeglądarce użytkownika. Folder i ewentualne pytanie o lokalizację ustawia się w jego przeglądarce. W ustawieniach aplikacji można dodać własny cel WebDAV, FTP/FTPS lub S3 i ustawić go jako domyślny. Serwer przesyła wideo strumieniowo do wskazanego magazynu lub urządzenia: nie zapisuje plików filmowych na dysku kontenera. HLS jest przepakowywany strumieniowo do MP4. Magazyn, który wymaga lokalnego pliku tymczasowego, jest odrzucany.

Kolejkę zapisu na urządzenie można wstrzymywać, ponawiać i anulować. Zadania chmurowe można anulować lub ponowić. Ponowienie zaczyna przesyłanie od początku. Po restarcie zadania urządzenia pozostają wstrzymane. Wygasła sesja Filman nie wywołuje ponownego zapytania o hosting: należy ręcznie sprawdzić źródło i dodać nowe zadanie. Aplikacja nie może odtworzyć pliku z urządzenia innego użytkownika.

## Hasła, dane i utrzymanie

W **Ustawienia → Konto** można sparować Google Authenticator lub inną aplikację zgodną z TOTP. Po potwierdzeniu obecnego hasła dodaj konto ręcznie w Authenticatorze, przepisz pokazany klucz, wybierz typ czasowy i potwierdź parowanie aktualnym kodem sześciocyfrowym. Przy zapomnieniu hasła wybierz **Odzyskaj hasło → Google Authenticator**, podaj login, aktualny kod i nowe hasło. Serwer weryfikuje kod lokalnie zgodnie z RFC 6238; nie używa konta Google, poczty ani zewnętrznego API. Klucz jest szyfrowany w bazie. Kod zużyty przy parowaniu lub resecie nie zadziała ponownie; poczekaj na kolejny kod w aplikacji. Zegar telefonu i serwera powinien być poprawnie ustawiony. Parowanie można wymienić lub wyłączyć po podaniu obecnego hasła.

Zapisane kody jednorazowe także generuje się w **Ustawienia → Konto**. Są pokazywane na miejscu, nie są wysyłane mailem. Gdy nie masz kodów ani Authenticatora, komenda resetu poniżej działa również dla zwykłych użytkowników — zmień login po `--user`.

Użytkownik może w ustawieniach wygenerować osiem jednorazowych kodów odzyskiwania i zachować je poza aplikacją. Opcja odzyskiwania przy logowaniu ustawia nowe hasło i wylogowuje dotychczasowe sesje bez usług zewnętrznych. Zwykła zmiana hasła unieważnia stare kody. Administrator zachowuje lokalny reset komendą, która pyta dwukrotnie o nowe hasło i wylogowuje wybrane konto:

```sh
docker compose exec cinema node server/cli.mjs reset-password --user admin
```

Na Pi użyj `docker compose -f compose.pi.yaml exec cinema ...`. Ustawienia obejmują dźwięki menu, ich styl, kolory i wygląd panelu. Dane logowania źródeł są szyfrowane, a hasła kont haszowane. Port przeglądarki logowania nie jest wystawiany osobno i jest dostępny tylko dla właściciela aktywnego logowania.

Kopia danych musi zawierać **cały katalog danych wraz z `credentials.key` i profilami `browser`**, przy zatrzymanym wyłącznie tym kontenerze. Bez klucza nie da się odczytać zapisanych logowań. Aktualizacja obrazu zachowuje ten katalog; nie usuwa się wolumenu ani `.env`.

## Klient APK dla Magcubic L018

Gotowa aplikacja: `releases/CinemaHub-Magcubic-L018-v1.3.3.apk`. Instalacja na Pi udostępnia ją pod **http://192.168.11.20:9999/download/cinema-hub.apk**. Aplikacja sprawdza najnowsze wydanie przy uruchomieniu, pyta o zgodę na pobranie i instaluje je przez systemowy instalator Androida; ręczne sprawdzenie jest w **MENU → Sprawdź aktualizacje**. Android wymaga zatwierdzenia instalacji, a przy pierwszej aktualizacji także zezwolenia „Zezwalaj z tego źródła”. Jest to klient panelu kontenera z możliwością wpisania IP, portu lub adresu HTTPS, zapamiętaniem serwera, pilotem i odtwarzaczem Media3 dla sprawdzonych MP4/HLS. Film startuje z widocznym menu. Przycisk **Pełny ekran** chowa paski podczas odtwarzania; **OK** pauzuje i pokazuje całe menu. **Wznów** ponownie chowa menu. Lewo/prawo podczas odtwarzania na pełnym ekranie przewija o 10 sekund, MENU lub strzałka w górę pauzuje i pokazuje przyciski. Wstecz na pełnym ekranie przywraca widok z menu, kolejne Wstecz zamyka odtwarzacz. Autoplay zachowuje wybrany pełny ekran między odcinkami. Przełączniki Autoplay i hostingu nie restartują filmu; okna zmiany źródła oraz zapisu wracają do tego samego seansu. Historia odtwarzania synchronizuje się z kontem. Przeglądarka komputerowa nadal korzysta z HTML5/HLS. Opis instalacji i budowy: [android/README.md](android/README.md).

Wersja klienta 1.3.3 dodaje automatyczne i ręczne sprawdzanie aktualizacji oraz instalowanie APK na Android TV z potwierdzeniem systemowym. Wersja 1.3.2 dodała dostępny przy pauzie pasek czasu, kliknięcie w dowolnym miejscu do przewinięcia oraz poprawkę wchodzenia pilotem do listy odcinków. Z przycisku Wznów strzałka w górę zaznacza pasek; lewo/prawo przewija o 10 sekund. Wybranie odcinka na TV pozostawia listę otwartą.

### Railway

`Dockerfile.railway` buduje osobną instalację chmurową z APK. Wymaga trwałego wolumenu `/data` i silnego `INITIAL_ADMIN_PASSWORD` ustawionego przed pierwszym startem. Domena musi wskazywać port z rzeczywistej zmiennej `PORT`: lokalnie domyślnie 8090, w aktualnym wdrożeniu Railway 8080. Nie wysyła danych lokalnych kont. Serwer działa jako użytkownik node; etap przygotowania praw dysku uruchamia się jako root. `COOKIE_SECURE=true` wymaga HTTPS.

Profil 512 MB korzysta z `BROWSER_SERIAL=true` i `BROWSER_CLOSE_AFTER_WORK=true`: sprawdza źródła kolejno i zamyka Chromium po odczycie, zachowując profil na dysku. Ręczne logowanie do źródła zachowuje przeglądarkę aż do zakończenia przez użytkownika. Te opcje są domyślnie wyłączone w instalacji Windows/Pi. Darmowy Railway ma ograniczony budżet zasobów; długie oglądanie zużywa transfer i może wyczerpać darmowy limit.

Preferencje trzech hostingów: **Ustawienia → Odtwarzanie i hostingi**. Domyślnie pierwszy hosting to VOE. Wybór hostingu już ustawionego na innej pozycji zamienia ich kolejność. Preferencje zapisują się automatycznie dla konta.

## Testy automatyczne

```powershell
npm test
npm run build
```

Pełny test przeglądarki źródła wymaga Chromium i FFmpeg/ffprobe; na samym Windows bez `CHROMIUM_PATH` jest pomijany. Kontener zawiera te narzędzia. Testy korzystają z oddzielnej tymczasowej bazy i syntetycznego filmu: sprawdzają konta, izolację danych, filtry, zmianę linków, limit zapytań, reklamy i przyciski hostingu, MP4/Range, HLS, ręczny zapis, strumieniowy WebDAV i reset hasła. Nie odpytują prawdziwego Filman.

Integracje Plex, FTP i S3 wymagają danych konkretnego serwera do testu końcowego. Sam test syntetyczny nie gwarantuje dostępności każdego zewnętrznego hostingu ani wszystkich funkcji społecznościowych portalu.
