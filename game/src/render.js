// Drawing only: the world's state and the current screen in, pixels out. The camera follows
// the player (or the car) across the 3200x2400 city and the 1280x720 view is scaled to fit
// the window, the margin filled with the backdrop colour. Flat shapes and canvas text only:
// roads, neon-signed buildings, the beach and boardwalk, cars, pedestrians, police, the HUD
// with its minimap, and the title, pause and busted panels.

import { BEACH, FONT, PALETTE, PLAYER, ROADS, VIEW, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

/** The minimap's panel, in logical view pixels. */
const MINIMAP = { x: VIEW.width - 248, y: 16, w: 232, h: 174 };

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const camera = { x: 1500, y: 850 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  /** Client pixels (a mouse event) to world coordinates, through the current camera. */
  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * canvas.width;
    const py = ((clientY - rect.top) / rect.height) * canvas.height;
    const lx = (px - view.x) / view.scale;
    const ly = (py - view.y) / view.scale;
    return { x: lx - VIEW.width / 2 + camera.x, y: ly - VIEW.height / 2 + camera.y };
  }

  function drawGround(state) {
    context.fillStyle = PALETTE.grass;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    // The beach and the water on the east edge, with slow waves.
    context.fillStyle = PALETTE.sand;
    context.fillRect(BEACH.sandX, 0, WORLD.width - BEACH.sandX, WORLD.height);
    context.fillStyle = PALETTE.water;
    context.fillRect(BEACH.waterX, 0, WORLD.width - BEACH.waterX, WORLD.height);
    context.strokeStyle = 'rgba(255,255,255,0.35)';
    context.lineWidth = 3;
    for (let i = 0; i < 3; i += 1) {
      const wx = BEACH.waterX + 18 + i * 34 + Math.sin(state.time * 0.9 + i * 2.1) * 8;
      context.beginPath();
      context.moveTo(wx, 0);
      context.lineTo(wx, WORLD.height);
      context.stroke();
    }
    // The boardwalk: planks between the coastal road and the sand.
    context.fillStyle = PALETTE.boardwalk;
    context.fillRect(BEACH.boardwalkX, 0, BEACH.sandX - BEACH.boardwalkX, WORLD.height);
    context.strokeStyle = 'rgba(0,0,0,0.25)';
    context.lineWidth = 2;
    for (let y = 0; y < WORLD.height; y += 46) {
      context.beginPath();
      context.moveTo(BEACH.boardwalkX, y);
      context.lineTo(BEACH.sandX, y);
      context.stroke();
    }
  }

  function drawRoads() {
    for (const cx of ROADS.vertical) {
      context.fillStyle = PALETTE.sidewalk;
      context.fillRect(cx - ROADS.width / 2 - ROADS.sidewalk, 0, ROADS.sidewalk, WORLD.height);
      context.fillRect(cx + ROADS.width / 2, 0, ROADS.sidewalk, WORLD.height);
      context.fillStyle = PALETTE.road;
      context.fillRect(cx - ROADS.width / 2, 0, ROADS.width, WORLD.height);
      context.fillStyle = PALETTE.roadLine;
      for (let y = 20; y < WORLD.height; y += 80) context.fillRect(cx - 3, y, 6, 40);
    }
    for (const cy of ROADS.horizontal) {
      context.fillStyle = PALETTE.sidewalk;
      context.fillRect(0, cy - ROADS.width / 2 - ROADS.sidewalk, WORLD.width, ROADS.sidewalk);
      context.fillRect(0, cy + ROADS.width / 2, WORLD.width, ROADS.sidewalk);
      context.fillStyle = PALETTE.road;
      context.fillRect(0, cy - ROADS.width / 2, WORLD.width, ROADS.width);
      context.fillStyle = PALETTE.roadLine;
      for (let x = 20; x < WORLD.width; x += 80) context.fillRect(x, cy - 3, 40, 6);
    }
  }

  function drawBuildings(state) {
    for (const b of state.buildings) {
      if (b.tall) {
        context.fillStyle = 'rgba(0,0,0,0.35)';
        context.fillRect(b.x + 12, b.y + 16, b.w, b.h);
      }
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.strokeStyle = PALETTE.buildingEdge;
      context.lineWidth = 3;
      context.strokeRect(b.x, b.y, b.w, b.h);
      // Rooftop windows: a cheap grid that reads as a lit building.
      context.fillStyle = 'rgba(255,220,120,0.28)';
      for (let wy = b.y + 14; wy < b.y + b.h - 10; wy += 26) {
        for (let wx = b.x + 14; wx < b.x + b.w - 10; wx += 26) {
          if ((wx + wy) % 52 === 0) context.fillRect(wx, wy, 12, 8);
        }
      }
      if (b.sign) {
        context.fillStyle = b.sign;
        context.fillRect(b.x + b.w / 2 - 34, b.y - 8, 68, 14);
        if (b.name) text(b.name, b.x + b.w / 2, b.y + 3, 11, '#0d0a1a', 'center', 'middle');
      }
    }
    // Palm trees along the boardwalk.
    for (const palm of state.palms) {
      context.strokeStyle = '#5a4632';
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(palm.x, palm.y);
      context.lineTo(palm.x + 4, palm.y - 16);
      context.stroke();
      context.fillStyle = '#2e7d4f';
      context.beginPath();
      context.arc(palm.x + 4, palm.y - 20, 12, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawCar(car, time) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    if (car.wrecked) {
      context.fillStyle = '#1c1e26';
      context.fillRect(-27, -13, 54, 26);
      context.fillStyle = '#3a3f4d';
      context.fillRect(-10, -10, 20, 20);
      context.restore();
      return;
    }
    // Shadow, then the body, the cabin and the lights.
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.fillRect(-25, -11, 54, 26);
    context.fillStyle = car.color;
    context.fillRect(-27, -13, 54, 26);
    context.fillStyle = 'rgba(255,255,255,0.75)';
    context.fillRect(-6, -11, 16, 22);
    context.fillStyle = '#ffe9a8';
    context.fillRect(24, -11, 3, 6);
    context.fillRect(24, 5, 3, 6);
    context.fillStyle = '#e5534b';
    context.fillRect(-27, -11, 3, 6);
    context.fillRect(-27, 5, 3, 6);
    if (car.kind === 'police') {
      context.fillStyle = '#f5f5f5';
      context.fillRect(-8, -13, 16, 26);
      const flash = Math.floor(time * 4) % 2 === 0;
      context.fillStyle = flash ? PALETTE.policeLight : PALETTE.policeLight2;
      context.fillRect(-2, -15, 5, 5);
      context.fillStyle = flash ? PALETTE.policeLight2 : PALETTE.policeLight;
      context.fillRect(-2, 10, 5, 5);
    }
    if (car.kind === 'player') {
      context.fillStyle = 'rgba(255,255,255,0.85)';
      context.fillRect(-27, -2, 54, 4);
    }
    context.restore();
  }

  function drawPed(ped) {
    if (ped.state === 'down') {
      context.fillStyle = '#8b93a3';
      context.beginPath();
      context.ellipse(ped.x, ped.y, 14, 7, ped.angle, 0, Math.PI * 2);
      context.fill();
      return;
    }
    context.fillStyle = ped.color;
    context.beginPath();
    context.arc(ped.x, ped.y, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(ped.x + Math.cos(ped.angle) * 3, ped.y + Math.sin(ped.angle) * 3, 5, 0, Math.PI * 2);
    context.fill();
  }

  function drawCop(cop, time) {
    if (cop.downT > 0) {
      context.fillStyle = '#3b82ff';
      context.beginPath();
      context.ellipse(cop.x, cop.y, 14, 7, cop.angle, 0, Math.PI * 2);
      context.fill();
      return;
    }
    context.fillStyle = '#1d3a8a';
    context.beginPath();
    context.arc(cop.x, cop.y, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ffd166';
    context.beginPath();
    context.arc(cop.x, cop.y, 3, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#1d3a8a';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(cop.x + Math.cos(cop.angle) * 10, cop.y + Math.sin(cop.angle) * 10);
    context.lineTo(cop.x + Math.cos(cop.angle) * 20, cop.y + Math.sin(cop.angle) * 20);
    context.stroke();
    if (Math.floor(time * 4) % 2 === 0) {
      context.fillStyle = PALETTE.policeLight;
      context.beginPath();
      context.arc(cop.x, cop.y - 13, 3, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPlayer(state) {
    const player = state.player;
    if (player.inCar) return;
    const blink = player.invuln > 0 && Math.floor(player.invuln * 10) % 2 === 0;
    if (blink) return;
    context.save();
    context.translate(player.x, player.y);
    context.rotate(player.angle);
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(0, 0, 13, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#0d0a1a';
    context.beginPath();
    context.moveTo(18, 0);
    context.lineTo(6, -7);
    context.lineTo(6, 7);
    context.closePath();
    context.fill();
    if (player.ammo > 0) {
      context.strokeStyle = '#3a3f4d';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(10, 0);
      context.lineTo(24, 0);
      context.stroke();
    }
    if (player.punchT > PLAYER.punchCooldown - 0.18) {
      context.strokeStyle = PALETTE.neonYellow;
      context.lineWidth = 4;
      context.beginPath();
      context.arc(26, 0, 9, -0.9, 0.9);
      context.stroke();
    }
    context.restore();
  }

  function drawPickups(state) {
    for (const pickup of state.pickups) {
      if (!pickup.active) continue;
      const bob = Math.sin(state.time * 3 + pickup.x) * 3;
      const y = pickup.y + bob;
      if (pickup.kind === 'ammo') {
        context.fillStyle = PALETTE.ammo;
        context.fillRect(pickup.x - 11, y - 8, 22, 16);
        context.fillStyle = '#0d0a1a';
        context.fillRect(pickup.x - 3, y - 5, 6, 10);
      } else if (pickup.kind === 'health') {
        context.fillStyle = '#f5f5f5';
        context.fillRect(pickup.x - 11, y - 11, 22, 22);
        context.fillStyle = PALETTE.health;
        context.fillRect(pickup.x - 3, y - 8, 6, 16);
        context.fillRect(pickup.x - 8, y - 3, 16, 6);
      } else {
        context.fillStyle = PALETTE.cash;
        context.fillRect(pickup.x - 12, y - 8, 24, 16);
        context.fillStyle = '#0d5c2e';
        text('$', pickup.x, y + 5, 13, '#0d5c2e', 'center', 'middle');
      }
    }
  }

  function drawMarker(state) {
    const marker = state.missions.marker;
    if (!marker) return;
    const pulse = 1 + Math.sin(state.time * 4) * 0.18;
    context.save();
    context.translate(marker.x, marker.y);
    context.rotate(Math.PI / 4);
    context.fillStyle = PALETTE.neonYellow;
    context.fillRect(-11 * pulse, -11 * pulse, 22 * pulse, 22 * pulse);
    context.fillStyle = '#0d0a1a';
    context.fillRect(-6 * pulse, -6 * pulse, 12 * pulse, 12 * pulse);
    context.restore();
    context.strokeStyle = 'rgba(250,204,21,0.5)';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(marker.x, marker.y, 26 + Math.sin(state.time * 4) * 8, 0, Math.PI * 2);
    context.stroke();
    // A beacon the player can see from far away.
    context.fillStyle = 'rgba(250,204,21,0.08)';
    context.fillRect(marker.x - 3, marker.y - 260, 6, 260);
  }

  function drawMarkerArrow(state) {
    const marker = state.missions.marker;
    if (!marker) return;
    const dx = marker.x - camera.x;
    const dy = marker.y - camera.y;
    if (Math.abs(dx) < VIEW.width / 2 - 60 && Math.abs(dy) < VIEW.height / 2 - 60) return;
    const angle = Math.atan2(dy, dx);
    const ax = VIEW.width / 2 + Math.cos(angle) * (VIEW.width / 2 - 46);
    const ay = VIEW.height / 2 + Math.sin(angle) * (VIEW.height / 2 - 46);
    context.save();
    context.translate(ax, ay);
    context.rotate(angle);
    context.fillStyle = PALETTE.neonYellow;
    context.beginPath();
    context.moveTo(16, 0);
    context.lineTo(-10, -11);
    context.lineTo(-10, 11);
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawBullets(state) {
    context.strokeStyle = PALETTE.bullet;
    context.lineWidth = 3;
    for (const bullet of state.bullets) {
      if (!bullet.active) continue;
      context.beginPath();
      context.moveTo(bullet.x - bullet.vx * 0.02, bullet.y - bullet.vy * 0.02);
      context.lineTo(bullet.x, bullet.y);
      context.stroke();
    }
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      if (!p.active) continue;
      context.globalAlpha = clamp(p.life / p.max, 0, 1);
      context.fillStyle = p.color;
      context.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    context.globalAlpha = 1;
  }

  function drawMinimap(state) {
    const sx = MINIMAP.w / WORLD.width;
    const sy = MINIMAP.h / WORLD.height;
    context.fillStyle = 'rgba(13,10,26,0.85)';
    context.fillRect(MINIMAP.x, MINIMAP.y, MINIMAP.w, MINIMAP.h);
    context.strokeStyle = PALETTE.neonPurple;
    context.lineWidth = 2;
    context.strokeRect(MINIMAP.x, MINIMAP.y, MINIMAP.w, MINIMAP.h);
    const ox = MINIMAP.x;
    const oy = MINIMAP.y;
    context.fillStyle = '#c9a86a';
    context.fillRect(ox + BEACH.sandX * sx, oy, (WORLD.width - BEACH.sandX) * sx, MINIMAP.h);
    context.strokeStyle = '#4a4560';
    context.lineWidth = 1;
    for (const cx of ROADS.vertical) {
      context.beginPath();
      context.moveTo(ox + cx * sx, oy);
      context.lineTo(ox + cx * sx, oy + MINIMAP.h);
      context.stroke();
    }
    for (const cy of ROADS.horizontal) {
      context.beginPath();
      context.moveTo(ox, oy + cy * sy);
      context.lineTo(ox + MINIMAP.w, oy + cy * sy);
      context.stroke();
    }
    context.fillStyle = '#5a5470';
    for (const b of state.buildings) context.fillRect(ox + b.x * sx, oy + b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
    const marker = state.missions.marker;
    if (marker) {
      context.fillStyle = PALETTE.neonYellow;
      context.save();
      context.translate(ox + marker.x * sx, oy + marker.y * sy);
      context.rotate(Math.PI / 4);
      context.fillRect(-5, -5, 10, 10);
      context.restore();
    }
    context.fillStyle = '#9a94b8';
    for (const car of state.cars) {
      if (car.wrecked || car.driver === 'player') continue;
      context.fillRect(ox + car.x * sx - 2, oy + car.y * sy - 2, 4, 4);
    }
    const flash = Math.floor(state.time * 4) % 2 === 0;
    context.fillStyle = flash ? PALETTE.policeLight : PALETTE.policeLight2;
    for (const car of state.cars) {
      if (car.kind !== 'police' || car.wrecked) continue;
      context.fillRect(ox + car.x * sx - 2, oy + car.y * sy - 2, 4, 4);
    }
    for (const cop of state.cops) {
      if (cop.downT > 0) continue;
      context.fillRect(ox + cop.x * sx - 2, oy + cop.y * sy - 2, 4, 4);
    }
    const player = state.player;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.moveTo(ox + player.x * sx + 7, oy + player.y * sy);
    context.lineTo(ox + player.x * sx - 5, oy + player.y * sy - 5);
    context.lineTo(ox + player.x * sx - 5, oy + player.y * sy + 5);
    context.closePath();
    context.fill();
    // The camera's view, as a frame on the map.
    context.strokeStyle = 'rgba(255,255,255,0.5)';
    context.lineWidth = 1;
    context.strokeRect(
      ox + (camera.x - VIEW.width / 2) * sx,
      oy + (camera.y - VIEW.height / 2) * sy,
      VIEW.width * sx,
      VIEW.height * sy,
    );
    text('NEON BAY', MINIMAP.x + 6, MINIMAP.y + MINIMAP.h - 6, 11, PALETTE.muted, 'left', 'alphabetic');
  }

  function drawHud(state, muted) {
    const player = state.player;
    context.textBaseline = 'alphabetic';
    // Health bar and money, top left.
    context.fillStyle = 'rgba(13,10,26,0.7)';
    context.fillRect(16, 16, 240, 66);
    text('HP', 26, 40, 16, PALETTE.text, 'left');
    context.fillStyle = '#3a1520';
    context.fillRect(62, 28, 180, 16);
    context.fillStyle = player.health > 30 ? '#7ee787' : '#e5534b';
    context.fillRect(62, 28, 180 * clamp(player.health / 100, 0, 1), 16);
    text(`$${player.money}`, 26, 70, 22, PALETTE.cash, 'left');
    // Wanted stars, top centre.
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < state.wanted ? '★' : '☆';
    text(stars, VIEW.width / 2, 44, 34, state.wanted > 0 ? PALETTE.star : PALETTE.starEmpty, 'center');
    if (state.wanted > 0) text('WANTED', VIEW.width / 2, 66, 13, PALETTE.policeLight, 'center');
    // Objective, under the stars: left-aligned, clear of the health panel above it
    // and the minimap on the right.
    if (state.missions.objective) {
      text(state.missions.objective, 20, 108, 16, PALETTE.neonYellow, 'left');
    }
    // Ammo and ride, bottom left.
    text(player.inCar ? 'IN CAR — E to exit' : 'ON FOOT — E near a car to steal it', 20, VIEW.height - 44, 16, PALETTE.muted, 'left');
    text(`AMMO ${player.ammo}`, 20, VIEW.height - 20, 16, PALETTE.ammo, 'left');
    if (muted) text('MUTED — M to unmute', VIEW.width - 20, VIEW.height - 20, 14, PALETTE.muted, 'right');
    // Mission dialog, bottom centre.
    if (state.missions.dialog) {
      const lines = state.missions.dialog;
      const w = 760;
      const h = 34 + lines.length * 26;
      const x = (VIEW.width - w) / 2;
      const y = VIEW.height - h - 64;
      context.fillStyle = 'rgba(13,10,26,0.88)';
      context.fillRect(x, y, w, h);
      context.strokeStyle = PALETTE.neonCyan;
      context.lineWidth = 2;
      context.strokeRect(x, y, w, h);
      for (let i = 0; i < lines.length; i += 1) {
        text(lines[i], VIEW.width / 2, y + 34 + i * 26, 17, PALETTE.text, 'center');
      }
    }
    drawMinimap(state);
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 32;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = 'rgba(13,10,26,0.92)';
    context.fillRect(x, y, width, height);
    context.strokeStyle = accent || PALETTE.neonPink;
    context.lineWidth = 3;
    context.strokeRect(x, y, width, height);
    text(title, VIEW.width / 2, y + 74, 52, accent || PALETTE.neonPink, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.width / 2, y + 122 + i * 32, 20, PALETTE.muted, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 30, 20, PALETTE.neonYellow, 'center');
  }

  /** Paint one frame: the city through the camera, then the HUD or a panel for the screen. */
  function draw(state, screen, best, opts) {
    const options = opts || {};
    const target = options.camera || { x: state.player.x, y: state.player.y };
    camera.x = clamp(target.x, VIEW.width / 2, WORLD.width - VIEW.width / 2);
    camera.y = clamp(target.y, VIEW.height / 2, WORLD.height - VIEW.height / 2);
    const shake = state.shake > 0 ? state.shake * 14 : 0;
    const shX = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    const shY = shake > 0 ? (Math.random() - 0.5) * shake : 0;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const s = view.scale;
    context.setTransform(s, 0, 0, s, view.x + (VIEW.width / 2 - camera.x) * s + shX, view.y + (VIEW.height / 2 - camera.y) * s + shY);
    drawGround(state);
    drawRoads();
    drawBuildings(state);
    drawPickups(state);
    drawMarker(state);
    for (const car of state.cars) drawCar(car, state.time);
    for (const ped of state.peds) drawPed(ped);
    for (const cop of state.cops) drawCop(cop, state.time);
    drawPlayer(state);
    drawBullets(state);
    drawParticles(state);

    // Back to view space for the HUD and the panels.
    context.setTransform(s, 0, 0, s, view.x, view.y);
    drawMarkerArrow(state);
    if (screen === SCREEN_TITLE) {
      // The neon logo over the living city.
      context.fillStyle = 'rgba(13,10,26,0.45)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      text('NEON BAY', VIEW.width / 2 + 3, 178, 96, 'rgba(255,46,136,0.55)', 'center');
      text('NEON BAY', VIEW.width / 2, 174, 96, PALETTE.neonPink, 'center');
      text('A sun-soaked open-world crime story', VIEW.width / 2, 224, 22, PALETTE.neonCyan, 'center');
      const lines = [
        'WASD / arrows — walk and drive    E — steal / exit a car',
        'F — punch    Click — shoot    M — mute    P — pause',
        `Missions done: ${best.done}    Best cash: $${best.cash}`,
        options.hasSave ? 'A save is waiting — Continue picks up where you left off.' : 'No save yet — Start begins your first shift.',
      ];
      // A dim panel behind the controls, then the lines and the prompt.
      context.fillStyle = 'rgba(13,10,26,0.72)';
      context.fillRect(VIEW.width / 2 - 360, 268, 720, 150 + lines.length * 4);
      for (let i = 0; i < lines.length; i += 1) {
        text(lines[i], VIEW.width / 2, 306 + i * 30, 18, PALETTE.text, 'center');
      }
      text(options.hasSave ? 'Press Space or click — Continue' : 'Press Space or click — Start', VIEW.width / 2, 306 + lines.length * 30 + 20, 22, PALETTE.neonYellow, 'center');
      return;
    }
    drawHud(state, options.muted);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The city waits for no one. Except now.'], 'Press P to resume', PALETTE.neonCyan);
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', [`The Harbor Clinic patched you up.`, `You lost $${options.lost || 0} to the impound and the fine.`], 'Press Space to get back out there', PALETTE.policeLight2);
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', [`Neon Bay chewed you up.`, `You lost $${options.lost || 0} at the clinic.`], 'Press Space to get back out there', PALETTE.policeLight);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld };
}
