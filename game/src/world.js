// The game's rules and state, with no drawing and no browser in it: the city of Neon Bay,
// the player on foot and in a car, traffic, pedestrians, the police and the wanted level,
// combat, pickups, particles and the missions. step() advances one fixed step and returns
// what happened as bit flags, so the caller can react without the world knowing about
// screens or sound. Nothing here allocates after createWorld returns, except the small
// waypoint lists the police and the screenshot autopilot plan with.

import {
  BEACH,
  BUSTED_LOSS,
  CAR,
  PICKUPS,
  PLACES,
  PLAYER,
  POLICE,
  ROADS,
  TRAFFIC,
  PED,
  WANTED,
  WASTED_LOSS,
  WORLD,
} from './config.js';
import {
  createMissions,
  currentMission,
  missionsForSave,
  restoreMissions,
  startMission,
  updateMissions,
} from './missions.js';

export const EVENT_HIT = 1;
export const EVENT_PICKUP = 2;
export const EVENT_CRASH = 4;
export const EVENT_SHOT = 8;
export const EVENT_MISSION = 16;
export const EVENT_BUSTED = 32;
export const EVENT_WASTED = 64;
export const EVENT_PUNCH = 128;

/** Pooled bullets and particles, allocated once. */
const BULLET_POOL = 32;
const PARTICLE_POOL = 220;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** The smallest angle between two headings, in (-PI, PI]. */
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Push a circle out of a rectangle; returns true when it overlapped. */
function circleRectResolve(body, rect) {
  const cx = clamp(body.x, rect.x, rect.x + rect.w);
  const cy = clamp(body.y, rect.y, rect.y + rect.h);
  const dx = body.x - cx;
  const dy = body.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= body.r * body.r) return false;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    body.x = cx + (dx / d) * body.r;
    body.y = cy + (dy / d) * body.r;
  } else {
    // Dead centre inside the rectangle: push out along the shallowest side.
    const left = body.x - rect.x;
    const right = rect.x + rect.w - body.x;
    const top = body.y - rect.y;
    const bottom = rect.y + rect.h - body.y;
    const min = Math.min(left, right, top, bottom);
    if (min === left) body.x = rect.x - body.r;
    else if (min === right) body.x = rect.x + rect.w + body.r;
    else if (min === top) body.y = rect.y - body.r;
    else body.y = rect.y + rect.h + body.r;
  }
  return true;
}

