# Budowanie i testowanie

Panel używa React, TypeScript i Vite. API korzysta z Node.js, Express i SQLite; adaptery portali wykorzystują Chromium/Playwright. Weryfikacja strumieni używa FFmpeg/ffprobe.

## Serwer

Wymagane Node.js **22.17.0 lub nowsze**.

```sh
npm ci
npm test
npm run build
npm start
```

Serwer: `http://localhost:8090/`. Lokalna baza powstaje w `data/`. Do obsługi portali bez Dockera potrzebne jest Chromium Playwright; narzędzia FFmpeg/ffprobe i rclone służą do mediów i magazynów. Obraz Docker zawiera te zależności.

## Android TV

Wymagane Java 17, Android SDK 35 / Build Tools 35.0.0 i Gradle 8.9.

```sh
cd android
./gradlew :app:assembleRelease :app:lintRelease
```

Na Windows użyj `gradlew.bat`. SDK wskaż przez standardową zmienną `ANDROID_HOME` lub lokalny `local.properties`. APK powstaje w `android/app/build/outputs/apk/release/`. Podpis do aktualizacji gotowego APK musi być zgodny z zainstalowanym klientem; prywatny klucz wydania nie jest publikowany.

## Kontener

```sh
docker compose up -d --build
```

Workflow `.github/workflows/container.yml` buduje obrazy `linux/amd64` i `linux/arm64` po wypchnięciu tagu `v*` albo ręcznym uruchomieniu. Publikuje je w GHCR z tagiem wersji i `latest`.

## Weryfikacja wydania 1.3.5

W Windows Docker i natywnym Docker ARM64 na Raspberry Pi zestaw testów zaliczył **35/35**, bez pominiętych testów. Testy używają tymczasowej bazy i syntetycznych mediów; obejmują konta, izolację źródeł, Vider, katalog Przystani, MP4/Range, HLS, ręczny zapis i interfejs klienta TV. Nie potwierdzają wszystkich zewnętrznych hostingów ani konkretnego dekodera TV.

W publicznym pakiecie startup kontenera dodatkowo umieszcza dołączony APK w katalogu pobierania serwera. Kod panelu, API i klienta Android pozostaje zgodny z wdrożonym wydaniem.
