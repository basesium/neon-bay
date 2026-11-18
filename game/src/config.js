// Every tuning number and colour in one place. Neon Bay is a 3200x2400 top-down city;
// the camera follows the player and the renderer scales the 1280x720 view to the window,
// so no rule below depends on the screen size.

export const WORLD = { width: 3200, height: 2400 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The view the renderer paints, in logical pixels, before it is scaled to the window. */
export const VIEW = { width: 1280, height: 720 };

/** Road grid: vertical road centre x's, horizontal road centre y's, road and sidewalk widths. */
export const ROADS = {
  vertical: [300, 900, 1500, 2100, 2700],
  horizontal: [300, 850, 1400, 1950],
  width: 120,
  sidewalk: 26,
};

/** The beach strip on the east edge: sand starts here, water further east. */
export const BEACH = { sandX: 2920, waterX: 3100, boardwalkX: 2840 };

export const PLAYER = {
  radius: 14,
  walkSpeed: 230,
  runSpeed: 330,
  health: 100,
  punchRange: 34,
  punchDamage: 25,
  punchCooldown: 0.45,
  shootCooldown: 0.22,
  startAmmo: 12,
  maxAmmo: 60,
};

export const CAR = {
  length: 54,
  width: 26,
  accel: 520,
  brake: 760,
  reverseAccel: 320,
  maxSpeed: 640,
  maxReverse: 220,
  steer: 2.6,
  grip: 6.0,
  health: 100,
};

export const TRAFFIC = {
  count: 12,
  speed: 200,
  speedJitter: 60,
  colors: ['#e8b64c', '#4fc3f7', '#e5534b', '#9ccc65', '#ba68c8', '#f5f5f5', '#78909c'],
};

export const PED = {
  count: 22,
  walkSpeed: 70,
  fleeSpeed: 190,
  fleeRadius: 260,
  fleeTime: 3.5,
};

export const POLICE = {
  carSpeed: 560,
  carAccel: 480,
  footSpeed: 250,
  /** Wanted level at which foot cops join the chase. */
  footFromLevel: 2,
  /** How close a cop must get, for how long, to bust the player. */
  bustRange: 34,
  bustTime: 0.9,
  /** Seconds with no cop near before the wanted level drops one star. */
  decayDelay: 7,
  /** Distance under which the player counts as seen by the police. */
  sightRange: 720,
};

export const WANTED = {
  max: 5,
  stealCar: 1,
  hitPed: 1,
  punchPed: 1,
  shoot: 1,
  /** Seconds before the same crime can raise the wanted level again. */
  crimeCooldown: 4,
};

/** Cash the player loses when busted or wasted, as a share of what they carry. */
export const BUSTED_LOSS = 0.2;
export const WASTED_LOSS = 0.3;

/** Pickups: ammo boxes, health kits and cash drops scattered around the city. */
export const PICKUPS = [
  { kind: 'ammo', x: 900, y: 300 },
  { kind: 'ammo', x: 1500, y: 1950 },
  { kind: 'ammo', x: 2700, y: 1400 },
  { kind: 'health', x: 300, y: 850 },
  { kind: 'health', x: 2100, y: 300 },
  { kind: 'cash', x: 1500, y: 850 },
  { kind: 'cash', x: 900, y: 1950 },
  { kind: 'cash', x: 2700, y: 300 },
];

export const PALETTE = {
  backdrop: '#0d0a1a',
  grass: '#1d2b26',
  sand: '#c9a86a',
  water: '#1b4d6b',
  boardwalk: '#7a5a3a',
  road: '#23262f',
  roadLine: '#d8c25a',
  sidewalk: '#3a3e4d',
  buildingEdge: '#14121f',
  player: '#ffd166',
  playerCar: '#ff5d8f',
  policeCar: '#20242e',
  policeLight: '#ff3b30',
  policeLight2: '#3b82ff',
  ped: '#e8e4d8',
  bullet: '#ffe66d',
  cash: '#7ee787',
  health: '#ff6b81',
  ammo: '#ffd166',
  text: '#f2ede4',
  muted: '#9a94b8',
  panel: '#171224',
  neonPink: '#ff2e88',
  neonCyan: '#22d3ee',
  neonYellow: '#facc15',
  neonPurple: '#a78bfa',
  star: '#ffd166',
  starEmpty: '#4a4560',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save (money, missions, best) and the mute setting are kept between visits. */
export const SAVE_KEY = 'neon-bay.save.v1';
export const MUTE_KEY = 'neon-bay.muted.v1';

/** Fixed places in the city, by name: mission markers, respawn and the player's start. */
export const PLACES = {
  marasOffice: { x: 1100, y: 800, label: "Mara's Office" },
  docks: { x: 330, y: 2020, label: 'The Docks' },
  boardwalkCafe: { x: 2760, y: 850, label: 'Boardwalk Cafe' },
  alley: { x: 930, y: 1430, label: 'Back Alley' },
  lighthouse: { x: 3050, y: 2150, label: 'Lighthouse Point' },
  hospital: { x: 300, y: 300, label: 'Harbor Clinic' },
  playerStart: { x: 1100, y: 880 },
  playerCar: { x: 1150, y: 880, angle: 0 },
};