export function createWorld(random) {
  // ---- the city ------------------------------------------------------------
  const buildings = [];
  const ROOFS = ['#3d4a6b', '#5b4a7a', '#6b4a3d', '#2e5d4b', '#7a5a2e', '#4a3d6b', '#6b2e4a', '#2e4a5d'];
  const SIGNS = ['#ff2e88', '#22d3ee', '#facc15', '#a78bfa', null, null];
  const blockXs = [];
  for (let i = 0; i < ROADS.vertical.length - 1; i += 1) {
    blockXs.push([ROADS.vertical[i] + ROADS.width / 2 + ROADS.sidewalk, ROADS.vertical[i + 1] - ROADS.width / 2 - ROADS.sidewalk]);
  }
  const blockYs = [];
  for (let i = 0; i < ROADS.horizontal.length - 1; i += 1) {
    blockYs.push([ROADS.horizontal[i] + ROADS.width / 2 + ROADS.sidewalk, ROADS.horizontal[i + 1] - ROADS.width / 2 - ROADS.sidewalk]);
  }
  blockYs.push([ROADS.horizontal[ROADS.horizontal.length - 1] + ROADS.width / 2 + ROADS.sidewalk, WORLD.height - 40]);
  for (let bx = 0; bx < blockXs.length; bx += 1) {
    for (let by = 0; by < blockYs.length; by += 1) {
      const [x0, x1] = blockXs[bx];
      const [y0, y1] = blockYs[by];
      const downtown = bx >= 1 && bx <= 2 && by <= 1;
      const count = random.chance(0.45) ? 2 : 1;
      for (let b = 0; b < count; b += 1) {
        const w = count === 1 ? x1 - x0 - 48 : (x1 - x0) / 2 - 40;
        const h = count === 1 ? y1 - y0 - 48 : y1 - y0 - 48;
        const x = count === 1 ? x0 + 24 : x0 + 24 + b * ((x1 - x0) / 2);
        const y = y0 + 24;
        buildings.push({
          x,
          y,
          w,
          h,
          color: random.pick(ROOFS),
          sign: random.pick(SIGNS),
          tall: downtown && random.chance(0.6),
          name: downtown && random.chance(0.5) ? random.pick(['HOTEL', 'CASINO', 'TOWER', 'PLAZA', 'CLUB']) : '',
        });
      }
    }
  }
  // Mara's office: a fixed pink-signed building downtown, so the first marker always lands.
  buildings.push({ x: 1020, y: 420, w: 220, h: 150, color: '#5b4a7a', sign: '#ff2e88', tall: true, name: "MARA'S" });

  const palms = [];
  for (let y = 120; y < WORLD.height - 60; y += 170) {
    palms.push({ x: 2880 + random.range(-8, 8), y: y + random.range(-20, 20) });
    if (random.chance(0.5)) palms.push({ x: 2960 + random.range(-8, 8), y: y + 90 });
  }

  // ---- the actors ----------------------------------------------------------
  const player = {
    x: PLACES.playerStart.x,
    y: PLACES.playerStart.y,
    r: PLAYER.radius,
    angle: -Math.PI / 2,
    health: PLAYER.health,
    money: 0,
    ammo: PLAYER.startAmmo,
    inCar: false,
    car: null,
    punchT: 0,
    shootT: 0,
    invuln: 0,
    speed: 0,
  };

  const cars = [];
  function addCar(kind, x, y, angle, color) {
    const car = {
      id: cars.length,
      kind,
      x,
      y,
      r: 20,
      angle,
      speed: 0,
      color,
      health: kind === 'police' ? 120 : kind === 'player' ? CAR.health : 60,
      driver: kind === 'player' ? 'none' : 'ai',
      wrecked: false,
      // Traffic AI: which road it follows, which way, and its lane offset.
      road: 'v',
      roadIndex: 0,
      dir: 1,
      lane: 0,
      targetSpeed: TRAFFIC.speed,
      // Police pursuit: waypoints and when to re-plan them.
      route: null,
      routeAt: 0,
      replanT: 0,
      ramT: 0,
    };
    cars.push(car);
    return car;
  }

  const peds = [];
  function addPed(x, y) {
    peds.push({
      x,
      y,
      r: 10,
      angle: random.range(0, Math.PI * 2),
      speed: 0,
      state: 'walk',
      stateT: 0,
      color: random.pick(['#e8e4d8', '#f2c94c', '#7ec8e3', '#e58aa5', '#a8e6a1', '#d8b4fe']),
      // Sidewalk walking: which road's sidewalk and which way along it.
      axis: random.chance(0.5) ? 'v' : 'h',
      line: 0,
      dir: random.chance(0.5) ? 1 : -1,
    });
  }

  const cops = [];
  function addCop(x, y) {
    cops.push({ x, y, r: 12, angle: 0, health: 50, downT: 0, speed: 0 });
  }

  const bullets = [];
  for (let i = 0; i < BULLET_POOL; i += 1) bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 });

  const particles = [];
  for (let i = 0; i < PARTICLE_POOL; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 3, color: '#ffffff' });
  }

  const pickups = PICKUPS.map((p) => ({ kind: p.kind, x: p.x, y: p.y, active: true, respawnT: 0 }));

  const state = {
    player,
    cars,
    peds,
    cops,
    bullets,
    particles,
    pickups,
    buildings,
    palms,
    wanted: 0,
    crimeT: 0,
    decayT: 0,
    bustT: 0,
    earned: 0,
    time: 0,
    shake: 0,
    busted: false,
    wasted: false,
    missions: createMissions(),
  };

  // ---- helpers -------------------------------------------------------------
  function freeParticle() {
    for (let i = 0; i < particles.length; i += 1) if (!particles[i].active) return particles[i];
    return null;
  }

  function spawnParticles(x, y, count, color, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const p = freeParticle();
      if (!p) return;
      const a = random.range(0, Math.PI * 2);
      const s = random.range(speed * 0.3, speed);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = random.range(life * 0.5, life);
      p.max = p.life;
      p.size = random.range(size * 0.6, size * 1.4);
      p.color = color;
    }
  }

  function onAsphalt(x, y) {
    for (const cx of ROADS.vertical) if (Math.abs(x - cx) <= ROADS.width / 2) return true;
    for (const cy of ROADS.horizontal) if (Math.abs(y - cy) <= ROADS.width / 2) return true;
    return false;
  }

  function onSidewalk(x, y) {
    for (const cx of ROADS.vertical) {
      const d = Math.abs(x - cx);
      if (d > ROADS.width / 2 && d <= ROADS.width / 2 + ROADS.sidewalk) return true;
    }
    for (const cy of ROADS.horizontal) {
      const d = Math.abs(y - cy);
      if (d > ROADS.width / 2 && d <= ROADS.width / 2 + ROADS.sidewalk) return true;
    }
    return false;
  }

  function collideBuildings(body) {
    let hit = false;
    for (let i = 0; i < buildings.length; i += 1) {
      if (circleRectResolve(body, buildings[i])) hit = true;
    }
    return hit;
  }

  function nearestIntersection(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const cx of ROADS.vertical) {
      for (const cy of ROADS.horizontal) {
        const d = dist2(x, y, cx, cy);
        if (d < bestD) {
          bestD = d;
          best = { x: cx, y: cy };
        }
      }
    }
    return best;
  }

  /** A grid route: intersection hops from `from` toward `to`, then the target itself. */
  function planRoute(from, to) {
    const start = nearestIntersection(from.x, from.y);
    const goal = nearestIntersection(to.x, to.y);
    const points = [{ x: start.x, y: start.y }];
    let cx = start.x;
    let cy = start.y;
    while (cx !== goal.x) {
      cx += cx < goal.x ? 600 : -600;
      // Road spacing is 600 on both axes in this city, so stepping by 600 lands on roads.
      points.push({ x: cx, y: cy });
    }
    while (cy !== goal.y) {
      cy += cy < goal.y ? 550 : -550;
      points.push({ x: cx, y: cy });
    }
    points.push({ x: to.x, y: to.y });
    return points;
  }

  function roadPointNear(x, y, minD, maxD) {
    for (let tries = 0; tries < 12; tries += 1) {
      const vertical = random.chance(0.5);
      const px = vertical ? random.pick(ROADS.vertical) : random.range(120, WORLD.width - 120);
      const py = vertical ? random.range(120, WORLD.height - 120) : random.pick(ROADS.horizontal);
      const d = Math.sqrt(dist2(x, y, px, py));
      if (d >= minD && d <= maxD) return { x: px, y: py };
    }
    return { x: clamp(x + 700, 100, WORLD.width - 100), y: clamp(y, 100, WORLD.height - 100) };
  }

  function policeTargetCount() {
    return state.wanted === 0 ? 0 : state.wanted + 1;
  }

  function policeCars() {
    let n = 0;
    for (const car of cars) if (car.kind === 'police' && !car.wrecked) n += 1;
    return n;
  }

  function nearestCopDist() {
    const px = player.inCar ? player.car.x : player.x;
    const py = player.inCar ? player.car.y : player.y;
    let best = Infinity;
    for (const car of cars) {
      if (car.kind !== 'police' || car.wrecked) continue;
      best = Math.min(best, Math.sqrt(dist2(px, py, car.x, car.y)));
    }
    for (const cop of cops) {
      if (cop.downT > 0) continue;
      best = Math.min(best, Math.sqrt(dist2(px, py, cop.x, cop.y)));
    }
    return best;
  }

  function addCrime(level) {
    if (state.crimeT > 0) return;
    state.wanted = Math.min(WANTED.max, state.wanted + level);
    state.crimeT = WANTED.crimeCooldown;
    state.decayT = 0;
  }

  function setWanted(level) {
    state.wanted = clamp(level, 0, WANTED.max);
    state.decayT = 0;
  }

  function spawnPolice(count) {
    const px = player.inCar ? player.car.x : player.x;
    const py = player.inCar ? player.car.y : player.y;
    for (let i = 0; i < count; i += 1) {
      const spot = roadPointNear(px, py, 500, 900);
      const car = addCar('police', spot.x, spot.y, random.range(0, Math.PI * 2), '#20242e');
      car.route = null;
      car.replanT = 0;
    }
  }

  function damageCar(car, amount, fromX, fromY) {
    car.health -= amount;
    if (car.health <= 0 && !car.wrecked) {
      car.wrecked = true;
      car.speed = 0;
      spawnParticles(car.x, car.y, 26, '#ff9f43', 260, 0.9, 6);
      spawnParticles(car.x, car.y, 18, '#5a5f6e', 120, 1.6, 8);
      if (car === player.car) {
        player.inCar = false;
        player.car = null;
        player.x = car.x + 40;
        player.y = car.y;
      }
    }
  }

  function respawn() {
    const spot = PLACES.hospital;
    player.x = spot.x;
    player.y = spot.y + 60;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.health;
    player.inCar = false;
    player.car = null;
    player.invuln = 1;
    state.wanted = 0;
    state.bustT = 0;
    state.decayT = 0;
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      if (cars[i].kind === 'police') cars.splice(i, 1);
    }
    cops.length = 0;
  }

  // ---- traffic -------------------------------------------------------------
  function spawnTraffic() {
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const vertical = random.chance(0.5);
      let x;
      let y;
      let roadIndex;
      let dir;
      if (vertical) {
        roadIndex = random.int(0, ROADS.vertical.length - 1);
        dir = random.chance(0.5) ? 1 : -1;
        x = ROADS.vertical[roadIndex] + (dir === 1 ? -28 : 28);
        y = random.range(150, WORLD.height - 150);
      } else {
        roadIndex = random.int(0, ROADS.horizontal.length - 1);
        dir = random.chance(0.5) ? 1 : -1;
        y = ROADS.horizontal[roadIndex] + (dir === 1 ? 28 : -28);
        x = random.range(150, WORLD.width - 150);
      }
      if (dist2(x, y, player.x, player.y) < 300 * 300) {
        x = clamp(x + 700, 150, WORLD.width - 150);
      }
      const car = addCar('traffic', x, y, vertical ? (dir === 1 ? Math.PI / 2 : -Math.PI / 2) : dir === 1 ? 0 : Math.PI, random.pick(TRAFFIC.colors));
      car.road = vertical ? 'v' : 'h';
      car.roadIndex = roadIndex;
      car.dir = dir;
      car.targetSpeed = TRAFFIC.speed + random.range(-TRAFFIC.speedJitter, TRAFFIC.speedJitter);
    }
  }

  function stepTrafficCar(car, dt) {
    // Slow down for a car ahead on the same road.
    let ahead = Infinity;
    for (const other of cars) {
      if (other === car || other.wrecked) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const along = car.road === 'v' ? dy * car.dir : dx * car.dir;
      const across = car.road === 'v' ? Math.abs(dx) : Math.abs(dy);
      if (along > 0 && along < 90 && across < 40) ahead = Math.min(ahead, along);
    }
    const want = ahead < 90 ? 0 : car.targetSpeed;
    car.speed += clamp(want - car.speed, -500 * dt, 260 * dt);
    if (car.road === 'v') car.y += car.dir * car.speed * dt;
    else car.x += car.dir * car.speed * dt;

    // At an intersection, mostly go straight, sometimes turn.
    const axis = car.road === 'v' ? car.y : car.x;
    const cross = car.road === 'v' ? ROADS.horizontal : ROADS.vertical;
    for (let i = 0; i < cross.length; i += 1) {
      if (Math.abs(axis - cross[i]) < 6 && car.speed > 40) {
        const roll = random();
        if (roll < 0.62) break; // straight on
        if (roll < 0.92) {
          // Turn onto the crossing road.
          const turnDir = random.chance(0.5) ? 1 : -1;
          if (car.road === 'v') {
            car.road = 'h';
            car.roadIndex = i;
            car.dir = turnDir;
            car.y = cross[i] + (turnDir === 1 ? 28 : -28);
            car.angle = turnDir === 1 ? 0 : Math.PI;
          } else {
            car.road = 'v';
            car.roadIndex = i;
            car.dir = turnDir;
            car.x = cross[i] + (turnDir === 1 ? -28 : 28);
            car.angle = turnDir === 1 ? Math.PI / 2 : -Math.PI / 2;
          }
        } else {
          car.dir *= -1; // rare U-turn
          car.angle += Math.PI;
        }
        break;
      }
    }
    // Keep the heading matching the road, and bounce off the world edge.
    if (car.road === 'v') car.angle = car.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
    else car.angle = car.dir === 1 ? 0 : Math.PI;
    if (car.x < 80 || car.x > WORLD.width - 80 || car.y < 80 || car.y > WORLD.height - 80) {
      car.dir *= -1;
    }
  }

  function stepPoliceCar(car, dt) {
    const px = player.inCar ? player.car.x : player.x;
    const py = player.inCar ? player.car.y : player.y;
    // Re-plan only when the route is done or the player has moved a long way from
    // where the route ends: re-planning mid-turn makes the car double back to the
    // intersection it just left and grind against the corner building forever.
    car.replanT -= dt;
    const moved = car.routeTarget ? Math.sqrt(dist2(px, py, car.routeTarget.x, car.routeTarget.y)) : Infinity;
    if (!car.route || car.route.length === 0 || moved > 500) {
      car.route = planRoute(car, { x: px, y: py });
      car.routeTarget = { x: px, y: py };
      car.replanT = 1.2;
    }
    const target = car.route[0];
    const d = Math.sqrt(dist2(car.x, car.y, target.x, target.y));
    if (d < 80) car.route.shift();
    const wantAngle = Math.atan2(target.y - car.y, target.x - car.x);
    const diff = angleDiff(wantAngle, car.angle);
    car.angle += clamp(diff, -3.2 * dt, 3.2 * dt);
    // Slow down for a turn: at full speed the turning circle is wider than the road
    // and the car would grind along the buildings instead of chasing.
    const close = Math.sqrt(dist2(car.x, car.y, px, py));
    const wantSpeed = Math.abs(diff) > 0.9 ? 260 : close < 260 ? POLICE.carSpeed : POLICE.carSpeed * 0.85;
    car.speed += clamp(wantSpeed - car.speed, -600 * dt, POLICE.carAccel * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const body = { x: car.x, y: car.y, r: 18 };
    if (collideBuildings(body)) {
      car.x = body.x;
      car.y = body.y;
      car.speed *= 0.6;
      car.replanT = 0;
    }
    car.x = clamp(car.x, 40, WORLD.width - 40);
    car.y = clamp(car.y, 40, WORLD.height - 40);
    // Ram the player's car: a hard hit damages it. Keep the reference first: the hit
    // can wreck the car, and wrecking clears player.car.
    if (player.inCar && player.car && dist2(car.x, car.y, player.car.x, player.car.y) < 46 * 46) {
      car.ramT -= dt;
      if (car.ramT <= 0 && car.speed > 120) {
        car.ramT = 0.8;
        const target = player.car;
        damageCar(target, 8, car.x, car.y);
        spawnParticles(target.x, target.y, 8, '#ffd166', 200, 0.4, 4);
        api.events |= EVENT_CRASH;
      }
    }
  }

  function stepPed(ped, dt, danger) {
    if (ped.state === 'down') {
      ped.stateT -= dt;
      if (ped.stateT <= 0) {
        ped.state = 'flee';
        ped.stateT = PED.fleeTime;
      }
      return;
    }
    if (danger && dist2(ped.x, ped.y, danger.x, danger.y) < PED.fleeRadius * PED.fleeRadius) {
      ped.state = 'flee';
      ped.stateT = PED.fleeTime;
    }
    if (ped.state === 'flee') {
      ped.stateT -= dt;
      if (ped.stateT <= 0) ped.state = 'walk';
      const a = danger ? Math.atan2(ped.y - danger.y, ped.x - danger.x) : ped.angle;
      ped.angle = a;
      ped.x += Math.cos(a) * PED.fleeSpeed * dt;
      ped.y += Math.sin(a) * PED.fleeSpeed * dt;
    } else {
      // Walk along a sidewalk; at a road crossing, sometimes switch sidewalks.
      if (ped.axis === 'v') ped.y += ped.dir * PED.walkSpeed * dt;
      else ped.x += ped.dir * PED.walkSpeed * dt;
      if (random.chance(0.002)) {
        ped.dir *= -1;
      }
      if (ped.x < 120 || ped.x > WORLD.width - 120 || ped.y < 120 || ped.y > WORLD.height - 120) {
        ped.dir *= -1;
      }
    }
    const body = { x: ped.x, y: ped.y, r: ped.r };
    if (collideBuildings(body)) {
      ped.x = body.x;
      ped.y = body.y;
      ped.dir *= -1;
    }
    ped.x = clamp(ped.x, 60, WORLD.width - 60);
    ped.y = clamp(ped.y, 60, WORLD.height - 60);
  }

  function stepCop(cop, dt) {
    if (cop.downT > 0) {
      cop.downT -= dt;
      return;
    }
    const px = player.inCar ? player.car.x : player.x;
    const py = player.inCar ? player.car.y : player.y;
    cop.angle = Math.atan2(py - cop.y, px - cop.x);
    cop.x += Math.cos(cop.angle) * POLICE.footSpeed * dt;
    cop.y += Math.sin(cop.angle) * POLICE.footSpeed * dt;
    const body = { x: cop.x, y: cop.y, r: cop.r };
    if (collideBuildings(body)) {
      cop.x = body.x;
      cop.y = body.y;
    }
  }

  function stepBullets(dt) {
    for (const bullet of bullets) {
      if (!bullet.active) continue;
      bullet.life -= dt;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.life <= 0 || bullet.x < 0 || bullet.x > WORLD.width || bullet.y < 0 || bullet.y > WORLD.height) {
        bullet.active = false;
        continue;
      }
      let hit = false;
      for (const b of buildings) {
        if (bullet.x > b.x && bullet.x < b.x + b.w && bullet.y > b.y && bullet.y < b.y + b.h) {
          spawnParticles(bullet.x, bullet.y, 5, '#ffd166', 160, 0.3, 3);
          hit = true;
          break;
        }
      }
      if (hit) {
        bullet.active = false;
        continue;
      }
      for (const ped of peds) {
        if (ped.state !== 'down' && dist2(bullet.x, bullet.y, ped.x, ped.y) < 18 * 18) {
          ped.state = 'down';
          ped.stateT = 6;
          spawnParticles(ped.x, ped.y, 10, '#e8e4d8', 180, 0.5, 4);
          addCrime(WANTED.hitPed);
          bullet.active = false;
          hit = true;
          break;
        }
      }
      if (hit) continue;
      for (const cop of cops) {
        if (cop.downT <= 0 && dist2(bullet.x, bullet.y, cop.x, cop.y) < 20 * 20) {
          cop.health -= 34;
          spawnParticles(cop.x, cop.y, 8, '#3b82ff', 180, 0.4, 4);
          if (cop.health <= 0) {
            cop.downT = 8;
            addCrime(WANTED.hitPed);
          }
          bullet.active = false;
          hit = true;
          break;
        }
      }
      if (hit) continue;
      for (const car of cars) {
        if (car === player.car || car.wrecked) continue;
        if (dist2(bullet.x, bullet.y, car.x, car.y) < 26 * 26) {
          damageCar(car, 10, bullet.x, bullet.y);
          spawnParticles(bullet.x, bullet.y, 6, '#ffd166', 160, 0.3, 3);
          bullet.active = false;
          break;
        }
      }
    }
  }

  function stepParticles(dt) {
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.2 * dt;
      p.vy *= 1 - 2.2 * dt;
    }
  }

  function stepPickups(dt) {
    for (const pickup of pickups) {
      if (!pickup.active) {
        pickup.respawnT -= dt;
        if (pickup.respawnT <= 0) pickup.active = true;
        continue;
      }
      const d2 = dist2(pickup.x, pickup.y, player.x, player.y);
      const inCarD2 = player.inCar && player.car ? dist2(pickup.x, pickup.y, player.car.x, player.car.y) : Infinity;
      if (d2 < 34 * 34 || inCarD2 < 40 * 40) {
        pickup.active = false;
        pickup.respawnT = 45;
        if (pickup.kind === 'ammo') {
          player.ammo = Math.min(PLAYER.maxAmmo, player.ammo + 12);
        } else if (pickup.kind === 'health') {
          player.health = PLAYER.health;
        } else {
          player.money += 75;
          state.earned += 75;
        }
        spawnParticles(pickup.x, pickup.y, 12, '#7ee787', 160, 0.6, 4);
        api.events |= EVENT_PICKUP;
      }
    }
  }

  // ---- the player ----------------------------------------------------------
  function nearestCar(maxD) {
    let best = null;
    let bestD = maxD * maxD;
    for (const car of cars) {
      if (car.wrecked || car === player.car) continue;
      const d = dist2(player.x, player.y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar() {
    const car = nearestCar(70);
    if (!car) return false;
    if (car.kind !== 'player') addCrime(WANTED.stealCar);
    car.kind = 'player';
    car.driver = 'player';
    player.inCar = true;
    player.car = car;
    player.x = car.x;
    player.y = car.y;
    return true;
  }

  function exitCar() {
    const car = player.car;
    if (!car) return;
    player.inCar = false;
    player.car = null;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 44;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 44;
    player.angle = car.angle;
    const body = { x: player.x, y: player.y, r: player.r };
    if (collideBuildings(body)) {
      player.x = body.x;
      player.y = body.y;
    }
    car.driver = 'none';
    car.speed *= 0.4;
  }

  function stepPlayerOnFoot(dt, dir, controls) {
    player.speed = dir.x === 0 && dir.y === 0 ? 0 : PLAYER.walkSpeed;
    player.x += dir.x * PLAYER.walkSpeed * dt;
    player.y += dir.y * PLAYER.walkSpeed * dt;
    if (dir.x !== 0 || dir.y !== 0) player.angle = Math.atan2(dir.y, dir.x);
    const body = { x: player.x, y: player.y, r: player.r };
    if (collideBuildings(body)) {
      player.x = body.x;
      player.y = body.y;
    }
    player.x = clamp(player.x, 30, WORLD.width - 30);
    player.y = clamp(player.y, 30, WORLD.height - 30);
    // Run over by a moving car: it hurts, and the driver does not pay for it.
    for (const car of cars) {
      if (car.wrecked || car.speed < 150) continue;
      if (dist2(player.x, player.y, car.x, car.y) < 30 * 30) {
        if (player.invuln <= 0) {
          player.health -= 20;
          player.invuln = 0.8;
          api.events |= EVENT_HIT;
          spawnParticles(player.x, player.y, 10, '#ff6b81', 200, 0.5, 4);
          state.shake = 0.4;
        }
      }
    }
    if (controls.enter) enterCar();
    if (controls.punch && player.punchT <= 0) {
      player.punchT = PLAYER.punchCooldown;
      const fx = player.x + Math.cos(player.angle) * PLAYER.punchRange;
      const fy = player.y + Math.sin(player.angle) * PLAYER.punchRange;
      let landed = false;
      for (const ped of peds) {
        if (ped.state !== 'down' && dist2(fx, fy, ped.x, ped.y) < 26 * 26) {
          ped.state = 'down';
          ped.stateT = 5;
          addCrime(WANTED.punchPed);
          landed = true;
          break;
        }
      }
      if (!landed) {
        for (const cop of cops) {
          if (cop.downT <= 0 && dist2(fx, fy, cop.x, cop.y) < 28 * 28) {
            cop.health -= PLAYER.punchDamage;
            if (cop.health <= 0) cop.downT = 8;
            addCrime(WANTED.punchPed);
            landed = true;
            break;
          }
        }
      }
      if (landed) {
        api.events |= EVENT_PUNCH;
        spawnParticles(fx, fy, 8, '#ffd166', 180, 0.35, 4);
      }
    }
    if (controls.shoot && player.shootT <= 0 && player.ammo > 0) {
      player.shootT = PLAYER.shootCooldown;
      player.ammo -= 1;
      const aim = Math.atan2(controls.aimY - player.y, controls.aimX - player.x);
      player.angle = aim;
      const bullet = bullets.find((b) => !b.active);
      if (bullet) {
        bullet.active = true;
        bullet.x = player.x + Math.cos(aim) * 22;
        bullet.y = player.y + Math.sin(aim) * 22;
        bullet.vx = Math.cos(aim) * 900;
        bullet.vy = Math.sin(aim) * 900;
        bullet.life = 1.1;
      }
      addCrime(WANTED.shoot);
      api.events |= EVENT_SHOT;
      spawnParticles(player.x + Math.cos(aim) * 24, player.y + Math.sin(aim) * 24, 4, '#ffe66d', 240, 0.15, 3);
      state.shake = Math.max(state.shake, 0.12);
    }
  }

  function stepPlayerCar(dt, dir) {
    const car = player.car;
    if (!car || car.wrecked) {
      player.inCar = false;
      player.car = null;
      return;
    }
    const throttle = -dir.y; // up is forward
    const onSand = car.x > BEACH.sandX;
    const onRoad = onAsphalt(car.x, car.y) || onSidewalk(car.x, car.y);
    const top = CAR.maxSpeed * (onSand ? 0.5 : onRoad ? 1 : 0.72);
    if (throttle > 0) car.speed = Math.min(top, car.speed + CAR.accel * dt);
    else if (throttle < 0) {
      if (car.speed > 0) car.speed = Math.max(0, car.speed - CAR.brake * dt);
      else car.speed = Math.max(-CAR.maxReverse, car.speed - CAR.reverseAccel * dt);
    } else {
      const drag = 320 * dt;
      car.speed = Math.abs(car.speed) <= drag ? 0 : car.speed - Math.sign(car.speed) * drag;
    }
    const steerAuthority = car.speed === 0 ? 0 : clamp(0.5 + Math.abs(car.speed) / 300, 0, 1);
    car.angle += dir.x * CAR.steer * steerAuthority * dt * (car.speed >= 0 ? 1 : -1);
    const beforeX = car.x;
    const beforeY = car.y;
    const beforeSpeed = car.speed;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const body = { x: car.x, y: car.y, r: 18 };
    if (collideBuildings(body)) {
      car.x = body.x;
      car.y = body.y;
      if (Math.abs(beforeSpeed) > 300) {
        damageCar(car, 12, beforeX, beforeY);
        spawnParticles(car.x, car.y, 12, '#ffd166', 240, 0.5, 5);
        api.events |= EVENT_CRASH;
        state.shake = 0.35;
      }
      car.speed *= 0.45;
    }
    car.x = clamp(car.x, 30, WORLD.width - 30);
    car.y = clamp(car.y, 30, WORLD.height - 30);
    // Dust when pushing hard, smoke when the car is dying.
    if (Math.abs(car.speed) > 380 && random.chance(0.35)) {
      const p = freeParticle();
      if (p) {
        p.active = true;
        p.x = car.x - Math.cos(car.angle) * 26;
        p.y = car.y - Math.sin(car.angle) * 26;
        p.vx = -Math.cos(car.angle) * 40 + random.range(-30, 30);
        p.vy = -Math.sin(car.angle) * 40 + random.range(-30, 30);
        p.life = 0.5;
        p.max = 0.5;
        p.size = 5;
        p.color = onSand ? '#c9a86a' : '#5a5f6e';
      }
    }
    if (car.health < 35 && random.chance(0.3)) {
      spawnParticles(car.x, car.y - 10, 1, '#3a3f4d', 40, 1.2, 9);
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.speed = car.speed;
    // Run a pedestrian over: the law notices.
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      if (dist2(car.x, car.y, ped.x, ped.y) < 30 * 30 && Math.abs(car.speed) > 120) {
        ped.state = 'down';
        ped.stateT = 7;
        addCrime(WANTED.hitPed);
        spawnParticles(ped.x, ped.y, 10, '#e8e4d8', 200, 0.5, 4);
        state.shake = 0.3;
      }
    }
    // Bump traffic cars out of the way.
    for (const other of cars) {
      if (other === car || other.wrecked) continue;
      const d2 = dist2(car.x, car.y, other.x, other.y);
      if (d2 < 44 * 44 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (44 - d) / 2;
        const nx = (other.x - car.x) / d;
        const ny = (other.y - car.y) / d;
        other.x += nx * push;
        other.y += ny * push;
        car.x -= nx * push;
        car.y -= ny * push;
        if (Math.abs(car.speed) > 260) {
          damageCar(other, 8, car.x, car.y);
          damageCar(car, 4, other.x, other.y);
          api.events |= EVENT_CRASH;
        }
        other.speed *= 0.6;
        car.speed *= 0.85;
      }
    }
  }

  // ---- public API ----------------------------------------------------------
  function reset() {
    player.x = PLACES.playerStart.x;
    player.y = PLACES.playerStart.y;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.health;
    player.money = 0;
    player.ammo = PLAYER.startAmmo;
    player.inCar = false;
    player.car = null;
    player.punchT = 0;
    player.shootT = 0;
    player.invuln = 0;
    player.speed = 0;
    cars.length = 0;
    peds.length = 0;
    cops.length = 0;
    for (const bullet of bullets) bullet.active = false;
    for (const p of particles) p.active = false;
    for (const pickup of pickups) {
      pickup.active = true;
      pickup.respawnT = 0;
    }
    state.wanted = 0;
    state.crimeT = 0;
    state.decayT = 0;
    state.bustT = 0;
    state.earned = 0;
    state.time = 0;
    state.shake = 0;
    state.busted = false;
    state.wasted = false;
    state.missions = createMissions();
    startMission(state.missions, 0);
    // The player's own ride, parked by Mara's office, and the morning traffic.
    const mine = addCar('player', PLACES.playerCar.x, PLACES.playerCar.y, PLACES.playerCar.angle, '#ff5d8f');
    mine.driver = 'none';
    spawnTraffic();
    for (let i = 0; i < PED.count; i += 1) {
      const vertical = random.chance(0.5);
      if (vertical) {
        const cx = random.pick(ROADS.vertical);
        addPed(cx + (random.chance(0.5) ? -73 : 73), random.range(150, WORLD.height - 150));
      } else {
        const cy = random.pick(ROADS.horizontal);
        addPed(random.range(150, WORLD.width - 150), cy + (random.chance(0.5) ? -73 : 73));
      }
      const ped = peds[peds.length - 1];
      ped.axis = vertical ? 'v' : 'h';
      ped.line = vertical ? ped.x : ped.y;
      ped.dir = random.chance(0.5) ? 1 : -1;
    }
  }

  /**
   * One fixed step. `controls` is { dir: {x, y}, enter, punch, shoot, aimX, aimY } or
   * null (the title screen's backdrop: traffic and pedestrians move, nothing else).
   * With `harmless` set, nothing can hurt the player and no crime is recorded.
   */
  function step(dt, controls, harmless) {
    api.events = 0;
    state.time += dt;
    if (state.crimeT > 0) state.crimeT -= dt;
    if (player.punchT > 0) player.punchT -= dt;
    if (player.shootT > 0) player.shootT -= dt;
    if (player.invuln > 0) player.invuln -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);

    // Wanted: more cops while the heat is on, a slow cool-down when nobody is near.
    if (!harmless) {
      const wantCars = policeTargetCount();
      if (policeCars() < wantCars) spawnPolice(wantCars - policeCars());
      if (state.wanted >= POLICE.footFromLevel && !player.inCar && cops.filter((c) => c.downT <= 0).length < Math.min(4, state.wanted - 1)) {
        const spot = roadPointNear(player.x, player.y, 300, 500);
        addCop(spot.x, spot.y);
      }
      if (state.wanted > 0) {
        if (nearestCopDist() > POLICE.sightRange) {
          state.decayT += dt;
          if (state.decayT > POLICE.decayDelay) {
            state.wanted -= 1;
            state.decayT = 0;
          }
        } else {
          state.decayT = 0;
        }
      }
      if (state.wanted === 0) {
        for (let i = cars.length - 1; i >= 0; i -= 1) {
          const car = cars[i];
          if (car.kind === 'police' && Math.sqrt(dist2(car.x, car.y, player.x, player.y)) > 1300) cars.splice(i, 1);
        }
        cops.length = 0;
        state.bustT = 0;
      }
    }

    // The player.
    if (!harmless && controls) {
      if (player.inCar) {
        stepPlayerCar(dt, controls.dir);
        if (controls.enter) exitCar();
      } else {
        stepPlayerOnFoot(dt, controls.dir, controls);
      }
      if (player.health <= 0 && !state.wasted) {
        state.wasted = true;
        player.money = Math.floor(player.money * (1 - WASTED_LOSS));
        api.events |= EVENT_WASTED;
        respawn();
      }
      if (player.health < PLAYER.health && state.wanted === 0) {
        player.health = Math.min(PLAYER.health, player.health + 4 * dt);
      }
    }

    // Traffic, police, pedestrians, foot cops.
    for (const car of cars) {
      if (car.wrecked || car.driver === 'player') continue;
      if (car.kind === 'traffic') stepTrafficCar(car, dt);
      else if (car.kind === 'police') stepPoliceCar(car, dt);
    }
    const danger = api.events & (EVENT_SHOT | EVENT_CRASH) ? { x: player.x, y: player.y } : null;
    for (const ped of peds) stepPed(ped, dt, danger);
    for (const cop of cops) stepCop(cop, dt);

    // Busted: a foot cop close enough for long enough, or a police car pinning the ride.
    if (!harmless && !state.busted) {
      let closing = false;
      if (!player.inCar) {
        for (const cop of cops) {
          if (cop.downT <= 0 && dist2(cop.x, cop.y, player.x, player.y) < POLICE.bustRange * POLICE.bustRange) {
            closing = true;
            break;
          }
        }
      } else if (player.car) {
        for (const car of cars) {
          if (car.kind === 'police' && !car.wrecked && Math.abs(player.car.speed) < 60 && dist2(car.x, car.y, player.car.x, player.car.y) < 52 * 52) {
            closing = true;
            break;
          }
        }
      }
      if (closing) {
        state.bustT += dt;
        if (state.bustT > POLICE.bustTime) {
          state.busted = true;
          player.money = Math.floor(player.money * (1 - BUSTED_LOSS));
          api.events |= EVENT_BUSTED;
          respawn();
        }
      } else {
        state.bustT = 0;
      }
    }

    stepBullets(dt);
    stepParticles(dt);
    stepPickups(dt);
    if (!harmless) updateMissions(state.missions, api, dt);
    return api.events;
  }

  function clearEnd() {
    state.busted = false;
    state.wasted = false;
  }

  const api = {
    state,
    events: 0,
    reset,
    step,
    clearEnd,
    setWanted,
    spawnPolice,
    planRoute,
    nearestIntersection,
    nearestCar,
    enterCar,
    exitCar,
    currentMission: () => currentMission(state.missions),
    missionsForSave: () => missionsForSave(state.missions),
    restoreMissions: (saved) => restoreMissions(state.missions, saved),
  };

  reset();
  return api;
}
