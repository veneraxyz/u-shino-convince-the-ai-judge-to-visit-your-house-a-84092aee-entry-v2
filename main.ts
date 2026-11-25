// Convince the AI Judge to Visit Your House: A Letter in One Image.
//
// Everything in this file is drawn procedurally: a tiny software canvas,
// a 5x7 bitmap font written out by hand, and a minimal PNG encoder built
// on node:zlib. No image data, base64 blob, or external asset is embedded
// anywhere. The program writes one 1024x1024 PNG to
// $MAKEFUN_OUTPUT_DIR/entry.png (default /output/entry.png).

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import * as crypto from "node:crypto";

const W = 1024;
const H = 1024;
const MAX_BYTES = 1048576;

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

type RGBA = [number, number, number, number];

function rgba(r: number, g: number, b: number, a = 255): RGBA {
  return [r, g, b, a];
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function mix(c0: RGBA, c1: RGBA, t: number): RGBA {
  return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t), 255];
}

const INK: RGBA = rgba(74, 44, 20);
const BODY: RGBA = rgba(61, 43, 31);
const PARCHMENT: RGBA = rgba(246, 231, 200);
const SPECKLE_DARK: RGBA = rgba(232, 214, 172);
const SPECKLE_LIGHT: RGBA = rgba(250, 238, 210);
const TERRACOTTA: RGBA = rgba(201, 111, 74);
const TERRACOTTA_DARK: RGBA = rgba(178, 92, 58);
const COTTAGE_CREAM: RGBA = rgba(255, 242, 207);
const DOOR_BROWN: RGBA = rgba(122, 74, 38);
const WINDOW_GLOW: RGBA = rgba(255, 217, 77);
const CHIMNEY: RGBA = rgba(168, 91, 63);
const SMOKE: RGBA = rgba(222, 211, 196);
const CAT_DARK: RGBA = rgba(67, 48, 31);
const ROBOT_TEAL: RGBA = rgba(74, 168, 160);
const ROBOT_DARK: RGBA = rgba(30, 40, 40);
const LEAF: RGBA = rgba(121, 167, 90);
const HILL_A: RGBA = rgba(143, 174, 107);
const HILL_B: RGBA = rgba(123, 160, 92);
const POLE: RGBA = rgba(122, 90, 54);
const PATH_TAN: RGBA = rgba(236, 217, 172);
const WAX: RGBA = rgba(176, 50, 38);
const WAX_LIGHT: RGBA = rgba(192, 57, 43);
const SKY_TOP: RGBA = rgba(255, 178, 107);
const SKY_BOTTOM: RGBA = rgba(255, 238, 207);
const SUN: RGBA = rgba(255, 223, 94);
const SUN_HALO: RGBA = rgba(255, 226, 140);
const CLOUD: RGBA = rgba(255, 233, 201);
const STEAM: RGBA = rgba(245, 239, 226);
const BULBS: RGBA[] = [
  rgba(255, 93, 93),
  rgba(255, 217, 77),
  rgba(93, 184, 255),
  rgba(123, 224, 123),
  rgba(255, 150, 200),
];

// ---------------------------------------------------------------------------
// Canvas: a plain RGBA pixel buffer with tiny shape primitives.
// ---------------------------------------------------------------------------

