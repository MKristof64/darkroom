# Ország–Város · Darkroom

Magyar, mobilon és asztali böngészőben játszható társasági szójáték.

- A házigazda becenévvel létrehoz egy szobát, amely véletlen hatjegyű kódot kap.
- A többiek kóddal vagy meghívólinkkel csatlakoznak; legfeljebb 20 játékos fér el.
- Körönként egy véletlen betű és a megadott 18 témából pontosan 7 különböző téma jelenik meg.
- A válaszokat folyamatosan mentjük. Beküldés után zároljuk őket. Az összes beküldés, a házigazdai lezárás vagy az idő lejárta pontozást indít.
- Egyedi helyes kezdőbetűjű válasz: **1 pont**. Azonos válasz: **0 pont**. Üres vagy hibás kezdőbetűjű válasz: **0 pont**.
- A kis- és nagybetűk, ékezetpárok és felesleges szóközök nem számítanak eltérésnek.
- A téma szerinti helyességet a társaság bírálja el. A házigazda válaszonként, valamint az összpontszámban is javíthat a kör végén.
- A házigazda eltávolíthat játékost. A korábbi válaszok és pontok megmaradnak, a következő körökből kimarad.
- Új játékos a várószobában vagy két kör között csatlakozhat. A szoba 24 óráig használható.

A játékállapotot Cloudflare D1 tárolja. A házigazdai jogot titkos, böngészőfülhöz kötött belépési token védi; a szobakód önmagában nem ad házigazdai jogot. Kör közben mások válaszait az API sem adja vissza. Az egyidejű mentéseket verzióellenőrzés védi.

Az alkalmazás React/Vinext felületből, az `app/api/game/route.ts` szoba-API-ból és a `lib/game.mjs` játéklogikából áll. A szerverbeállítás a `.openai/hosting.json`, az adatbázismigráció a `drizzle/` könyvtárban található.

Ellenőrzés: TypeScript fordításellenőrzés, teljes Worker-build, tényleges helyi D1-es többjátékos API-próba (párhuzamos belépés/mentés, 1/0 pontozás, jogosultságok, pontjavítás, eltávolítás és körváltás), valamint böngészős játékmenet és mobilnézet.
