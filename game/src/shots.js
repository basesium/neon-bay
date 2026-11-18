// The screenshot scenes behind ?shot=start|play|end|mission. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a driving autopilot
// that follows the road grid toward a target (the mission marker, or the far corner from
// the police), so the frame is what a short game really looks like and the same seed always
// gives the same frame.

import { STEP } from './config.js';
import { EVENT_BUSTED, EVENT_WASTED } from './world.js';
import { startMission } from './missions.js';
import { SCREEN_BUSTED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 26;
const END_SECONDS = 34;
const MISSION_SECONDS = 30;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** An autopilot that drives the player's car toward whatever `getTarget` returns. */
function makeDriver(world, getTarget) {
  let route = null;
  let routeTarget = null;
  return {
    controls(dt) {
      const car = world.state.player.car;
      const idle = { dir: { x: 0, y: 0 }, enter: false, punch: false, shoot: false, aimX: 0, aimY: 0 };
      if (!car || car.wrecked) return idle;
      // Re-plan only when the route is done or the target has moved a long way: a
      // fresh route mid-turn makes the car double back to the intersection it left.
      const target = getTarget();
      const moved = routeTarget ? Math.hypot(target.x - routeTarget.x, target.y - routeTarget.y) : Infinity;
      if (!route || route.length === 0 || moved > 400) {
        route = world.planRoute(car, target);
        routeTarget = target;
        // The route starts at the nearest intersection, which can sit behind the car.
        // When the next hop is ahead instead, skip the backward one: the car drives
        // on to the intersection it can already see.
        while (route.length > 1) {
          const first = angleDiff(Math.atan2(route[0].y - car.y, route[0].x - car.x), car.angle);
          const second = angleDiff(Math.atan2(route[1].y - car.y, route[1].x - car.x), car.angle);
          if (Math.abs(first) > 2.0 && Math.abs(second) < 1.2) route.shift();
          else break;
        }
      }
      let guard = 0;
      while (route.length > 0 && guard < 8) {
        guard += 1;
        const wp = route[0];
        const dx = wp.x - car.x;
        const dy = wp.y - car.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 70) {
          route.shift();
          continue;
        }
        const want = Math.atan2(dy, dx);
        const diff = angleDiff(want, car.angle);
        const steer = clamp(diff * 2.2, -1, 1);
        // Never reverse: back up and the car swings its nose into the buildings. Instead
        // slow right down for a U-turn (at 120 the turning circle fits inside the road)
        // and brake for sharp turns and for waypoints that are close and fast. Never
        // flat-out: the city is full of corners, and a wrecked ride makes a poor shot.
        const wantSpeed = Math.abs(diff) > 2.0 ? 120 : Math.abs(diff) > 0.9 ? 200 : d < 200 ? 300 : 460;
        let forward = -1;
        if (car.speed > wantSpeed + 30) forward = 1;
        else if (car.speed > wantSpeed - 40) forward = 0;
        return { dir: { x: steer, y: forward }, enter: false, punch: false, shoot: false, aimX: car.x, aimY: car.y };
      }
      return idle;
    },
  };
}

/** The corner of the city farthest from the nearest police car: where a fleeing driver goes. */
function fleeTarget(world) {
  const corners = [
    { x: 300, y: 300 },
    { x: 300, y: 1950 },
    { x: 2700, y: 300 },
    { x: 2700, y: 1950 },
  ];
  let best = corners[0];
  let bestD = -1;
  for (const car of world.state.cars) {
    if (car.kind !== 'police' || car.wrecked) continue;
    for (const corner of corners) {
      const dx = corner.x - car.x;
      const dy = corner.y - car.y;
      const d = dx * dx + dy * dy;
      if (d > bestD) {
        bestD = d;
        best = corner;
      }
    }
  }
  return bestD < 0 ? corners[3] : best;
}

function simulate(world, driver, seconds) {
  let events = 0;
  for (let index = 0; index < seconds / STEP; index += 1) {
    events = world.step(STEP, driver.controls(STEP), false);
    if (events & (EVENT_BUSTED | EVENT_WASTED)) break;
  }
  return events;
}

/**
 * Set `world` to the named scene (start, play, end or mission; any other name is start)
 * and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end' && name !== 'mission') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, null, true);
    return { screen: SCREEN_TITLE, best: { done: 0, cash: 0 } };
  }

  world.enterCar();
  if (name === 'play') {
    const driver = makeDriver(world, () => ({ x: 2700, y: 1950 }));
    simulate(world, driver, PLAY_SECONDS);
    return { screen: SCREEN_PLAY, best: { done: 0, cash: 0 } };
  }
  if (name === 'mission') {
    startMission(world.state.missions, 1);
    const driver = makeDriver(world, () => world.state.missions.marker || { x: 2760, y: 850 });
    simulate(world, driver, MISSION_SECONDS);
    return { screen: SCREEN_PLAY, best: { done: 1, cash: 150 } };
  }
  // end: three stars, four police cars, and a driver running for the far corner.
  world.setWanted(3);
  world.spawnPolice(4);
  const driver = makeDriver(world, () => fleeTarget(world));
  const events = simulate(world, driver, END_SECONDS);
  // What the bust cost, from the money the player still carries: the world already took
  // its 20% cut, so the loss is a quarter of what is left.
  const lost = Math.floor(world.state.player.money * 0.25);
  if (events & EVENT_BUSTED) return { screen: SCREEN_BUSTED, best: { done: 0, cash: 0 }, lost };
  if (events & EVENT_WASTED) return { screen: SCREEN_WASTED, best: { done: 0, cash: 0 }, lost };
  return { screen: SCREEN_PLAY, best: { done: 0, cash: 0 } };
}
