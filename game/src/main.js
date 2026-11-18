// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, busted and wasted.
// Progress (money, missions done, best cash) is saved to localStorage whenever a mission
// pays out or the player ends up at the clinic, and Continue on the title screen picks
// it back up.
//
// ?seed=N fixes the city and the traffic. ?shot=start|play|end|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { MUTE_KEY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_BUSTED,
  EVENT_CRASH,
  EVENT_HIT,
  EVENT_MISSION,
  EVENT_PICKUP,
  EVENT_PUNCH,
  EVENT_SHOT,
  EVENT_WASTED,
  createWorld,
} from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.money !== 'number' || typeof save.done !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function readMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const save = readSave();
  const best = { done: save ? save.done : 0, cash: save ? save.cash || 0 : 0 };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, best, {
      camera: scene.screen === SCREEN_TITLE ? { x: 1500 + Math.sin(world.state.time * 0.05) * 260, y: 850 } : undefined,
      lost: scene.lost || 0,
      hasSave: !!save,
    });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = readSave();
  let bestCash = save ? save.cash || 0 : 0;
  let lost = 0;
  let muted = readMuted();
  let titleTime = 0;
  let accumulator = 0;
  let last = performance.now();
  audio.setMuted(muted);

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function persist() {
    const current = { money: world.state.player.money, done: world.state.missions.done, cash: Math.max(bestCash, world.state.earned), index: world.state.missions.index };
    writeSave(current);
    save = current;
    bestCash = current.cash;
  }

  function startGame() {
    audio.unlock();
    audio.startMusic();
    audio.click();
    world.reset();
    if (save) {
      world.state.player.money = save.money;
      world.restoreMissions({ index: save.index || 0, done: save.done || 0 });
      bestCash = save.cash || 0;
    }
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Mara Voss is waiting downtown.');
  }

  function handleEvents(events) {
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_HIT) audio.punch();
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_MISSION) {
      audio.mission();
      persist();
      announce(`Mission done. $${world.state.player.money} in your pocket.`);
    }
    if (events & EVENT_BUSTED) {
      lost = Math.floor(world.state.player.money * 0.25);
      audio.busted();
      persist();
      screen = SCREEN_BUSTED;
      announce('Busted. The clinic patched you up.');
    }
    if (events & EVENT_WASTED) {
      lost = Math.floor(world.state.player.money * 0.43);
      audio.busted();
      persist();
      screen = SCREEN_WASTED;
      announce('Wasted. The clinic patched you up.');
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      muted = !muted;
      audio.setMuted(muted);
      try {
        window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        // See writeSave().
      }
    }
    if (actions & ACTION_CONFIRM && screen === SCREEN_TITLE) startGame();
    else if (actions & ACTION_CONFIRM && (screen === SCREEN_BUSTED || screen === SCREEN_WASTED)) {
      world.clearEnd();
      screen = SCREEN_PLAY;
      announce('Back on the streets.');
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    return actions;
  }

  function step(frameActions) {
    if (screen === SCREEN_TITLE) {
      titleTime += STEP;
      world.step(STEP, null, true);
      return;
    }
    const mouse = input.mouse();
    const aim = renderer.screenToWorld(mouse.x, mouse.y);
    const controls = {
      dir: input.direction(),
      enter: !!(frameActions & ACTION_ENTER),
      punch: !!(frameActions & ACTION_PUNCH),
      shoot: mouse.down && !world.state.player.inCar,
      aimX: aim.x,
      aimY: aim.y,
    };
    const events = world.step(STEP, controls, false);
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const frameActions = handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      accumulator += frameDt;
      // One-shot presses (enter a car, punch) belong to the frame's first step only:
      // a second step in the same frame would enter and immediately leave the car.
      let firstStep = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(firstStep ? frameActions : 0);
        firstStep = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    // Sound follows the drive: the engine by the car's speed, the siren by the nearest cop.
    const player = world.state.player;
    const speed01 = player.inCar && player.car ? Math.abs(player.car.speed) / 640 : 0;
    audio.engine(screen === SCREEN_PLAY ? speed01 : 0, frameDt);
    let nearest = Infinity;
    for (const car of world.state.cars) {
      if (car.kind !== 'police' || car.wrecked) continue;
      const dx = car.x - player.x;
      const dy = car.y - player.y;
      nearest = Math.min(nearest, Math.sqrt(dx * dx + dy * dy));
    }
    audio.siren(screen === SCREEN_PLAY && world.state.wanted > 0 ? Math.max(0, 1 - nearest / 900) : 0, frameDt);
    renderer.draw(world.state, screen, { done: world.state.missions.done, cash: Math.max(bestCash, world.state.earned) }, {
      camera: screen === SCREEN_TITLE ? { x: 1500 + Math.sin(titleTime * 0.05) * 260, y: 850 } : undefined,
      lost,
      muted,
      hasSave: !!save,
    });
  }

  // Leaving the tab pauses a running game and saves it, rather than letting the
  // police catch the player unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      persist();
      announce('Paused.');
    }
  });

  announce('Neon Bay. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
