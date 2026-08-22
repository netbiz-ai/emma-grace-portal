'use strict';
/* Generates the PWA icons (PNG) with zero dependencies.
   Draws a smiling star mascot on a pastel gradient.
   Run: node tools/make-icons.js */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

/* ---- minimal PNG encoder ---- */
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---- drawing helpers ---- */
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx, dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

// Mini the unicorn: white face, gold horn, pastel mane, on a gradient.
function makeIcon(size) {
  const S = size;
  const rgba = Buffer.alloc(S * S * 4);
  const u = f => f * S; // unit helper

  const face = { cx: u(0.5), cy: u(0.60), r: u(0.30) };
  const horn = [[u(0.5), u(0.05)], [u(0.44), u(0.32)], [u(0.56), u(0.32)]];
  const ears = [
    { cx: u(0.33), cy: u(0.28), rx: u(0.055), ry: u(0.085) },
    { cx: u(0.67), cy: u(0.28), rx: u(0.055), ry: u(0.085) }
  ];
  const mane = [
    { cx: u(0.27), cy: u(0.38), r: u(0.085), c: [0xFF, 0xC7, 0xE3] },
    { cx: u(0.21), cy: u(0.50), r: u(0.075), c: [0xD9, 0xC8, 0xFF] },
    { cx: u(0.24), cy: u(0.62), r: u(0.065), c: [0xC7, 0xE8, 0xFF] }
  ];
  const eyes = [{ cx: u(0.435), cy: u(0.57), r: u(0.026) }, { cx: u(0.565), cy: u(0.57), r: u(0.026) }];
  const cheeks = [{ cx: u(0.37), cy: u(0.66), r: u(0.035) }, { cx: u(0.63), cy: u(0.66), r: u(0.035) }];
  const smile = { cx: u(0.5), cy: u(0.63), r: u(0.055), t: u(0.009) };

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      // pastel gradient background: lavender -> pink
      const t = y / S;
      let r = Math.round(0xB8 + (0xFF - 0xB8) * t);
      let g = Math.round(0xA7 + (0x9E - 0xA7) * t);
      let b = Math.round(0xF9 + (0xC7 - 0xF9) * t);
      const set = (rr, gg, bb) => { r = rr; g = gg; b = bb; };

      for (const m of mane) if (Math.hypot(x - m.cx, y - m.cy) < m.r) set(...m.c);
      for (const e of ears) if (inEllipse(x, y, e.cx, e.cy, e.rx, e.ry)) set(0xFF, 0xFF, 0xFF);
      if (inPoly(x + 0.5, y + 0.5, horn)) set(0xFF, 0xD6, 0x5C);
      if (Math.hypot(x - face.cx, y - face.cy) < face.r) set(0xFF, 0xFF, 0xFF);
      for (const c of cheeks) if (Math.hypot(x - c.cx, y - c.cy) < c.r) set(0xFF, 0xB3, 0xD1);
      for (const e of eyes) if (Math.hypot(x - e.cx, y - e.cy) < e.r) set(0x4A, 0x3F, 0x35);
      if (Math.abs(Math.hypot(x - smile.cx, y - smile.cy) - smile.r) < smile.t &&
          y > smile.cy + smile.r * 0.1) set(0x4A, 0x3F, 0x35);

      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
    }
  }
  return encodePNG(S, S, rgba);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [512, 192, 180]) {
  const file = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, makeIcon(size));
  console.log('wrote', file);
}