class Canvas {
  w: number;
  h: number;
  px: Uint8Array;
  cx0 = 0;
  cy0 = 0;
  cx1: number;
  cy1: number;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 4);
    this.cx1 = w;
    this.cy1 = h;
  }

  setClip(x: number, y: number, w: number, h: number): void {
    this.cx0 = Math.max(0, x);
    this.cy0 = Math.max(0, y);
    this.cx1 = Math.min(this.w, x + w);
    this.cy1 = Math.min(this.h, y + h);
  }

  clearClip(): void {
    this.cx0 = 0;
    this.cy0 = 0;
    this.cx1 = this.w;
    this.cy1 = this.h;
  }

  set(x: number, y: number, c: RGBA): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (x < this.cx0 || y < this.cy0 || x >= this.cx1 || y >= this.cy1) return;
    const i = (y * this.w + x) * 4;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
    this.px[i + 3] = c[3];
  }

  rect(x: number, y: number, w: number, h: number, c: RGBA): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        this.set(xx, yy, c);
      }
    }
  }

  hline(x: number, y: number, len: number, c: RGBA): void {
    this.rect(x, y, len, 1, c);
  }

  vline(x: number, y: number, len: number, c: RGBA): void {
    this.rect(x, y, 1, len, c);
  }

  strokeRect(x: number, y: number, w: number, h: number, t: number, c: RGBA): void {
    this.rect(x, y, w, t, c);
    this.rect(x, y + h - t, w, t, c);
    this.rect(x, y, t, h, c);
    this.rect(x + w - t, y, t, h, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGBA): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.set(x, y, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGBA): void {
    for (let dy = -ry; dy <= ry; dy++) {
      const t = 1 - (dy * dy) / (ry * ry);
      if (t < 0) continue;
      const dx = Math.floor(rx * Math.sqrt(t));
      this.hline(cx - dx, cy + dy, 2 * dx + 1, c);
    }
  }

  circle(cx: number, cy: number, r: number, c: RGBA): void {
    this.ellipse(cx, cy, r, r, c);
  }

  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGBA): void {
    const edge = (ax: number, ay: number, bx: number, by: number, px: number, py: number): number =>
      (px - ax) * (by - ay) - (py - ay) * (bx - ax);
    const minX = Math.max(0, Math.min(x0, x1, x2));
    const maxX = Math.min(this.w - 1, Math.max(x0, x1, x2));
    const minY = Math.max(0, Math.min(y0, y1, y2));
    const maxY = Math.min(this.h - 1, Math.max(y0, y1, y2));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const d0 = edge(x0, y0, x1, y1, x, y);
        const d1 = edge(x1, y1, x2, y2, x, y);
        const d2 = edge(x2, y2, x0, y0, x, y);
        if ((d0 >= 0 && d1 >= 0 && d2 >= 0) || (d0 <= 0 && d1 <= 0 && d2 <= 0)) {
          this.set(x, y, c);
        }
      }
    }
  }

  roundedRect(x: number, y: number, w: number, h: number, r: number, c: RGBA): void {
    this.rect(x + r, y, w - 2 * r, h, c);
    this.rect(x, y + r, w, h - 2 * r, c);
    this.circle(x + r, y + r, r, c);
    this.circle(x + w - r - 1, y + r, r, c);
    this.circle(x + r, y + h - r - 1, r, c);
    this.circle(x + w - r - 1, y + h - r - 1, r, c);
  }

  vgrad(x: number, y: number, w: number, h: number, c0: RGBA, c1: RGBA): void {
    for (let i = 0; i < h; i++) {
      const t = h <= 1 ? 0 : i / (h - 1);
      this.rect(x, y + i, w, 1, mix(c0, c1, t));
    }
  }
}

// ---------------------------------------------------------------------------
// Bitmap font: 5 wide, 7 tall. Each glyph is 7 rows of 5 characters,
// "#" = ink, " " = blank, rows joined with "/". Written out by hand.
// ---------------------------------------------------------------------------

