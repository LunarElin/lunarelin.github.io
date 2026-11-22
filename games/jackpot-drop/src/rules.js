// src/rules.js — Jackpot Drop rules core. Copy verbatim.
var JD = window.JD || (window.JD = {});

JD.CFG = {
  W: 360, H: 640,
  EXIT_X: 352, EXIT_Y: 60, EXIT_VY: 0.5, POWER_MIN: 0.05, LAUNCH_TICKS: 12,
  PEG_R: 7, BUMPER_R: 14, PEG_BREAK_HITS: 2, PEG_HIT_CD: 6, PARK_SPEED: 1.0, PARK_TICKS: 20, IRON_FRICTION: 0.9,
  E_BALL: 0.9, E_PARKED: 0.3, BALL_HIT_MIN: 0.5, PARK_GRACE: 3, PARK_REACH: 2,
  ROWS: 12, ROW_Y0: 160, ROW_DY: 32, LAND_PAD: 84, FLIGHT_PER_ROW: 60,
  WARP_R: 13, WARP_CD: 30, WARP_CLEAR: 22, HITSTOP_WARP: 4, HITSTOP_IRON: 3,
  GRAVITY: 0.22, VMAX: 12, SUBSTEPS: 4,
  E_WALL: 0.8, E_BLOCK: 0.75, E_TERRAIN: 0.8, BUMPER_KICK: 2.2,
  BLAST_R: 64, BLAST_R_STEP: 16,
  STUCK_SPEED: 0.4, STUCK_TICKS: 45,
  COMBO_STEP: 8, COMBO_BONUS: [0, 5, 10, 20, 40], COMBO_MAX: 4,
  COMBO_NAMES: ['', 'NICE', 'GREAT', 'AMAZING', 'INSANE'],
  WIDE_STEP: 20, TERRAIN_HALF: 4, TERRAIN_PEG_CLEAR: 17, TERRAIN_GATE_CLEAR: 20,
  PTS_NORMAL: 10, PTS_HEAVY_STEP: 10, PTS_BOMB: 25,
  PTS_BLOCK_HIT: 5, PTS_BLOCK_BREAK_PER_HP: 20, BLOCK_GOLDS: 1, VAULT_GOLDS: 3,
  ENDLESS_GROWTH: 1.12, ENDLESS_HP_STEP: 2, CAMPAIGN: 20, ENDLESS_UNLOCK: 8,
  PTS_VALUE_STEP: 5, PERK_GOLD_STEP: 2, PERK_BLAST_STEP: 12, CLEAR_COINS: 10,
  BLOCK_CD: 6, BLAST_BLOCK_DMG: 2, BLOCK_PEG_CLEAR: 11, BLOCK_GATE_CLEAR: 16,
  HITSTOP_BOMB: 4, HITSTOP_BREAK: 3,
  GATE_HALF_W: 36, GATE_BUMPER_CLEAR: 24, MAX_BALLS: 6
};

// The plunger spring (one spring, no choice).
// Holding charges power by 1 / charge per tick (0 -> 1, then it stays at 1).
// power p in [POWER_MIN, 1] sets the exit speed vx = -(vMin + (vMax - vMin) * p).
// A release with p inside [perfectLo, perfectHi] is PERFECT: the shot starts perfectTier combo tiers higher.
JD.SPRING = { vMin: 1.5, vMax: 9.0, perfectLo: 0.78, perfectHi: 0.90, perfectTier: 1, charge: 60 };

// Ball types. Every ball in the rack has a type and the player picks which one to fire next (one ball per shot).
// r = radius, ePeg = bounce off pegs, blockDmg = HP per block hit, breaksIron = breaks iron walls.
// glass: cracks after crackAt new peg lights in one shot, shatters into `shards` extra balls at shatterAt.
JD.BALLS = {
  normal: { r: 8,  ePeg: 0.7,  blockDmg: 1, breaksIron: false },
  big:    { r: 11, ePeg: 0.7,  blockDmg: 1, breaksIron: false },
  iron:   { r: 8,  ePeg: 0.5,  blockDmg: 2, breaksIron: true },
  glass:  { r: 8,  ePeg: 0.75, blockDmg: 1, breaksIron: false, crackAt: 12, shatterAt: 24, shards: 2 }
};

// Bucket layouts: x = 6 edges, mult = 5 multipliers. WIDE JACKPOT moves each x5 bucket's edges out by WIDE_STEP.
JD.BUCKETS = {
  center: { x: [0, 80, 144, 216, 280, 360], mult: [1, 2, 5, 2, 1] },
  left:   { x: [0, 72, 136, 208, 280, 360], mult: [5, 2, 1, 2, 1] },
  right:  { x: [0, 80, 152, 224, 288, 360], mult: [1, 2, 1, 2, 5] },
  twin:   { x: [0, 64, 128, 232, 296, 360], mult: [1, 5, 1, 5, 1] }
};

JD.bucketLayout = function (S, up) {
  var C = JD.CFG, L = JD.BUCKETS[S.buckets], x = L.x.slice();
  if (up.jackpot) {
    L.mult.forEach(function (m, i) {
      if (m !== 5) return;
      if (i > 0) x[i] -= C.WIDE_STEP;
      if (i < 4) x[i + 1] += C.WIDE_STEP;
    });
  }
  return { x: x, mult: L.mult.slice() };
};

// rows: number of peg rows (default ROWS = 12). A taller stage (rows 24) is a long board: the camera scrolls down
//      with the ball. landY = ROW_Y0 + ROW_DY * (rows - 1) + LAND_PAD (596 for 12 rows, 980 for 24 rows).
// map: one string per row, top to bottom. '#' keeps the peg at that grid spot, '.' removes it.
//      Even rows use 9 characters (x = 36..324), odd rows use the first 8 (x = 54..306).
// blocks: [x, y, w, h, hp, kind] (centre, size, hit points, 'block' | 'vault')
// terrain: [x1, y1, x2, y2] unbreakable wall segments, 8px thick, no score.
// iron: groups of segments (8px thick). An iron ball breaks the whole group on touch and passes through;
//       any other ball bounces off it like terrain (sticky: it slows down and settles). A ball that comes to rest
//       on an iron group (speed under PARK_SPEED for PARK_TICKS ticks while touching it) is PARKED: it stays on the
//       board across shots and holds its shot's peg points (bank). When an iron ball breaks that group, its parked
//       balls drop again as balls of that shot and their banked points join that shot's peg points.
//       A broken group stays broken for the rest of the stage.
// warps: { ins: [[x, y]...], outs: [[x, y]...] }. A ball that reaches a hole is moved to an exit picked by the
//        board's warp rnd, so where it comes out is a surprise. It then drops straight down.
//        Each hole works once: after swallowing a ball it closes for the rest of the stage.
// buckets: key of JD.BUCKETS.
// reward: fixed card offer after clearing this stage (a one-card choice), or null for the normal 3-card offer.
// hint: what the stage is built around, shown at stage start: { ball } (fire that ball last), or null.
// Only stage 1 has unbreakable funnel walls that lead balls into the JACKPOT. On later stages a V above a JACKPOT is
// made of iron: it belongs to the iron group of the gate below it, so normal balls park on it and an iron ball breaks it all.
// Map row sets reused by stages 9..20.
JD.ROWS_FULL = ['#########', '########', '#########', '########', '#########', '########',
              '#########', '########', '#########', '########', '#########', '########'];
JD.ROWS_CHECK = ['#.#.#.#.#', '.#.#.#.#', '#..###..#', '.#.##.#.', '#.#.#.#.#', '.#.#.#.#',
               '##.#.#.##', '.#.##.#.', '#.#.#.#.#', '.#.#.#.#', '#.#.#.#.#', '########'];
