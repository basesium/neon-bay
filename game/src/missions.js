// The story and the missions. The player is a new getaway driver in Neon Bay, working for
// Mara Voss, a fixer who runs jobs out of a downtown office. Four jobs, in order, each a
// list of steps: drive (or walk) to a marker, and for the last job in a chain, lose the
// cops. Steps are data; the manager below moves them forward and pays out the rewards.
// This file knows nothing about drawing or input: it reads the world's state and writes
// back money, wanted level, dialog and the objective line.

import { PLACES } from './config.js';

/** How close the player must get to a marker for the step to count as done. */
const ARRIVE = 100;

export const MISSIONS = [
  {
    id: 'first-shift',
    title: 'First Shift',
    briefing: 'Mara Voss wants to meet the new driver.',
    reward: 150,
    steps: [
      {
        kind: 'goto',
        x: PLACES.marasOffice.x,
        y: PLACES.marasOffice.y,
        label: "Go to Mara's Office",
        say: [
          "Mara: So you're the new driver. Neon Bay eats slow drivers.",
          'Mara: One job first. The docks. Don\'t keep me waiting.',
        ],
      },
    ],
  },
  {
    id: 'package-run',
    title: 'Package Run',
    briefing: 'Pick up the package at the docks. Deliver it to the Boardwalk Cafe.',
    reward: 300,
    steps: [
      {
        kind: 'goto',
        x: PLACES.docks.x,
        y: PLACES.docks.y,
        label: 'Pick up the package at the docks',
        say: ['Package secured. The cafe is across town — and the cops got a tip.'],
        wanted: 1,
        police: 2,
      },
      {
        kind: 'goto',
        x: PLACES.boardwalkCafe.x,
        y: PLACES.boardwalkCafe.y,
        label: 'Deliver the package to the Boardwalk Cafe',
        say: ["Delivered clean. Mara's crew is impressed."],
      },
    ],
  },
  {
    id: 'getaway-driver',
    title: 'Getaway Driver',
    briefing: 'Pick up Rico in the back alley, then lose the cops.',
    reward: 450,
    steps: [
      {
        kind: 'goto',
        x: PLACES.alley.x,
        y: PLACES.alley.y,
        label: 'Pick up Rico in the back alley',
        say: ['Rico: Drive! The whole precinct is on us!', "Rico: Lose them and we're golden."],
        wanted: 2,
        police: 3,
      },
      {
        kind: 'lose',
        label: 'Lose the cops',
        say: ["Rico: Clean! You're a legend, kid."],
      },
    ],
  },
  {
    id: 'bayfront-drop',
    title: 'Bayfront Drop',
    briefing: 'One last drop at the Lighthouse. The heat is on.',
    reward: 800,
    steps: [
      {
        kind: 'goto',
        x: PLACES.lighthouse.x,
        y: PLACES.lighthouse.y,
        label: 'Deliver to Lighthouse Point',
        say: ["Mara: That's the last of it. Neon Bay is yours now, driver."],
        wanted: 3,
        police: 4,
      },
    ],
  },
];

/** A fresh mission manager: no job started, no dialog showing. */
export function createMissions() {
  return {
    index: 0,
    step: 0,
    done: 0,
    marker: null,
    objective: '',
    dialog: null,
    dialogT: 0,
    allDone: false,
  };
}

/** The mission the player is on now, or null once every job is finished. */
export function currentMission(missions) {
  return missions.index < MISSIONS.length ? MISSIONS[missions.index] : null;
}

/** The step the player is on now, or null. */
export function currentStep(missions) {
  const mission = currentMission(missions);
  return mission ? mission.steps[missions.step] : null;
}

/** Start (or restart) the job at `index`: first step, fresh marker and objective. */
export function startMission(missions, index) {
  missions.index = index;
  missions.step = 0;
  missions.allDone = false;
  refreshMarker(missions);
}

function refreshMarker(missions) {
  const mission = currentMission(missions);
  if (!mission) {
    missions.marker = null;
    missions.objective = 'Free roam — Neon Bay is yours.';
    missions.allDone = true;
    return;
  }
  const step = mission.steps[missions.step];
  missions.objective = `${mission.title}: ${step.label}`;
  missions.marker = step.kind === 'goto' ? { x: step.x, y: step.y, label: step.label } : null;
}

function showDialog(missions, lines) {
  missions.dialog = lines;
  missions.dialogT = 3.2 + lines.length * 1.4;
}

function finishStep(missions, world, step) {
  if (step.say) showDialog(missions, step.say);
  if (step.wanted) world.setWanted(Math.max(world.state.wanted, step.wanted));
  if (step.police) world.spawnPolice(step.police);
  missions.step += 1;
  const mission = currentMission(missions);
  if (missions.step >= mission.steps.length) {
    world.state.player.money += mission.reward;
    world.state.earned += mission.reward;
    missions.done += 1;
    missions.index += 1;
    missions.step = 0;
    world.events |= 16; // EVENT_MISSION
    if (missions.index >= MISSIONS.length) {
      showDialog(missions, ["Mara: All four jobs done. You're the best wheel in Neon Bay."]);
    }
  }
  refreshMarker(missions);
}

/**
 * Advance the missions one step. `world` is the object createWorld returns: it carries
 * state (player position, wanted, money) and the setWanted / spawnPolice helpers. Returns
 * nothing; the mission state and the world's objective line are updated in place.
 */
export function updateMissions(missions, world, dt) {
  if (missions.dialog) {
    missions.dialogT -= dt;
    if (missions.dialogT <= 0) missions.dialog = null;
  }
  const mission = currentMission(missions);
  if (!mission) return;
  const step = mission.steps[missions.step];
  if (step.kind === 'goto') {
    const player = world.state.player;
    const px = player.inCar ? player.car.x : player.x;
    const py = player.inCar ? player.car.y : player.y;
    const dx = step.x - px;
    const dy = step.y - py;
    if (dx * dx + dy * dy < ARRIVE * ARRIVE) finishStep(missions, world, step);
  } else if (step.kind === 'lose') {
    if (world.state.wanted === 0) finishStep(missions, world, step);
  }
}

/** What the save file keeps of the missions: which job is current and how many are done. */
export function missionsForSave(missions) {
  return { index: missions.index, done: missions.done };
}

/** Put a saved mission state back: the current job restarts from its first step. */
export function restoreMissions(missions, saved) {
  missions.done = saved.done || 0;
  startMission(missions, Math.min(saved.index || 0, MISSIONS.length));
}