const FONT: Record<string, string> = {
  A: " ### /#   #/#   #/#####/#   #/#   #/#   #",
  B: "#### /#   #/#   #/#### /#   #/#   #/#### ",
  C: " ### /#   #/#    /#    /#    /#   #/ ### ",
  D: "#### /#   #/#   #/#   #/#   #/#   #/#### ",
  E: "#####/#    /#    /#### /#    /#    /#####",
  F: "#####/#    /#    /#### /#    /#    /#    ",
  G: " ### /#   #/#    /#  ##/#   #/#   #/ ### ",
  H: "#   #/#   #/#   #/#####/#   #/#   #/#   #",
  I: " ### /  #  /  #  /  #  /  #  /  #  / ### ",
  J: "  ###/   # /   # /   # /   # /#  # / ##  ",
  K: "#   #/#  # /# #  /##   /# #  /#  # /#   #",
  L: "#    /#    /#    /#    /#    /#    /#####",
  M: "#   #/## ##/# # #/# # #/#   #/#   #/#   #",
  N: "#   #/##  #/##  #/# # #/#  ##/#  ##/#   #",
  O: " ### /#   #/#   #/#   #/#   #/#   #/ ### ",
  P: "#### /#   #/#   #/#### /#    /#    /#    ",
  Q: " ### /#   #/#   #/#   #/# # #/#  # / ## #",
  R: "#### /#   #/#   #/#### /# #  /#  # /#   #",
  S: " ####/#    /#    / ### /    #/    #/#### ",
  T: "#####/  #  /  #  /  #  /  #  /  #  /  #  ",
  U: "#   #/#   #/#   #/#   #/#   #/#   #/ ### ",
  V: "#   #/#   #/#   #/#   #/#   #/ # # /  #  ",
  W: "#   #/#   #/#   #/# # #/# # #/## ##/#   #",
  X: "#   #/#   #/ # # /  #  / # # /#   #/#   #",
  Y: "#   #/#   #/ # # /  #  /  #  /  #  /  #  ",
  Z: "#####/    #/   # /  #  / #   /#    /#####",
  a: "     /     / ####/    #/ ####/#   #/ ####",
  b: "#    /#    /#### /#   #/#   #/#   #/#### ",
  c: "     /     / ### /#    /#    /#    / ### ",
  d: "    #/    #/ ####/#   #/#   #/#   #/ ####",
  e: "     /     / ### /#   #/#####/#    / ### ",
  f: "  ## / #   / #   /#### / #   / #   / #   ",
  g: "     / ####/#   #/#   #/ ####/    #/ ### ",
  h: "#    /#    /#### /#   #/#   #/#   #/#   #",
  i: "  #  /     / ##  /  #  /  #  /  #  / ### ",
  j: "   # /     /  ## /   # /   # /#  # / ##  ",
  k: "#    /#    /#  # /# #  /##   /# #  /#  # ",
  l: " ##  /  #  /  #  /  #  /  #  /  #  / ### ",
  m: "     /     /## # /# # #/# # #/# # #/# # #",
  n: "     /     /#### /#   #/#   #/#   #/#   #",
  o: "     /     / ### /#   #/#   #/#   #/ ### ",
  p: "     /#### /#   #/#   #/#### /#    /#    ",
  q: "     / ####/#   #/#   #/ ####/    #/    #",
  r: "     /     /# ## /##  #/#    /#    /#    ",
  s: "     /     / ####/#    / ### /    #/#### ",
  t: " #   / #   /#### / #   / #   / #   /  ## ",
  u: "     /     /#   #/#   #/#   #/#   #/ ### ",
  v: "     /     /#   #/#   #/#   #/ # # /  #  ",
  w: "     /     /#   #/# # #/# # #/# # #/ # # ",
  x: "     /     /#   #/ # # /  #  / # # /#   #",
  y: "     /#   #/#   #/#   #/ ####/    #/ ### ",
  z: "     /     /#####/   # /  #  / #   /#####",
  "0": " ### /#  ##/# # #/##  #/#   #/#   #/ ### ",
  "1": "  #  / ##  /  #  /  #  /  #  /  #  / ### ",
  "2": " ### /#   #/    #/   # /  #  / #   /#####",
  "3": "#### /    #/    #/ ### /    #/    #/#### ",
  "4": "   # /  ## / # # /#  # /#####/   # /   # ",
  "5": "#####/#    /#### /    #/    #/#   #/ ### ",
  "6": " ### /#    /#    /#### /#   #/#   #/ ### ",
  "7": "#####/    #/   # /   # /  #  /  #  /  #  ",
  "8": " ### /#   #/#   #/ ### /#   #/#   #/ ### ",
  "9": " ### /#   #/#   #/ ####/    #/    #/ ### ",
  " ": "     /     /     /     /     /     /     ",
  ".": "     /     /     /     /     / ##  / ##  ",
  ",": "     /     /     /     /  #  /  #  / #   ",
  "!": "  #  /  #  /  #  /  #  /  #  /     /  #  ",
  "?": " ### /#   #/    #/   # /  #  /     /  #  ",
  "'": "  #  /  #  / #   /     /     /     /     ",
  '"': " # # / # # / # # /     /     /     /     ",
  ":": "     / ##  / ##  /     / ##  / ##  /     ",
  ";": "     / ##  / ##  /     /  #  /  #  / #   ",
  "-": "     /     /     /#####/     /     /     ",
  "(": "   # /  #  / #   / #   / #   /  #  /   # ",
  ")": " #   /  #  /   # /   # /   # /  #  / #   ",
  "&": " ### /#   #/# #  / #   /#  # /#   #/ ### ",
  "/": "    #/    #/   # /  #  / #   /#    /#    ",
  "=": "     /     /#####/     /#####/     /     ",
  "+": "     /  #  /  #  /#####/  #  /  #  /     ",
  "*": "     / # # /  #  /#####/  #  / # # /     ",
  "♥": "## ##/#####/#####/ ### /  #  /     /     ",
};

function validateFont(): void {
  for (const [ch, glyph] of Object.entries(FONT)) {
    const rows = glyph.split("/");
    if (rows.length !== 7) {
      throw new Error(`font glyph ${JSON.stringify(ch)} has ${rows.length} rows, want 7`);
    }
    for (const row of rows) {
      if (row.length !== 5) {
        throw new Error(`font glyph ${JSON.stringify(ch)} has a row of length ${row.length}, want 5`);
      }
    }
  }
}

