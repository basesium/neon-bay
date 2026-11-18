# Neon Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/basesium/neon-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/basesium/neon-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Neon Bay** is an open-world crime game in the spirit of classic top-down GTA: a fictional
sun-soaked coastal city you explore on foot and by car, with traffic, pedestrians, a wanted
level with police who respond, four story missions, combat, and a HUD with a minimap. Every
street, character, vehicle, name and story in it is original — nothing is taken from any
commercial game.

## The story

You're the new getaway driver in Neon Bay, working for **Mara Voss**, a fixer who runs jobs
out of a downtown office. Four jobs stand between you and the top of the city's food chain:

1. **First Shift** — meet Mara at her office.
2. **Package Run** — pick up a package at the docks and deliver it to the Boardwalk Cafe
   while the cops close in.
3. **Getaway Driver** — pick up Rico in the back alley, then lose the cops.
4. **Bayfront Drop** — one last delivery at Lighthouse Point, with the whole precinct
   on your tail.

## How to play

Serve the game with `node serve.ts` and open http://localhost:8080, or open `game/index.html`
from any static file server. No build step, no network request, keyboard and mouse.

| Key | What it does |
| --- | --- |
| WASD / arrows | Walk, and drive when you're in a car |
| E | Steal / enter a car, or get out of one |
| F | Punch (on foot) |
| Click | Shoot the pistol toward the cursor (on foot, uses ammo) |
| Space / Enter | Start, continue, confirm |
| P / Esc | Pause |
| M | Mute / unmute |

Stealing a car, hitting a pedestrian or firing a shot raises your wanted level (1–5 stars).
Police cars and foot cops chase you; get caught and you're busted — you lose a cut of your
cash and wake up at the Harbor Clinic. Break line of sight and the heat cools down, one
star at a time. Ammo boxes, health kits and cash drops are scattered around the city, and
your money, missions and best cash are saved in the browser.

## What's inside

- `game/src/world.js` — the city, traffic, pedestrians, police, wanted level, combat
- `game/src/render.js` — the camera, the city, the HUD and the minimap
- `game/src/missions.js` — the four jobs and Mara's story
- `game/src/audio.js` — engine, siren, music and effects, all synthesised with WebAudio
- `game/src/input.js`, `game/src/config.js`, `game/src/random.js` — input, tuning, seeded RNG
- `game/src/shots.js` — the four staged screenshot scenes
- `game/src/main.js` — boot, the game loop, screens and saves

## Bounty

Built for the [make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01).