JD.ROWS_VAULT = ['#########', '########', '#.#####.#', '#.####.#', '##.###.##', '##.##.##',
               '###.#.###', '########', '#########', '########', '#########', '########'];
JD.STAGES = [
  { name: 'TUTORIAL', gold: 8, bomb: 3, plus: 0, minus: 0, balls: 3, target: 3000, bumpers: [], blocks: [], buckets: 'center',
    reward: ['ballIron'], hint: null, iron: [], warps: null,
    // Fixed layout (no randomness): a PERFECT release hits bomb 3 first. Funnel walls lead most balls into the JACKPOT.
    fixed: [[3, 'bomb'], [11, 'gold'], [13, 'gold'], [30, 'gold'], [38, 'gold'], [50, 'gold'], [58, 'gold'],
            [70, 'gold'], [78, 'gold'], [45, 'bomb'], [63, 'bomb']],
    terrain: [[0, 522, 136, 580], [360, 522, 224, 580]],
    map: ['#########', '########', '#########', '########', '#########', '########',
          '#########', '########', '#########', '########', '#########', '########'] },
  { name: 'IRON LID', gold: 8, bomb: 4, plus: 0, minus: 0, balls: 3, target: 18000, bumpers: [], blocks: [], buckets: 'center',
    reward: null, hint: { ball: 'iron' }, warps: null, terrain: [],
    iron: [[[0, 522, 136, 580], [360, 522, 224, 580], [136, 580, 224, 580]]],
    map: ['#########', '########', '#########', '########', '#########', '########',
          '#########', '########', '#########', '########', '#########', '########'] },
  { name: 'CURVE', gold: 9, bomb: 4, plus: 1, minus: 1, balls: 3, target: 4600, bumpers: [], blocks: [],
    reward: null, hint: null, iron: [], warps: null,
    terrain: [[76, 400, 76, 596]], buckets: 'left',
    map: ['#########', '########', '#########', '########', '#########', '########',
          '#########', '########', '#########', '########', '#########', '########'] },
  { name: 'HOURGLASS', gold: 9, bomb: 4, plus: 1, minus: 1, balls: 3, target: 10000, bumpers: [],
    reward: null, hint: null, iron: [], warps: { ins: [[60, 470], [180, 470]], outs: [[324, 140], [324, 500], [40, 140]] },
    terrain: [[36, 208, 108, 280], [108, 328, 36, 400], [324, 208, 252, 280], [252, 328, 324, 400]], buckets: 'right',
    blocks: [[108, 304, 44, 20, 3, 'block'], [180, 304, 44, 20, 3, 'block'], [252, 304, 44, 20, 3, 'block']],
    map: ['#########', '########', '.#######.', '.######.', '..#####..', '..####..',
          '...###...', '..####..', '..#####..', '.######.', '.#######.', '########'] },
  // ZIGZAG is the first long board (24 rows): the band swings twice, an iron V and gate seal the JACKPOT at the bottom.
  { name: 'ZIGZAG', gold: 14, bomb: 7, plus: 2, minus: 1, balls: 3, target: 62000, rows: 24, bumpers: [[180, 256], [180, 640]], buckets: 'center',
    terrain: [],
    reward: null, hint: { ball: 'iron' }, warps: null, iron: [[[0, 884, 136, 964], [360, 884, 224, 964], [136, 964, 224, 964]]],
    blocks: [[90, 400, 44, 20, 4, 'block'], [270, 400, 44, 20, 4, 'block'], [90, 784, 44, 20, 5, 'block'], [270, 784, 44, 20, 5, 'block']],
    map: ['######...', '.######.', '..######.', '..######', '...######', '..######',
          '..######.', '.######.', '.######..', '######..', '######...', '.######.',
          '######...', '.######.', '..######.', '..######', '...######', '..######',
          '..######.', '.######.', '.######..', '######..', '######...', '.######.'] },
  { name: 'BOWL', gold: 10, bomb: 5, plus: 2, minus: 1, balls: 3, target: 13000, bumpers: [], terrain: [], buckets: 'twin',
    reward: null, hint: null, iron: [], warps: { ins: [[180, 330]], outs: [[96, 540], [264, 540], [180, 140], [330, 220]] },
    blocks: [[72, 272, 44, 20, 5, 'block'], [126, 336, 44, 20, 5, 'block'], [180, 400, 44, 20, 5, 'block'],
             [234, 336, 44, 20, 5, 'block'], [288, 272, 44, 20, 5, 'block']],
    map: ['#########', '########', '#.#####.#', '#.####.#', '#..###..#', '#..##..#',
          '##..#..##', '##....##', '#########', '########', '#.#.#.#.#', '#.#..#.#'] },
  { name: 'RING', gold: 12, bomb: 5, plus: 2, minus: 2, balls: 3, target: 11000, bumpers: [[180, 256], [90, 416], [270, 416]],
    reward: null, hint: { ball: 'iron' }, warps: null, terrain: [], buckets: 'left', iron: [[[4, 566, 76, 566]]],
    blocks: [[54, 304, 44, 20, 4, 'block'], [180, 368, 44, 20, 6, 'block'], [306, 304, 44, 20, 4, 'block']],
    map: ['#########', '########', '###...###', '##....##', '##.....##', '#......#',
          '##.....##', '##....##', '###...###', '########', '#########', '########'] },
  // VAULT is a long board (24 rows): the vault room on top, a sparse second field with two blocks below, and warp holes
  // at the bottom that send a ball back up (one exit is right above the vault). Each hole works once.
  { name: 'VAULT', gold: 16, bomb: 8, plus: 3, minus: 1, balls: 3, target: 100000, rows: 24, bumpers: [[180, 256], [180, 640]], terrain: [], buckets: 'center',
    reward: null, hint: null, iron: [], warps: { ins: [[40, 904], [320, 904]], outs: [[180, 316], [96, 560], [264, 560], [180, 140]] },
    blocks: [[180, 368, 72, 28, 10, 'vault'], [72, 432, 44, 20, 6, 'block'], [288, 432, 44, 20, 6, 'block'],
             [126, 752, 44, 20, 6, 'block'], [234, 752, 44, 20, 6, 'block']],
    map: ['#########', '########', '#.#####.#', '#.####.#', '##.###.##', '##.##.##',
          '###.#.###', '########', '#########', '########', '#########', '########',
          '#.#.#.#.#', '.#.#.#.#', '#..###..#', '.#.##.#.', '#.#.#.#.#', '.#.#.#.#',
          '##.#.#.##', '.#.##.#.', '#.#.#.#.#', '.#.#.#.#', '#.#.#.#.#', '########'] },
  // ---- stages 9..20: the same gimmicks in new combinations ----
  // 9 CROSSFIRE: a wall diamond in the middle with a bumper inside, two blocks, twin JACKPOTs.
  { name: 'CROSSFIRE', gold: 11, bomb: 5, plus: 2, minus: 2, balls: 3, target: 84000, buckets: 'twin',
    bumpers: [[180, 390]], reward: null, hint: null, iron: [], warps: null,
    terrain: [[90, 300, 150, 360], [270, 300, 210, 360], [150, 420, 90, 480], [210, 420, 270, 480]],
    blocks: [[60, 240, 44, 20, 5, 'block'], [300, 240, 44, 20, 5, 'block']],
    map: JD.ROWS_FULL },
  // 10 DEEP WELL (long): side walls squeeze the lower half into a well; a warp in the well throws balls back up;
  // an iron V and gate seal the JACKPOT at the bottom.
  { name: 'DEEP WELL', gold: 14, bomb: 7, plus: 2, minus: 2, balls: 3, target: 1030000, rows: 24, buckets: 'center',
    bumpers: [[120, 380], [240, 380]], reward: null, hint: { ball: 'iron' },
    terrain: [[60, 560, 60, 760], [300, 560, 300, 760]],
    iron: [[[0, 884, 136, 964], [360, 884, 224, 964], [136, 964, 224, 964]]], warps: { ins: [[180, 700]], outs: [[60, 200], [300, 200], [180, 860]] },
    blocks: [[180, 480, 44, 20, 6, 'block']],
    map: JD.ROWS_FULL.concat(JD.ROWS_CHECK) },
  // 11 LOCKBOX: a vault boxed in by four blocks; the left JACKPOT is under an iron plate.
  { name: 'LOCKBOX', gold: 12, bomb: 6, plus: 2, minus: 1, balls: 3, target: 180000, buckets: 'left',
    bumpers: [], reward: null, hint: { ball: 'iron' }, iron: [[[4, 566, 76, 566]]], warps: null, terrain: [],
    blocks: [[180, 336, 72, 28, 12, 'vault'], [108, 336, 44, 20, 6, 'block'], [252, 336, 44, 20, 6, 'block'],
             [180, 280, 44, 20, 6, 'block'], [180, 392, 44, 20, 6, 'block']],
    map: JD.ROWS_FULL },
  // 12 TWIN LIDS: both JACKPOTs have their own iron lid with an iron ramp (two groups); a centre wall splits the floor.
  { name: 'TWIN LIDS', gold: 12, bomb: 6, plus: 2, minus: 1, balls: 3, target: 280000, buckets: 'twin',
    bumpers: [[180, 300]], reward: null, hint: { ball: 'iron' }, warps: null,
    terrain: [[180, 440, 180, 596]],
    iron: [[[0, 500, 64, 560], [64, 566, 128, 566]], [[360, 500, 296, 560], [232, 566, 296, 566]]],
    blocks: [[90, 400, 44, 20, 6, 'block'], [270, 400, 44, 20, 6, 'block']],
    map: JD.ROWS_FULL },
  // 13 WARP MAZE: two wall lanes and three one-shot warps; the JACKPOT is on the right.
  { name: 'WARP MAZE', gold: 11, bomb: 5, plus: 2, minus: 2, balls: 3, target: 380000, buckets: 'right',
    bumpers: [], reward: null, hint: null, iron: [],
    terrain: [[120, 250, 120, 450], [240, 250, 240, 450]],
    warps: { ins: [[60, 420], [180, 420], [300, 330]], outs: [[324, 500], [40, 140], [180, 140], [300, 140]] },
    blocks: [[180, 510, 44, 20, 5, 'block']],
    map: JD.ROWS_FULL },
  // 14 TOWER (long): three wall shelves zigzag the ball down past blocks to a vault near the bottom.
  { name: 'TOWER', gold: 15, bomb: 7, plus: 2, minus: 1, balls: 3, target: 600000, rows: 24, buckets: 'center',
    bumpers: [[180, 250]], reward: null, hint: null, iron: [], warps: null,
    terrain: [[0, 330, 150, 360], [360, 520, 210, 550], [0, 710, 150, 740]],
    blocks: [[270, 420, 44, 20, 6, 'block'], [90, 610, 44, 20, 6, 'block'], [270, 800, 44, 20, 6, 'block'],
             [180, 850, 72, 28, 12, 'vault']],
    map: JD.ROWS_FULL.slice(0, 6).concat(JD.ROWS_CHECK.slice(0, 6), JD.ROWS_FULL.slice(0, 6), JD.ROWS_CHECK.slice(0, 6)) },
  // 15 BUMPER PARK: five bumpers and five gates; the JACKPOT is on the left.
  { name: 'BUMPER PARK', gold: 12, bomb: 6, plus: 3, minus: 2, balls: 3, target: 430000, buckets: 'left',
    bumpers: [[90, 260], [270, 260], [180, 340], [90, 420], [270, 420]], reward: null, hint: null,
    iron: [], warps: null, terrain: [],
    blocks: [[180, 480, 44, 20, 6, 'block']],
    map: JD.ROWS_FULL },
  // 16 IRON CAGE: an iron box (lid and two sides) and an iron V, one group, over the centre JACKPOT.
  { name: 'IRON CAGE', gold: 12, bomb: 6, plus: 2, minus: 1, balls: 3, target: 2770000, buckets: 'center',
    bumpers: [], reward: null, hint: { ball: 'iron' }, warps: null, terrain: [],
    iron: [[[0, 460, 120, 540], [360, 460, 240, 540], [136, 520, 224, 520], [136, 520, 136, 580], [224, 520, 224, 580]]],
    blocks: [[90, 330, 44, 20, 6, 'block'], [270, 330, 44, 20, 6, 'block']],
    map: JD.ROWS_FULL },
  // 17 SPLIT RIVER: a wall splits the board in two; warps at the bottom of each side swap balls to the other side.
  { name: 'SPLIT RIVER', gold: 12, bomb: 6, plus: 2, minus: 2, balls: 3, target: 650000, buckets: 'twin',
    bumpers: [], reward: null, hint: null, iron: [],
    terrain: [[180, 200, 180, 596]], warps: { ins: [[100, 480], [260, 480]], outs: [[260, 160], [100, 160]] },
    blocks: [[100, 360, 44, 20, 6, 'block'], [260, 360, 44, 20, 6, 'block']],
    map: JD.ROWS_FULL },
  // 18 VAULT DEEP (long): two vaults stacked, blocks between, bottom warps send balls back to either vault.
  { name: 'VAULT DEEP', gold: 18, bomb: 9, plus: 3, minus: 1, balls: 3, target: 2000000, rows: 24, buckets: 'center',
    bumpers: [[180, 256], [180, 640]], reward: null, hint: null, iron: [], terrain: [],
    warps: { ins: [[40, 904], [320, 904]], outs: [[180, 316], [180, 700], [96, 560], [264, 560]] },
    blocks: [[180, 368, 72, 28, 12, 'vault'], [180, 752, 72, 28, 12, 'vault'], [72, 560, 44, 20, 7, 'block'], [288, 560, 44, 20, 7, 'block']],
    map: JD.ROWS_VAULT.concat(JD.ROWS_VAULT) },
  // 19 GAUNTLET (long): five bumpers and four red gates on the way down to a JACKPOT under an iron V.
  { name: 'GAUNTLET', gold: 16, bomb: 8, plus: 2, minus: 4, balls: 3, target: 9710000, rows: 24, buckets: 'center',
    bumpers: [[90, 300], [270, 300], [180, 520], [90, 740], [270, 740]], reward: null, hint: { ball: 'iron' }, warps: null,
    terrain: [], iron: [[[0, 884, 136, 964], [360, 884, 224, 964], [136, 964, 224, 964]]],
    blocks: [[180, 640, 44, 20, 7, 'block']],
    map: JD.ROWS_CHECK.concat(JD.ROWS_FULL) },
  // 20 GRAND JACKPOT (long): everything at once: vault, four blocks, two warps, an iron V over the JACKPOT.
  { name: 'GRAND JACKPOT', gold: 20, bomb: 10, plus: 3, minus: 2, balls: 3, target: 17130000, rows: 24, buckets: 'center',
    bumpers: [[180, 256], [180, 680]], reward: null, hint: { ball: 'iron' },
    terrain: [], iron: [[[0, 884, 136, 964], [360, 884, 224, 964], [136, 964, 224, 964]]],
    warps: { ins: [[40, 700], [320, 700]], outs: [[180, 500], [96, 860], [264, 860]] },
    blocks: [[180, 560, 72, 28, 14, 'vault'], [72, 400, 44, 20, 8, 'block'], [288, 400, 44, 20, 8, 'block'],
             [126, 800, 44, 20, 8, 'block'], [234, 800, 44, 20, 8, 'block']],
    map: JD.ROWS_FULL.concat(JD.ROWS_CHECK) }
];