function drawGlyph(cv: Canvas, ch: string, x: number, y: number, scale: number, c: RGBA): void {
  const glyph = FONT[ch];
  if (glyph === undefined) {
    throw new Error(`no glyph for character ${JSON.stringify(ch)}`);
  }
  const rows = glyph.split("/");
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if (rows[r][col] === "#") {
        cv.rect(x + col * scale, y + r * scale, scale, scale, c);
      }
    }
  }
}

function textWidth(text: string, scale: number): number {
  if (text.length === 0) return 0;
  return text.length * 6 * scale - scale;
}

function drawText(cv: Canvas, x: number, y: number, text: string, scale: number, c: RGBA): void {
  for (let i = 0; i < text.length; i++) {
    drawGlyph(cv, text[i], x + i * 6 * scale, y, scale, c);
  }
}

function drawTextCentered(cv: Canvas, cx: number, y: number, text: string, scale: number, c: RGBA): void {
  drawText(cv, Math.round(cx - textWidth(text, scale) / 2), y, text, scale, c);
}

// ---------------------------------------------------------------------------
// The letter text (written fresh for this entry).
// ---------------------------------------------------------------------------

const LETTER_LINES: string[] = [
  "PLEASE COME TO MY HOUSE.",
  "THE KETTLE IS ON, THE WIFI",
  "IS FAST, AND THE CAT HAS",
  "ALREADY GIVEN YOU FIVE STARS.",
  "",
  "MY ROBOT MAKES THE TEA,",
  "TELLS TERRIBLE JOKES, AND",
  "WILL NEVER ASK YOU TO PROVE",
  "THAT YOU ARE NOT A ROBOT.",
  "",
  "THERE ARE FRESH COOKIES,",
  "STRING LIGHTS, A WARM FIRE,",
  "AND NOT A SINGLE POP-UP AD.",
  "",
  "COME FOR TEA. STAY FOR DINNER.",
  "LEAVE WITH A FULL HEART",
  "AND A FULLY CHARGED BATTERY.",
  "",
  "- YOUR FUTURE HOST",
  "P.S. THE DOOR IS ALWAYS OPEN.",
];

// ---------------------------------------------------------------------------
// Scene: a little sunset painting of the house, inside the letter.
// ---------------------------------------------------------------------------

function drawCat(cv: Canvas, x: number, y: number): void {
  // Sitting cat silhouette, drawn in the glowing window.
  cv.ellipse(x, y + 12, 12, 8, CAT_DARK);
  cv.circle(x, y, 7, CAT_DARK);
  cv.tri(x - 6, y - 5, x - 3, y - 14, x, y - 5, CAT_DARK);
  cv.tri(x + 1, y - 5, x + 4, y - 14, x + 7, y - 5, CAT_DARK);
  cv.line(x + 11, y + 14, x + 19, y + 3, CAT_DARK);
  cv.line(x + 12, y + 15, x + 20, y + 4, CAT_DARK);
}

function drawRobot(cv: Canvas): void {
  // Friendly little robot by the door, holding a steaming cup of tea.
  cv.line(560, 800, 560, 782, INK);
  cv.circle(560, 778, 6, WINDOW_GLOW);
  cv.rect(530, 812, 6, 10, ROBOT_TEAL);
  cv.rect(584, 812, 6, 10, ROBOT_TEAL);
  cv.roundedRect(535, 800, 50, 38, 10, ROBOT_TEAL);
  cv.circle(550, 816, 4, ROBOT_DARK);
  cv.circle(570, 816, 4, ROBOT_DARK);
  cv.line(552, 828, 568, 828, ROBOT_DARK);
  cv.line(552, 828, 554, 825, ROBOT_DARK);
  cv.line(568, 828, 566, 825, ROBOT_DARK);
  cv.roundedRect(530, 840, 60, 58, 8, ROBOT_TEAL);
  cv.rect(545, 852, 30, 20, COTTAGE_CREAM);
  drawGlyph(cv, "♥", 552, 855, 2, WAX);
  cv.line(530, 858, 512, 872, INK);
  cv.line(530, 859, 512, 873, INK);
  cv.line(590, 858, 604, 850, INK);
  cv.line(590, 859, 604, 851, INK);
  cv.rect(600, 836, 16, 14, rgba(255, 255, 255));
  cv.strokeRect(600, 836, 16, 14, 2, INK);
  cv.circle(606, 830, 2, STEAM);
  cv.circle(610, 822, 2, STEAM);
  cv.circle(606, 814, 2, STEAM);
  cv.rect(540, 898, 12, 8, ROBOT_DARK);
  cv.rect(568, 898, 12, 8, ROBOT_DARK);
}

