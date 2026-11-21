# Cinema Hub 1.3.26 — Android TV, playlisty i źródła mediów

Wspólne wydanie serwera oraz klienta Android TV `pl.cinemahub.tv`
(`versionName 1.3.26`, `versionCode 18`). Wydanie jest przygotowywane przez
workflow GitHub Actions, który testuje natywnie `linux/amd64` i `linux/arm64`,
a dopiero po ich pomyślnym zakończeniu publikuje obrazy GHCR i GitHub Release.

## Co poprawiono

- **Nawigacja Android TV:** usunięto grupę źródeł mediów z lewego menu;
  źródła pozostały dostępne w bibliotece oraz Ustawieniach. Menu ma dziewięć
  pozycji, przewijanie D-Pad i przycisk Ustawienia na dole.
- **Ustawienia:** każde wejście z menu bocznego otwiera bezpośrednio kartę
  **Źródła**, bez konieczności ręcznego przełączania z „Odtwarzanie i hostingi”.
- **Sesje źródeł:** istniejące profile sesji są przechowywane w danych serwera;
  łagodne ponawianie po błędach logowania jest ograniczone liczbą prób.
  Gdy dostawca wymaga ręcznej weryfikacji, pojawia się przycisk
  **Zaloguj / CAPTCHA**, dostępny również z pilota. Ukończenie weryfikacji
  odświeża katalog. Nie omija CAPTCHA ani zabezpieczeń serwisu.
- **Odtwarzacz:** pozycja **Lista odcinków** otwiera kolejkę playlisty.
  W kliencie Android TV jest dostępna z natywnego, pełnoekranowego panelu
  sterowania, a w przeglądarce z panelu odtwarzacza. Wybór odcinka i Back
  obsługują fokus; nie trzeba zamykać filmu, aby wyświetlić listę.
- **Playlisty mieszane:** wyświetlanie zachowuje zapisaną kolejność, znacznik
  bieżącego i obejrzanych odcinków oraz wybrany tryb odtwarzania.

## Instalacja i aktualizacja

- Android TV: `CinemaHub-AndroidTV-v1.3.26.apk`; instalacja jako aktualizacja
  istniejącego pakietu z tym samym podpisem, bez odinstalowywania.
- Serwer: `ghcr.io/hattimon/cinema-hub:1.3.26` na `linux/amd64` i `linux/arm64`,
  po pomyślnej publikacji w GitHub Actions.
- Archiwum: `CinemaHub-Server-v1.3.26.zip` oraz sumy SHA256 dla obu artefaktów.
- Aktualizację kontenera wykonaj ze wskazaniem istniejącego wolumenu
  `cinema-state:/data`. Nie usuwaj wolumenu, bazy, kont ani sesji.
- DCC: po potwierdzeniu publikacji obrazu i Release zaktualizuj wyłącznie
  pozycję Cinema Hub według [pliku zmian katalogu](DCC-CATALOG-v1.3.26.patch).
  Instrukcje: [instalacja](INSTALL.md).

## Weryfikacja i ograniczenia

Regresje obejmują menu TV i fokus, ustawienia, playlistę mieszaną 315 pozycji,
przycisk odcinków oraz wznowienie sesji źródeł. Ostateczne wyniki kompilacji
i uruchomionych testów są w logach odpowiedniego workflow GitHub Actions.
Automatyczne testy nie zastępują sprawdzenia pilota, wbudowanego WebView,
CAPTCHA konkretnego dostawcy i pełnego ekranu na fizycznym Android TV.

Audyt Stargate dotyczył **314 rekordów metadanych archiwalnych**, nie
potwierdzonych klatek wideo ani 315 pozycji playlisty użytkownika. Odcinek
**Atlantis S01E09 „Dom”** pozostaje niedostępny do czasu wiarygodnego
potwierdzenia właściwego materiału. [Szczegóły](AUDIT-1.3.26.md).