// Stage definition for any 0-based index. 0..19 is the CAMPAIGN (JD.STAGES). Index 20 and later is ENDLESS mode
// (a separate run, unlocked by clearing campaign stage ENDLESS_UNLOCK = 8): endless stage k = i - 20 reuses the layout of
// JD.ENDLESS_POOL[k % pool length], its target is that layout's campaign target x ENDLESS_SCALE x ENDLESS_GROWTH^k
// and blocks get ENDLESS_HP_STEP more hit points per loop through the pool.
JD.ENDLESS_POOL = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
JD.ENDLESS_SCALE = 0.2;
JD.stageDef = function (i) {
  var C = JD.CFG, n = JD.STAGES.length;
  if (i < n) return JD.STAGES[i];
  var k = i - n, P = JD.ENDLESS_POOL, loop = Math.floor(k / P.length), base = JD.STAGES[P[k % P.length]];
  return {
    name: base.name, gold: base.gold, bomb: base.bomb, plus: base.plus, minus: base.minus, balls: base.balls, rows: base.rows,
    target: Math.round(base.target * JD.ENDLESS_SCALE * Math.pow(C.ENDLESS_GROWTH, k) / 1000) * 1000,
    bumpers: base.bumpers, map: base.map, terrain: base.terrain, buckets: base.buckets, endless: true,
    iron: base.iron, warps: base.warps, reward: null, hint: base.hint,
    blocks: base.blocks.map(function (q) { return [q[0], q[1], q[2], q[3], q[4] + C.ENDLESS_HP_STEP * loop, q[5]]; })
  };
};

