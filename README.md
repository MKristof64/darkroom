# Ország–Város: After Dark

Mobilra optimalizált, magyar társasjáték közös online szobákkal.

**Játszható oldal:** https://mkristof64.github.io/orszag-varos/

## Játékmenet

- A házigazda hatjegyű kóddal és meghívólinkkel megosztható szobát hoz létre.
- Minden körben véletlen betű és 7 különböző téma érkezik a 14 témából.
- Egyedi válasz: **1 pont**. Azonos vagy üres válasz: **0 pont**. A kis- és nagybetűk azonosnak számítanak; a pontozás az ékezeteket és az ismételt szóközöket is egységesíti. Rossz kezdőbetű: 0 pont.
- A házigazda eltávolíthat játékosokat, és az értékeléskor javíthatja a válaszok pontját és a játékos összpontszámát.
- Telefonon egymás alatt jelennek meg a mezők, az időzítő görgetés közben is látható, az Enter a következő mezőre lép.

A részletes szabályok és a témák a [JATEK.md](JATEK.md) fájlban találhatók.

## Fejlesztés

Node.js 22.13 vagy újabb szükséges.

```sh
npm ci
npm run dev
npm test
npm run build:pages
```

A GitHub Pages a `main` ág `/docs` könyvtárát szolgálja ki. A `build:pages` parancs előállítja ezt a könyvtárat, a helyes `/orszag-varos/` útvonalakkal és `.nojekyll` fájllal. A build után a megváltozott `docs` fájlokat is commitolni kell.

## Online szobák

A Pages felülete a https://orszag-varos-after-dark.kristof-madarasz159.chatgpt.site címen működő játékszervert használja. A szerver D1 adatbázisban tárolja a szobákat, privát játékostokennel ellenőrzi a jogosultságokat, és egyszerre érkező mentésekre is felkészült. A GitHub Pages felület eredetét a szerver külön engedélyezi.

A szerver nélküli statikus tárhely önmagában nem kezeli a közös szobákat. Másik szerverhez a Pages build előtt a `VITE_API_ORIGIN` környezeti változót kell beállítani; a szerveren engedélyezni kell a felület pontos eredetét is. A szerver buildje: `npm run build`. Az adatbázis migrációja a `drizzle` könyvtárban található. Az első API-kérés szükség esetén létrehozza a kezdeti szobatáblát; a meglévő adatokat megőrzi.

Valódi HTTP/D1 integrációs ellenőrzés futó fejlesztői szerveren:

```sh
node tests/game.test.mjs http://localhost:5173
```