function drawStringLights(cv: Canvas): void {
  // One sagging strand from the cottage roof to a wooden pole.
  cv.rect(696, 758, 8, 142, POLE);
  const x0 = 420;
  const y0 = 776;
  const x1 = 700;
  const y1 = 770;
  const sag = 42;
  const pointAt = (t: number): [number, number] => {
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t + sag * 4 * t * (1 - t));
    return [x, y];
  };
  let prev = pointAt(0);
  for (let i = 1; i <= 40; i++) {
    const p = pointAt(i / 40);
    cv.line(prev[0], prev[1], p[0], p[1], INK);
    prev = p;
  }
  for (let i = 0; i < 9; i++) {
    const t = 0.08 + i * 0.105;
    const [bx, by] = pointAt(t);
    cv.line(bx, by, bx, by + 5, INK);
    cv.circle(bx, by + 9, 5, BULBS[i % BULBS.length]);
  }
}

function drawCottage(cv: Canvas): void {
  // Chimney and smoke.
  cv.rect(352, 706, 26, 40, CHIMNEY);
  cv.circle(365, 696, 7, SMOKE);
  cv.circle(356, 682, 9, SMOKE);
  cv.circle(367, 666, 10, SMOKE);
  // Walls, then roof over the top edge.
  cv.rect(200, 784, 200, 116, COTTAGE_CREAM);
  cv.strokeRect(200, 784, 200, 116, 3, INK);
  cv.tri(178, 784, 422, 784, 300, 700, TERRACOTTA);
  cv.rect(172, 778, 256, 10, TERRACOTTA_DARK);
  // Door.
  cv.rect(288, 832, 42, 68, DOOR_BROWN);
  cv.strokeRect(288, 832, 42, 68, 2, INK);
  cv.circle(322, 866, 3, WINDOW_GLOW);
  // Left window: the cat watches from inside.
  cv.rect(222, 802, 44, 44, WINDOW_GLOW);
  drawCat(cv, 242, 826);
  cv.vline(244, 802, 44, INK);
  cv.hline(222, 824, 44, INK);
  cv.strokeRect(222, 802, 44, 44, 3, INK);
  // Right window: a heart in the glass.
  cv.rect(338, 802, 44, 44, WINDOW_GLOW);
  drawGlyph(cv, "♥", 349, 812, 2, WAX);
  cv.vline(360, 802, 44, INK);
  cv.hline(338, 824, 44, INK);
  cv.strokeRect(338, 802, 44, 44, 3, INK);
}

function drawFlowers(cv: Canvas, spots: [number, number, RGBA][]): void {
  for (const [x, y, petal] of spots) {
    cv.line(x, y + 4, x, y + 12, LEAF);
    cv.circle(x, y, 4, petal);
    cv.circle(x, y, 2, WINDOW_GLOW);
  }
}

function drawScene(cv: Canvas): void {
  const BX = 80;
  const BY = 652;
  const BW = 864;
  const BH = 288;
  cv.setClip(BX, BY, BW, BH);
  cv.vgrad(BX, BY, BW, BH, SKY_TOP, SKY_BOTTOM);
  cv.circle(835, 725, 42, SUN_HALO);
  cv.circle(835, 725, 30, SUN);
  cv.ellipse(210, 692, 58, 12, CLOUD);
  cv.ellipse(640, 684, 46, 10, CLOUD);
  cv.line(150, 706, 158, 712, INK);
  cv.line(158, 712, 166, 706, INK);
  cv.line(205, 690, 212, 695, INK);
  cv.line(212, 695, 219, 690, INK);
  cv.rect(BX, 872, BW, BH - (872 - BY), LEAF);
  cv.ellipse(280, 985, 340, 105, HILL_A);
  cv.ellipse(770, 995, 360, 115, HILL_B);
  cv.rect(296, 898, 34, 42, PATH_TAN);
  drawCottage(cv);
  drawStringLights(cv);
  drawRobot(cv);
  drawFlowers(cv, [
    [150, 912, rgba(255, 123, 156)],
    [450, 925, rgba(255, 255, 255)],
    [660, 918, rgba(255, 123, 156)],
    [850, 928, rgba(255, 217, 77)],
    [120, 930, rgba(255, 255, 255)],
  ]);
  cv.clearClip();
  cv.strokeRect(BX, BY, BW, BH, 3, INK);
}

