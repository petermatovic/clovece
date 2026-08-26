# Človeče, nehnevaj sa — 3D

Webová 3D verzia klasickej hry pre **2 až 4 hráčov na jednom zariadení** (hotseat).
Každý slot môže hrať človek alebo počítač, takže sa dá hrať aj v jednom.

Bez backendu, bez obrázkových assetov — doska, figúrky, textúry aj zvuky sa
generujú programovo.

## Spustenie

```bash
npm install
npm run dev
```

Ďalšie príkazy:

```bash
npm test      # unit testy pravidiel (Vitest)
npm run build # produkčný build do dist/
```

## Čo hra vie

- **3D doska** s tieňmi (PCF soft shadows), ACES tone mappingom a plynulou kamerou,
  ktorá sa otáča k hráčovi na ťahu.
- **Štyri hracie plochy** na výber pred štartom: Klasik (drevo), Mramor & zlato,
  Neón (svietiace polia + hviezdy) a Cukríky. Menia materiál dosky, štýl polí,
  svetlo aj pozadie.
- **Voľba farieb** — zvlášť pre figúrky (musia byť unikátne) a zvlášť pre kocku
  každého hráča. Osem farieb, ukladá sa do `localStorage`.
- **Fyzikálna kocka** (cannon-es): hod je skutočný, výsledok sa číta z toho, ktorá
  stena po ustálení smeruje nahor — nie je predurčený.
- **Efekty**: skoky figúrok po poliach so squash & stretch, časticový výbuch pri
  vyhodení, iskry pri dobehnutí do domčeka, konfety pri výhre, krúžky v mieste dopadu.
- **Zvuk** generovaný cez Web Audio API — kotúľanie kocky, ťuknutia figúrok,
  úder pri vyhodení, stupnica pri dobehnutí, fanfára pri výhre.
- **Uloženie rozohranej partie** — po zavretí karty sa dá pokračovať.

## Pravidlá

Štandardné slovenské/české: nasadenie len na šestku, po šestke sa hádže znova,
tri pokusy keď hráč nemá figúrku na dráhe, vyhadzovanie súperov, do domčeka
presným počtom a bez preskakovania vlastných figúrok.

## Architektúra

Kľúčové rozhodnutie: **herné jadro nevie nič o Three.js.** Je to čistý stavový
automat s event emitterom, takže sa dá celá partia odohrať headless (to robia aj
testy) a neskôr sa dá rovnaký kód použiť na serveri pre online režim.

```
src/
  core/      čistá logika — topológia dosky, pravidlá, stavový automat, AI
  render/    Three.js — scéna, doska, figúrky, kocka, efekty, animácie
  audio/     procedurálne zvuky (Web Audio API)
  ui/        DOM vrstva — obrazovky, HUD, localStorage
  controller.ts  jediné miesto, kde sa vrstvy stretávajú
```

Layout dosky sa generuje **rotáciou jedného ramena** o 90° (`render/layout.ts`),
takže sa nikde nehardcoduje 40 polí a nemôže sa rozísť s topológiou v `core/board.ts`.
Kontrolu robí `assertLayoutConsistent()` pri štarte.

## Testy

`src/core/rules.test.ts` pokrýva pravidlové okrajové prípady (nasadenie, blokovanie
vlastnou figúrkou, vyhadzovanie, presný dobeh do domčeka, zákaz preskoku v domčeku,
tri pokusy, extra hod po šestke) a odohrá celú partiu AI proti AI s deterministickým
generátorom.

## Ďalšie fázy

Online multiplayer, štatistiky naprieč partiami, viac jazykov, PWA inštalácia,
voliteľné pravidlové varianty.