// PERKS: permanent upgrades bought with coins (1 coin per gold peg lit, CLEAR_COINS more for each first clear of a
// campaign stage). They stay across retries, campaign restarts and endless runs. cost(level) = round(base x grow^level / 5) x 5.
//   mult:  stage multiplier starts +1 per level      value: blue/gold pegs +PTS_VALUE_STEP points per level
//   gold:  +PERK_GOLD_STEP gold pegs on every board   ball:  +1 normal ball in the rack per level
//   blast: bomb blast radius +PERK_BLAST_STEP per level
JD.PERKS = {
  mult:  { max: 5, base: 25, grow: 1.7 },
  value: { max: 5, base: 15, grow: 1.6 },
  gold:  { max: 5, base: 15, grow: 1.6 },
  ball:  { max: 2, base: 80, grow: 2.2 },
  blast: { max: 3, base: 15, grow: 1.7 }
};
JD.PERK_IDS = ['mult', 'value', 'gold', 'ball', 'blast'];
JD.newPerks = function () { return { mult: 0, value: 0, gold: 0, ball: 0, blast: 0 }; };
JD.perkCost = function (id, level) {
  var P = JD.PERKS[id];
  return level >= P.max ? null : Math.round(P.base * Math.pow(P.grow, level) / 5) * 5;
};
// wallet = { coins, perks }. Buys one level of perk id if affordable; returns true on success.
JD.buyPerk = function (wallet, id) {
  var cost = JD.perkCost(id, wallet.perks[id]);
  if (cost === null || wallet.coins < cost) return false;
  wallet.coins -= cost; wallet.perks[id]++;
  return true;
};
// Coins a finished shot earns: one per gold peg it lit.
JD.shotCoins = function (S) { return S.goldPegs; };
// After buying perks between attempts, bring a run's upgrades in line with the wallet: copy the levels and add
// one normal ball to the rack for each new ball level.
JD.syncPerks = function (up, perks) {
  var add = perks.ball - up.perks.ball;
  for (var i = 0; i < add; i++) up.rack.push('normal');
  up.perks = { mult: perks.mult, value: perks.value, gold: perks.gold, ball: perks.ball, blast: perks.blast };
};
// Gate slots: centre (x, y). y lies halfway between two peg rows. The last three rows exist only on long boards.
JD.GATE_SLOTS = [
  [72, 240], [180, 240], [288, 240],
  [72, 368], [180, 368], [288, 368],
  [72, 464], [180, 464], [288, 464],
  [72, 592], [180, 592], [288, 592],
  [72, 720], [180, 720], [288, 720],
  [72, 848], [180, 848], [288, 848]
];

// Board geometry for a stage: peg rows, landing line, board height, flight time limit.
JD.boardSize = function (S) {
  var C = JD.CFG, rows = S.rows || C.ROWS, landY = C.ROW_Y0 + C.ROW_DY * (rows - 1) + C.LAND_PAD;
  return { rows: rows, landY: landY, h: landY + 44, maxFlight: C.FLIGHT_PER_ROW * rows };
};

// Cards in the random 3-card offer (stage 1 instead gives its fixed reward, ballIron).
JD.CARD_IDS = ['goldPlus', 'heavy', 'bombPlus', 'fever', 'jackpot', 'extra', 'split', 'gate',
  'ballGlass', 'ballBig', 'ballIron'];
JD.CARD_CAP = { jackpot: 1, extra: 2, split: 2, gate: 2, ballGlass: 1, ballBig: 1, ballIron: 2 };
// Ball cards put a ball of that type into the rack (it replaces a normal ball; with no normal ball left it is added).
JD.CARD_BALL = { ballGlass: 'glass', ballBig: 'big', ballIron: 'iron' };

// rack: ball types for each stage (refilled at every stage start). One shot fires one ball from the rack.
// perks: the permanent PERKS levels this run plays with (default none). perks.ball adds normal balls to the rack.
JD.newUpgrades = function (perks) {
  var pk = perks ? { mult: perks.mult, value: perks.value, gold: perks.gold, ball: perks.ball, blast: perks.blast } : JD.newPerks();
  var rack = ['normal', 'normal', 'normal'];
  for (var i = 0; i < pk.ball; i++) rack.push('normal');
  return { goldPlus: 0, heavy: 0, bombPlus: 0, fever: 0, jackpot: 0, extra: 0, split: 0, gate: 0,
    ballGlass: 0, ballBig: 0, ballIron: 0, rack: rack, perks: pk };
};

JD.applyCard = function (up, id) {
  up[id]++;
  if (JD.CARD_BALL[id]) {
    var i = up.rack.indexOf('normal');
    if (i >= 0) up.rack[i] = JD.CARD_BALL[id]; else up.rack.push(JD.CARD_BALL[id]);
  } else if (id === 'extra') {
    up.rack.push('normal');
  }
};

JD.mulberry32 = function (a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
};

// The offer after clearing stage index s: the stage's fixed reward if it has one (rnd is not used),
// otherwise three distinct card ids from the cards that are not at their cap.
JD.drawOffer = function (rnd, up, s) {
  var S = JD.stageDef(s || 0);
  if (S.reward) return S.reward.slice();
  var avail = JD.CARD_IDS.filter(function (c) { return !(JD.CARD_CAP[c] && up[c] >= JD.CARD_CAP[c]); });
  var offer = [];
  while (offer.length < 3 && avail.length) offer.push(avail.splice(Math.floor(rnd() * avail.length), 1)[0]);
  return offer;
};