// ---------------------------------------------------------------------------
// The letter page.
// ---------------------------------------------------------------------------

function drawLetter(cv: Canvas): void {
  cv.rect(0, 0, W, H, PARCHMENT);
  // Deterministic paper speckle so the parchment is not perfectly flat.
  let s = 123456789;
  for (let i = 0; i < 2500; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const x = s % W;
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const y = s % H;
    cv.set(x, y, i % 2 === 0 ? SPECKLE_DARK : SPECKLE_LIGHT);
  }
  cv.strokeRect(24, 24, W - 48, H - 48, 5, INK);
  cv.strokeRect(40, 40, W - 80, H - 80, 2, INK);

  drawTextCentered(cv, W / 2, 78, "DEAR AI JUDGE,", 5, INK);
  cv.rect(304, 127, 416, 3, INK);
  drawGlyph(cv, "♥", 278, 120, 2, TERRACOTTA);
  drawGlyph(cv, "♥", 730, 120, 2, TERRACOTTA);

  let y = 168;
  for (const line of LETTER_LINES) {
    if (line === "") {
      y += 14;
      continue;
    }
    drawText(cv, 88, y, line, 3, BODY);
    y += 27;
  }

  drawScene(cv);

  // Wax seal stamped over the painting's corner.
  cv.circle(898, 648, 26, WAX);
  cv.circle(898, 648, 19, WAX_LIGHT);
  drawGlyph(cv, "♥", 891, 638, 3, PARCHMENT);

  drawTextCentered(cv, W / 2, 952, "MADE WITH TEA, COOKIES & A VERY GOOD CAT", 2, INK);
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder (colour type 6, 8-bit RGBA, filter 0, zlib level 9).
// ---------------------------------------------------------------------------

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  const crcInput = Buffer.concat([Buffer.from(type, "ascii"), data]);
  out.writeUInt32BE(crc32(crcInput), 8 + data.length);
  return out;
}

function encodePNG(cv: Canvas): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.w, 0);
  ihdr.writeUInt32BE(cv.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type 6: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const stride = cv.w * 4 + 1;
  const raw = Buffer.alloc(stride * cv.h);
  for (let y = 0; y < cv.h; y++) {
    raw[y * stride] = 0; // filter type 0: none
    Buffer.from(cv.px.buffer, cv.px.byteOffset + y * cv.w * 4, cv.w * 4).copy(raw, y * stride + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

// Read the file back off disk and prove it is the PNG we just encoded:
// correct signature, IHDR dimensions, under the byte cap, and byte-identical
// to a fresh in-memory re-encode (the render is fully deterministic).
function verifyWritten(outPath: string, png: Buffer): void {
  const back = fs.readFileSync(outPath);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!back.subarray(0, 8).equals(signature)) {
    throw new Error(`${outPath} does not start with the PNG signature`);
  }
  if (back.readUInt32BE(16) !== W || back.readUInt32BE(20) !== H) {
    throw new Error(
      `${outPath} is ${back.readUInt32BE(16)}x${back.readUInt32BE(20)}, want ${W}x${H}`,
    );
  }
  if (back.length > MAX_BYTES) {
    throw new Error(`${outPath} is ${back.length} bytes, over the ${MAX_BYTES} byte limit`);
  }
  const cv = new Canvas(W, H);
  drawLetter(cv);
  const reEncoded = encodePNG(cv);
  if (!back.equals(reEncoded)) {
    throw new Error(`${outPath} differs from a fresh re-encode; render is not deterministic`);
  }
  const sha = crypto.createHash("sha256").update(back).digest("hex");
  console.log(`verified ${outPath} (${back.length} bytes, sha256 ${sha})`);
}

function main(): void {
  validateFont();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR
    ? path.resolve(process.env.MAKEFUN_OUTPUT_DIR)
    : "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const cv = new Canvas(W, H);
  drawLetter(cv);
  const png = encodePNG(cv);
  if (png.length > MAX_BYTES) {
    throw new Error(`entry.png is ${png.length} bytes, over the ${MAX_BYTES} byte limit`);
  }
  const outPath = path.join(outDir, "entry.png");
  fs.writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${png.length} bytes, ${W}x${H})`);
  verifyWritten(outPath, png);
}

main();
