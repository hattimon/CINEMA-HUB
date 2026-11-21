# Audyt Stargate — serwer Cinema Hub 1.3.27

Zakres: presetów `public/playlists/stargate_chronologia_cinema_hub.json`
i `public/playlists/stargate_od_s08_cinema_hub.json`, po zmianie z commit
`9c2f038`. Audyt wcześniejszych zarchiwizowanych metadanych obejmuje
**314 rekordów** SG-1 (214) i Atlantis (100). Mieszana playlista
chronologiczna ma **315 pozycji**.

W obu presetach **Atlantis S01E18 „The Gift”** jest oznaczony jako
`availability: unverified` i `series_code: null`. Do czasu potwierdzenia
źródła nie należy automatycznie wiązać odcinka z innym materiałem.
**Atlantis S01E09 „Dom”** pozostaje niedostępny.

Regresja sprawdza metadane i kolejność presetów. Nie zweryfikowano obrazu,
dźwięku ani tożsamości odcinków w usługach hostingowych: **0 klatek
zweryfikowanego nagrania**. Więcej informacji o zakresie i ograniczeniach:
[audyt 1.3.26](AUDIT-1.3.26.md).

Serwer 1.3.27 dystrybuuje istniejące APK Android TV 1.3.26, bez nowego
builda Androida. Test fizycznego telewizora pozostaje osobny.