// Distance from point (px, py) to segment w = [x1, y1, x2, y2]; also returns the closest point.
JD.segPoint = function (px, py, w) {
  var wx = w[2] - w[0], wy = w[3] - w[1], L2 = wx * wx + wy * wy;
  var u = L2 > 0 ? Math.max(0, Math.min(1, ((px - w[0]) * wx + (py - w[1]) * wy) / L2)) : 0;
  var cx = w[0] + u * wx, cy = w[1] + u * wy;
  return { d: Math.hypot(px - cx, py - cy), cx: cx, cy: cy };
};

JD.pegGrid = function (rows) {
  var C = JD.CFG, out = [];
  for (var r = 0; r < (rows || C.ROWS); r++) {
    var y = C.ROW_Y0 + C.ROW_DY * r;
    var n = (r % 2 === 0) ? 9 : 8;
    var x0 = (r % 2 === 0) ? 36 : 54;
    for (var c = 0; c < n; c++) out.push({ id: out.length, x: x0 + 36 * c, y: y });
  }
  return out; // 102 pegs for 12 rows, 204 for 24
};

// up = JD.newUpgrades() shape. stageIndex is 0-based. attempt = 0 for the first try of a stage, 1, 2... for retries
// (each retry deals a new peg/gate layout and warp sequence).
JD.buildBoard = function (stageIndex, up, runSeed, attempt) {
  var C = JD.CFG, S = JD.stageDef(stageIndex), size = JD.boardSize(S), at = attempt || 0, pk = up.perks || JD.newPerks();
  var rnd = JD.mulberry32(runSeed * 7919 + stageIndex * 104729 + 13 + at * 7);
  var pegs = JD.pegGrid(size.rows).map(function (p) {
    var r = Math.round((p.y - C.ROW_Y0) / C.ROW_DY), c = Math.round((p.x - (r % 2 === 0 ? 36 : 54)) / 36);
    return { id: p.id, x: p.x, y: p.y, type: 'normal', lit: false, alive: S.map[r].charAt(c) === '#' };
  });
  var order = pegs.map(function (p) { return p.id; });
  for (var i = order.length - 1; i > 0; i--) {
    var j = Math.floor(rnd() * (i + 1));
    var t = order[i]; order[i] = order[j]; order[j] = t;
  }
  S.bumpers.forEach(function (b) {
    pegs.forEach(function (p) { if (Math.hypot(p.x - b[0], p.y - b[1]) < 26) p.alive = false; });
  });
  S.blocks.forEach(function (k) {
    pegs.forEach(function (p) {
      if (Math.abs(p.x - k[0]) < k[2] / 2 + C.BLOCK_PEG_CLEAR && Math.abs(p.y - k[1]) < k[3] / 2 + C.BLOCK_PEG_CLEAR) p.alive = false;
    });
  });
  var segs = S.terrain.slice();
  S.iron.forEach(function (grp) { grp.forEach(function (w) { segs.push(w); }); });
  segs.forEach(function (w) {
    pegs.forEach(function (p) { if (JD.segPoint(p.x, p.y, w).d < C.TERRAIN_PEG_CLEAR) p.alive = false; });
  });
  var holes = S.warps ? S.warps.ins.concat(S.warps.outs) : [];
  holes.forEach(function (h) {
    pegs.forEach(function (p) { if (Math.hypot(p.x - h[0], p.y - h[1]) < C.WARP_CLEAR) p.alive = false; });
  });
  var live = order.filter(function (id) { return pegs[id].alive; });
  var g = S.gold + 3 * up.goldPlus + C.PERK_GOLD_STEP * pk.gold, bo = S.bomb + 2 * up.bombPlus;
  // fixed: [[id, type], ...] pegs placed by hand (the tutorial stage). They count toward gold/bomb.
  (S.fixed || []).forEach(function (f) {
    if (!pegs[f[0]].alive) return;
    pegs[f[0]].type = f[1];
    live.splice(live.indexOf(f[0]), 1);
    if (f[1] === 'gold') g--; else if (f[1] === 'bomb') bo--;
  });
  var k = 0;
  for (var a = 0; a < g && k < live.length; a++) pegs[live[k++]].type = 'gold';
  for (var b2 = 0; b2 < bo && k < live.length; b2++) pegs[live[k++]].type = 'bomb';

  // Gates: drop slots near a bumper or block, shuffle the rest with the same rnd, plus gates first.
  var slots = JD.GATE_SLOTS.filter(function (s) {
    if (s[1] > size.landY - 100) return false;
    var nearBumper = S.bumpers.some(function (b) {
      var dx = Math.max(Math.abs(b[0] - s[0]) - C.GATE_HALF_W, 0), dy = b[1] - s[1];
      return Math.hypot(dx, dy) < C.GATE_BUMPER_CLEAR;
    });
    var nearBlock = S.blocks.some(function (q) {
      return Math.abs(q[0] - s[0]) < q[2] / 2 + C.GATE_HALF_W + C.BLOCK_GATE_CLEAR && Math.abs(q[1] - s[1]) < q[3] / 2 + C.BLOCK_GATE_CLEAR;
    });
    var nearTerrain = segs.some(function (w) {
      for (var gx = s[0] - C.GATE_HALF_W; gx <= s[0] + C.GATE_HALF_W; gx += 9) {
        if (JD.segPoint(gx, s[1], w).d < C.TERRAIN_GATE_CLEAR) return true;
      }
      return false;
    });
    var nearWarp = holes.some(function (h) { return Math.abs(h[0] - s[0]) < C.GATE_HALF_W + C.WARP_CLEAR && Math.abs(h[1] - s[1]) < C.WARP_CLEAR; });
    return !nearBumper && !nearBlock && !nearTerrain && !nearWarp;
  });
  for (var si = slots.length - 1; si > 0; si--) {
    var sj = Math.floor(rnd() * (si + 1));
    var st = slots[si]; slots[si] = slots[sj]; slots[sj] = st;
  }
  var gates = [], nPlus = S.plus + up.gate, nMinus = S.minus, gk = 0;
  for (var gp = 0; gp < nPlus && gk < slots.length; gp++, gk++) gates.push({ id: gates.length, kind: 'plus', x: slots[gk][0], y: slots[gk][1], alive: true });
  for (var gm = 0; gm < nMinus && gk < slots.length; gm++, gk++) gates.push({ id: gates.length, kind: 'minus', x: slots[gk][0], y: slots[gk][1], alive: true });

  return {
    pegs: pegs.filter(function (p) { return p.alive; }),
    bumpers: S.bumpers.map(function (b) { return { x: b[0], y: b[1] }; }),
    gates: gates,
    blocks: S.blocks.map(function (q, qi) { return { id: qi, x: q[0], y: q[1], w: q[2], h: q[3], hp: q[4], maxHp: q[4], kind: q[5], alive: true }; }),
    terrain: S.terrain.map(function (w) { return [w[0], w[1], w[2], w[3]]; }),
    iron: S.iron.map(function (grp, gi) { return { id: gi, segs: grp.map(function (w) { return [w[0], w[1], w[2], w[3]]; }), alive: true }; }),
    parked: [],
    rows: size.rows, landY: size.landY, h: size.h, maxFlight: size.maxFlight,
    warps: S.warps ? {
      ins: S.warps.ins.map(function (h) { return { x: h[0], y: h[1], alive: true }; }),
      outs: S.warps.outs.map(function (h) { return { x: h[0], y: h[1] }; }),
      rnd: { s: runSeed * 31 + stageIndex * 977 + 5 + at * 13 }
    } : null,
    buckets: JD.bucketLayout(S, up),
    mult: 1 + up.fever + pk.mult
  };
};

// Is plunger power p a PERFECT release?
JD.isPerfect = function (p) {
  return p >= JD.SPRING.perfectLo && p <= JD.SPRING.perfectHi;
};

// Same generator as mulberry32, but the state lives in a plain object so a board can be copied with JSON.
JD.nextRand = function (st) {
  st.s |= 0; st.s = st.s + 0x6D2B79F5 | 0;
  var t = Math.imul(st.s ^ st.s >>> 15, 1 | st.s);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

// One shot from the plunger. power in [0, 1] (clamped to POWER_MIN). The ball leaves the shooter lane
// at (EXIT_X, EXIT_Y) moving left; more power = faster = enters the board further left.
// pick = { ball: type } (default 'normal'). One ball per shot.
JD.createShot = function (board, power, up, pick) {
  var C = JD.CFG, k = pick || {}, keys = [k.ball || 'normal'];
  var sp = JD.SPRING;
  var p = Math.max(C.POWER_MIN, Math.min(1, power));
  var perfect = JD.isPerfect(p);
  var vx = -(sp.vMin + (sp.vMax - sp.vMin) * p);
  var S = {
    board: board, up: up, ballKeys: keys, power: p, perfect: perfect,
    balls: [JD.newBall(C.EXIT_X, C.EXIT_Y, vx, C.EXIT_VY, keys[0])],
    landY: board.landY || 596, maxFlight: board.maxFlight || C.FLIGHT_PER_ROW * C.ROWS,
    pts: 0, golds: 0, goldPegs: 0, hits: 0, blockHits: 0, split: false, cracked: false, shattered: false,
    comboBase: perfect ? sp.perfectTier : 0, tier: 0,
    t: 0, hitstop: 0, finished: false,
    bucketX: board.buckets.x, bucketMult: board.buckets.mult,
    base: C.PTS_NORMAL + C.PTS_HEAVY_STEP * up.heavy + C.PTS_VALUE_STEP * (up.perks ? up.perks.value : 0),
    blastR: C.BLAST_R + C.BLAST_R_STEP * up.bombPlus + C.PERK_BLAST_STEP * (up.perks ? up.perks.blast : 0),
    events: []
  };
  S.tier = Math.min(C.COMBO_MAX, S.comboBase);
  S.events.push({ type: 'launch', power: p, perfect: perfect, tier: S.tier, balls: keys.slice() });
  return S;
};

// key = ball type (default 'normal'); the ball keeps its own type (radius, bounce, damage, iron breaking).
JD.newBall = function (x, y, vx, vy, key) {
  var kk = key || 'normal', d = JD.BALLS[kk];
  return { x: x, y: y, vx: vx, vy: vy, r: d.r, key: kk, def: d, done: false, lost: false, parked: false, bucket: -1,
    slow: 0, cd: {}, warpCd: 0, restIron: -1, restTicks: 0, restSeen: -99, parkTouch: -1 };
};

// Light a peg. Every COMBO_STEP new lights raise the combo tier; each peg is worth COMBO_BONUS[tier] more.
JD.lightPeg = function (S, p, cause) {
  var C = JD.CFG;
  if (p.lit) return;
  p.lit = true; S.hits++;
  var tier = Math.min(C.COMBO_MAX, S.comboBase + Math.floor(S.hits / C.COMBO_STEP));
  if (tier > S.tier) { S.tier = tier; S.events.push({ type: 'combo_up', tier: tier, n: S.hits }); }
  var add = (p.type === 'bomb' ? C.PTS_BOMB : S.base) + C.COMBO_BONUS[S.tier];
  S.pts += add;
  if (p.type === 'gold') { S.golds++; S.goldPegs++; }
  S.events.push({ type: 'peg_hit', id: p.id, pegType: p.type, n: S.hits, cause: cause, tier: S.tier, pts: add });
};

// Damage a block. Breaking it adds a bonus; a vault also adds gold multiplier.
JD.hitBlock = function (S, k, dmg, cause) {
  var C = JD.CFG;
  k.hp = Math.max(0, k.hp - dmg);
  S.pts += C.PTS_BLOCK_HIT; S.blockHits++;
  S.events.push({ type: 'block_hit', id: k.id, hp: k.hp, cause: cause });
  if (k.hp === 0) {
    k.alive = false;
    var bonus = C.PTS_BLOCK_BREAK_PER_HP * k.maxHp;
    S.pts += bonus;
    S.golds += k.kind === 'vault' ? C.VAULT_GOLDS : C.BLOCK_GOLDS;
    S.events.push({ type: 'block_broken', id: k.id, kind: k.kind, bonus: bonus, x: k.x, y: k.y });
    S.hitstop = Math.max(S.hitstop, C.HITSTOP_BREAK);
  }
};

// A ball crossed an alive gate line this substep. Gates break on first pass.
JD.passGate = function (S, B, bi, g) {
  var C = JD.CFG, result;
  g.alive = false;
  if (g.kind === 'plus') {
    if (S.balls.length < C.MAX_BALLS) {
      var dir = B.vx >= 0 ? -1 : 1;
      S.balls.push(JD.newBall(B.x, g.y, dir * Math.max(Math.abs(B.vx), 0.8), B.vy, B.key));
      result = 'spawn';
    } else result = 'capped';
  } else {
    var active = S.balls.filter(function (b) { return !b.done; }).length;
    if (active >= 2) { B.done = true; B.lost = true; result = 'removed'; }
    else result = 'saved';
  }
  S.events.push({ type: 'gate_passed', id: g.id, kind: g.kind, ball: bi, x: B.x, y: g.y, result: result });
};

// Bounce ball B off a wall segment w (8px thick). Returns true on contact.
// sticky (iron walls for non-iron balls): no roll-off kick and IRON_FRICTION on the sliding speed, so balls settle and park.
JD.bounceSegment = function (B, w, sticky) {
  var C = JD.CFG, sp0 = JD.segPoint(B.x, B.y, w), RT = B.r + C.TERRAIN_HALF;
  if (!(sp0.d < RT && sp0.d > 0)) return false;
  var tx = (B.x - sp0.cx) / sp0.d, ty = (B.y - sp0.cy) / sp0.d;
  B.x = sp0.cx + tx * RT; B.y = sp0.cy + ty * RT;
  var vt = B.vx * tx + B.vy * ty;
  if (vt < 0) { B.vx -= (1 + C.E_TERRAIN) * vt * tx; B.vy -= (1 + C.E_TERRAIN) * vt * ty; }
  if (sticky) { B.vx *= C.IRON_FRICTION; if (ty < -0.7 && B.vy < 0) B.vy *= 0.5; }
  else if (ty < -0.7 && Math.abs(B.vx) < 0.8) B.vx = (tx >= 0 ? 1 : -1) * 0.8; // never rest on a wall end
  return true;
};

// A ball reached a warp hole this substep: move it to an exit picked by the board's warp rnd. The hole then closes.
JD.useWarp = function (S, B, bi, wi) {
  var C = JD.CFG, W = S.board.warps, h = W.ins[wi];
  var oi = Math.floor(JD.nextRand(W.rnd) * W.outs.length), out = W.outs[oi];
  h.alive = false;
  S.events.push({ type: 'warp', ball: bi, from: wi, to: oi, x: h.x, y: h.y, ox: out.x, oy: out.y });
  B.x = out.x; B.y = out.y; B.vx = 0; B.vy = 1; B.warpCd = C.WARP_CD;
  S.hitstop = Math.max(S.hitstop, C.HITSTOP_WARP);
};

// Advance one 60Hz tick of flight. Returns true once every ball has landed, parked or been lost.
JD.stepShot = function (S) {
  var C = JD.CFG;
  if (S.finished) return true;
  if (S.hitstop > 0) { S.hitstop--; return false; }
  S.t++;
  for (var bi = 0; bi < S.balls.length; bi++) { // balls appended this tick are processed this tick
    var B = S.balls[bi];
    if (B.done) continue;
    B.vy += C.GRAVITY;
    if (B.warpCd > 0) B.warpCd--;
    var touchIron = -1;
    for (var s = 0; s < C.SUBSTEPS; s++) {
      var prevY = B.y;
      B.x += B.vx / C.SUBSTEPS; B.y += B.vy / C.SUBSTEPS;
      if (B.x < B.r) { B.x = B.r; B.vx = -B.vx * C.E_WALL; }
      if (B.x > C.W - B.r) { B.x = C.W - B.r; B.vx = -B.vx * C.E_WALL; }
      var gates = S.board.gates;
      for (var gi = 0; gi < gates.length; gi++) {
        var g = gates[gi];
        if (!g.alive) continue;
        var crossed = (prevY < g.y && B.y >= g.y) || (prevY > g.y && B.y <= g.y);
        if (crossed && Math.abs(B.x - g.x) <= C.GATE_HALF_W) { JD.passGate(S, B, bi, g); if (B.done) break; }
      }
      if (B.done) break;
      var W = S.board.warps;
      if (W && B.warpCd === 0) {
        for (var wi = 0; wi < W.ins.length; wi++) {
          if (W.ins[wi].alive && Math.hypot(B.x - W.ins[wi].x, B.y - W.ins[wi].y) < C.WARP_R) { JD.useWarp(S, B, bi, wi); break; }
        }
      }
      var pegs = S.board.pegs;
      for (var pi = 0; pi < pegs.length; pi++) {
        var p = pegs[pi];
        if (!p.alive) continue;
        var dx = B.x - p.x, dy = B.y - p.y, d = Math.hypot(dx, dy), R = C.PEG_R + B.r;
        if (d < R && d > 0) {
          var nx = dx / d, ny = dy / d;
          B.x = p.x + nx * R; B.y = p.y + ny * R;
          var vn = B.vx * nx + B.vy * ny;
          if (vn < 0) { B.vx -= (1 + B.def.ePeg) * vn * nx; B.vy -= (1 + B.def.ePeg) * vn * ny; }
          if (Math.abs(B.vx) < 0.2) B.vx = (B.x >= p.x ? 1 : -1) * 0.4;
          var wasLit = p.lit;
          JD.lightPeg(S, p, 'ball');
          if (!(B.cd['p' + p.id] > S.t)) {
            B.cd['p' + p.id] = S.t + C.PEG_HIT_CD;
            p.touches = (p.touches || 0) + 1;
            if (p.touches >= C.PEG_BREAK_HITS && p.alive) {
              p.alive = false;
              S.events.push({ type: 'peg_break', id: p.id, x: p.x, y: p.y });
            }
          }
          if (!wasLit && p.type === 'bomb') {
            p.alive = false;
            var lit = [];
            for (var qi = 0; qi < pegs.length; qi++) {
              var q = pegs[qi];
              if (q.alive && !q.lit && Math.hypot(q.x - p.x, q.y - p.y) <= S.blastR) { JD.lightPeg(S, q, 'blast'); lit.push(q.id); }
            }
            var blasted = [];
            S.board.blocks.forEach(function (kb) {
              if (!kb.alive) return;
              var ox = Math.max(Math.abs(kb.x - p.x) - kb.w / 2, 0), oy = Math.max(Math.abs(kb.y - p.y) - kb.h / 2, 0);
              if (Math.hypot(ox, oy) <= S.blastR) { blasted.push(kb.id); JD.hitBlock(S, kb, C.BLAST_BLOCK_DMG, 'blast'); }
            });
            S.events.push({ type: 'bomb_exploded', id: p.id, x: p.x, y: p.y, r: S.blastR, lit: lit, blocks: blasted });
            S.hitstop = Math.max(S.hitstop, C.HITSTOP_BOMB);
          }
          if (!wasLit && S.up.split > 0 && !S.split) {
            S.split = true;
            for (var k = 0; k < S.up.split; k++) {
              S.balls.push(JD.newBall(B.x, B.y, -B.vx * (1 - 0.3 * k) + (k ? 1 : 0), B.vy, B.key));
            }
            S.events.push({ type: 'ball_split', count: S.up.split, x: B.x, y: B.y });
          }
          var bd = B.def;
          if (bd.crackAt && !S.cracked && S.hits >= bd.crackAt) { S.cracked = true; S.events.push({ type: 'ball_crack', ball: bi, x: B.x, y: B.y }); }
          if (bd.shatterAt && !S.shattered && S.hits >= bd.shatterAt) {
            S.shattered = true;
            var made = 0;
            for (var sh = 0; sh < bd.shards && S.balls.length < C.MAX_BALLS; sh++, made++) {
              S.balls.push(JD.newBall(B.x, B.y, (sh === 0 ? -1 : 1) * Math.max(1.5, Math.abs(B.vx)), B.vy - 1, B.key));
            }
            S.events.push({ type: 'ball_shatter', ball: bi, x: B.x, y: B.y, count: made });
          }
        }
      }
      var blocks = S.board.blocks;
      for (var ki = 0; ki < blocks.length; ki++) {
        var kb = blocks[ki];
        if (!kb.alive) continue;
        var hw = kb.w / 2, hh = kb.h / 2;
        var cx = Math.max(kb.x - hw, Math.min(B.x, kb.x + hw)), cy = Math.max(kb.y - hh, Math.min(B.y, kb.y + hh));
        var ddx = B.x - cx, ddy = B.y - cy, dd = Math.hypot(ddx, ddy);
        if (dd >= B.r) continue;
        var bx, by;
        if (dd > 0) { bx = ddx / dd; by = ddy / dd; B.x = cx + bx * B.r; B.y = cy + by * B.r; }
        else {
          var penX = hw - Math.abs(B.x - kb.x), penY = hh - Math.abs(B.y - kb.y);
          if (penX < penY) { bx = B.x >= kb.x ? 1 : -1; by = 0; B.x = kb.x + bx * (hw + B.r); }
          else { bx = 0; by = B.y >= kb.y ? 1 : -1; B.y = kb.y + by * (hh + B.r); }
        }
        var vb = B.vx * bx + B.vy * by;
        if (vb < 0) { B.vx -= (1 + C.E_BLOCK) * vb * bx; B.vy -= (1 + C.E_BLOCK) * vb * by; }
        if (by < -0.7 && Math.abs(B.vx) < 0.8) B.vx = (B.x >= kb.x ? 1 : -1) * 0.8; // roll off a flat top
        if (!(B.cd[kb.id] > S.t)) { B.cd[kb.id] = S.t + C.BLOCK_CD; JD.hitBlock(S, kb, B.def.blockDmg, 'ball'); }
      }
      var ter = S.board.terrain;
      for (var ti = 0; ti < ter.length; ti++) if (JD.bounceSegment(B, ter[ti])) S.events.push({ type: 'terrain_hit', index: ti });
      var irn = S.board.iron;
      for (var ii = 0; ii < irn.length; ii++) {
        var grp = irn[ii];
        if (!grp.alive) continue;
        for (var gs = 0; gs < grp.segs.length; gs++) {
          if (B.def.breaksIron) {
            if (JD.segPoint(B.x, B.y, grp.segs[gs]).d < B.r + C.TERRAIN_HALF) {
              grp.alive = false;
              S.events.push({ type: 'iron_break', id: grp.id, ball: bi, x: B.x, y: B.y });
              S.hitstop = Math.max(S.hitstop, C.HITSTOP_IRON);
              JD.releaseParked(S, grp.id);
              break;
            }
          } else if (JD.bounceSegment(B, grp.segs[gs], true)) { touchIron = grp.id; S.events.push({ type: 'iron_hit', id: grp.id, ball: bi }); break; }
        }
      }
      var bum = S.board.bumpers;
      for (var mi = 0; mi < bum.length; mi++) {
        var m = bum[mi];
        var ex = B.x - m.x, ey = B.y - m.y, e = Math.hypot(ex, ey), RR = C.BUMPER_R + B.r;
        if (e < RR && e > 0) {
          var mx = ex / e, my = ey / e;
          B.x = m.x + mx * RR; B.y = m.y + my * RR;
          var vm = B.vx * mx + B.vy * my;
          if (vm < 0) { B.vx -= C.BUMPER_KICK * vm * mx; B.vy -= C.BUMPER_KICK * vm * my; }
          S.events.push({ type: 'bumper_hit', index: mi });
        }
      }
    }
    if (B.done) continue; // lost at a minus gate
    var sp = Math.hypot(B.vx, B.vy);
    if (sp > C.VMAX) { B.vx *= C.VMAX / sp; B.vy *= C.VMAX / sp; }
    // Resting on an iron group, or on a ball already parked on it (found by last tick's ball contact pass), counts.
    // A touch within the last PARK_GRACE ticks still counts, so a ball wedged against a parked ball (touching it every
    // other tick) parks too.
    var restOn = touchIron >= 0 ? touchIron : B.parkTouch;
    B.parkTouch = -1;
    if (restOn >= 0) { B.restIron = restOn; B.restSeen = S.t; }
    var nearRest = B.restIron >= 0 && S.t - B.restSeen <= C.PARK_GRACE;
    if (nearRest && sp < C.PARK_SPEED) B.restTicks++;
    else if (!nearRest) { B.restTicks = 0; B.restIron = -1; }
    if (B.restTicks >= C.PARK_TICKS) {
      B.done = true; B.parked = true;
      S.board.parked.push({ x: B.x, y: B.y, r: B.r, ball: B.key, group: B.restIron, bank: 0, shot: S });
      S.events.push({ type: 'ball_parked', ball: bi, x: B.x, y: B.y, group: B.restIron, count: S.board.parked.length });
      continue;
    }
    if (sp < C.STUCK_SPEED) B.slow++; else B.slow = 0;
    if (B.slow >= C.STUCK_TICKS) {
      var cleared = [];
      S.board.pegs.forEach(function (p) { if (p.lit && p.alive) { p.alive = false; cleared.push(p.id); } });
      S.events.push({ type: 'stuck_clear', ids: cleared });
      B.slow = 0;
    }
    if (B.y >= S.landY) {
      B.done = true;
      var i = 0; while (i < 4 && B.x >= S.bucketX[i + 1]) i++;
      B.bucket = i;
      S.events.push({ type: 'ball_landed', ball: bi, bucket: i, mult: S.bucketMult[i] });
    }
  }
  JD.ballContacts(S);
  var all = S.balls.every(function (b) { return b.done; });
  if (!all && S.t >= S.maxFlight) {
    S.balls.forEach(function (b, bi2) {
      if (!b.done) { b.done = true; b.bucket = 0; S.events.push({ type: 'ball_landed', ball: bi2, bucket: 0, mult: S.bucketMult[0], timeout: true }); }
    });
    all = true;
  }
  if (all) JD.finishShot(S);
  return all;
};

// Ball-to-ball contact, once per tick after every ball has moved. Flying balls bounce off each other (equal mass,
// restitution E_BALL) and off parked balls (parked balls do not move; restitution E_PARKED). A flying ball within
// PARK_REACH of a parked ball rests on that ball's iron group (parkTouch), so balls pile up on a gate and park there too.
// An iron ball that touches a parked ball breaks that ball's iron group (the hit goes through the pile).
JD.ballContacts = function (S) {
  var C = JD.CFG, fly = S.balls.filter(function (b) { return !b.done; }), smash = [];
  for (var i = 0; i < fly.length; i++) {
    var A = fly[i];
    for (var j = i + 1; j < fly.length; j++) {
      var B = fly[j], dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), R = A.r + B.r;
      if (!(d < R && d > 0)) continue;
      var nx = dx / d, ny = dy / d, push = (R - d) / 2;
      A.x -= nx * push; A.y -= ny * push; B.x += nx * push; B.y += ny * push;
      var vn = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
      if (vn < 0) {
        var jj = -(1 + C.E_BALL) * vn / 2;
        A.vx -= jj * nx; A.vy -= jj * ny; B.vx += jj * nx; B.vy += jj * ny;
        if (-vn >= C.BALL_HIT_MIN) S.events.push({ type: 'ball_hit', a: S.balls.indexOf(A), b: S.balls.indexOf(B), x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 });
      }
    }
    S.board.parked.forEach(function (q) {
      var ex = A.x - q.x, ey = A.y - q.y, e = Math.hypot(ex, ey), RR = A.r + q.r;
      if (e < RR + C.PARK_REACH) A.parkTouch = q.group;
      if (!(e < RR && e > 0)) return;
      if (A.def.breaksIron) { if (smash.indexOf(q.group) < 0) smash.push(q.group); smash.ball = S.balls.indexOf(A); return; }
      var mx = ex / e, my = ey / e;
      A.x = q.x + mx * RR; A.y = q.y + my * RR;
      var vm = A.vx * mx + A.vy * my;
      if (vm < 0) { A.vx -= (1 + C.E_PARKED) * vm * mx; A.vy -= (1 + C.E_PARKED) * vm * my; }
    });
  }
  smash.forEach(function (g) {
    var grp = S.board.iron[g];
    if (!grp || !grp.alive) return;
    var B = S.balls[smash.ball];
    grp.alive = false;
    S.events.push({ type: 'iron_break', id: g, ball: smash.ball, x: B.x, y: B.y, via: 'pile' });
    S.hitstop = Math.max(S.hitstop, C.HITSTOP_IRON);
    JD.releaseParked(S, g);
  });
};

// An iron ball broke group g: its parked balls drop again (straight down) as balls of the current shot.
JD.releaseParked = function (S, g) {
  var keep = [], n = 0;
  S.board.parked.forEach(function (q) {
    if (q.group !== g) { keep.push(q); return; }
    var nb = JD.newBall(q.x, q.y, 0, 0.5, q.ball); nb.bank = q.bank; S.balls.push(nb); n++;
  });
  S.board.parked = keep;
  if (n) S.events.push({ type: 'parked_release', group: g, count: n });
};

// Score = (peg points + points banked by released balls) x stage mult x bucket sum.
// Bucket sum: each landed ball adds its bucket's multiplier; lost and parked balls add 0.
// If no ball of this shot landed and some parked, the parked balls share this shot's peg points as their bank
// (paid later when they are released and land).
JD.finishShot = function (S) {
  S.board.pegs.forEach(function (p) { if (p.lit) p.alive = false; });
  S.board.mult += S.golds;
  var landed = 0, bankIn = 0;
  S.balls.forEach(function (b) { if (!b.lost && !b.parked) landed++; if (b.bank) bankIn += b.bank; });
  S.bucketSum = S.balls.reduce(function (s, b) { return s + (b.lost || b.parked ? 0 : S.bucketMult[b.bucket]); }, 0);
  var mine = S.board.parked.filter(function (q) { return q.shot === S; });
  if (!landed && mine.length) mine.forEach(function (q) { q.bank = Math.floor(S.pts / mine.length); });
  mine.forEach(function (q) { delete q.shot; });
  S.bankIn = bankIn;
  S.score = (S.pts + bankIn) * S.board.mult * S.bucketSum;
  S.finished = true;
};
