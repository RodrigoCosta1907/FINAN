/**
 * Gera os ícones do PWA (PNG) sem dependência externa.
 *   node scripts/make-icons.mjs
 * Saída: public/icons/icon-192.png, icon-512.png, maskable-512.png, apple-180.png
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const OUT = "public/icons";
const BG = [0x25, 0x63, 0xeb]; // #2563EB
const FG = [0xff, 0xff, 0xff];

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profundidade
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Desenha "F+" centrado. rect em coordenadas 0..512. */
function inShape(x, y) {
  const rect = (x0, y0, x1, y1) => x >= x0 && x < x1 && y >= y0 && y < y1;
  return (
    // F
    rect(148, 150, 192, 362) ||
    rect(148, 150, 300, 194) ||
    rect(148, 240, 276, 284) ||
    // +
    rect(320, 246, 404, 290) ||
    rect(340, 200, 384, 336)
  );
}

function build(size, { rounded }) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const scale = size / 512;
  const ss = 3; // supersampling

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let inside = 0;
      let shape = 0;

      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const x = px + (sx + 0.5) / ss;
          const y = py + (sy + 0.5) / ss;

          let inCorner = false;
          if (rounded) {
            const cx = Math.min(Math.max(x, radius), size - radius);
            const cy = Math.min(Math.max(y, radius), size - radius);
            inCorner = Math.hypot(x - cx, y - cy) <= radius;
          } else {
            inCorner = true;
          }

          if (inCorner) {
            inside += 1;
            if (inShape(x / scale, y / scale)) shape += 1;
          }
        }
      }

      const total = ss * ss;
      const index = (py * size + px) * 4;
      const alpha = Math.round((inside / total) * 255);
      const mix = inside ? shape / inside : 0;

      rgba[index] = Math.round(BG[0] * (1 - mix) + FG[0] * mix);
      rgba[index + 1] = Math.round(BG[1] * (1 - mix) + FG[1] * mix);
      rgba[index + 2] = Math.round(BG[2] * (1 - mix) + FG[2] * mix);
      rgba[index + 3] = alpha;
    }
  }

  return encodePng(size, size, rgba);
}

mkdirSync(OUT, { recursive: true });

const outputs = [
  ["icon-192.png", 192, { rounded: true }],
  ["icon-512.png", 512, { rounded: true }],
  ["maskable-512.png", 512, { rounded: false }],
  ["apple-180.png", 180, { rounded: false }],
];

for (const [name, size, options] of outputs) {
  const png = build(size, options);
  writeFileSync(`${OUT}/${name}`, png);
  console.log(`${OUT}/${name} — ${size}x${size} — ${(png.length / 1024).toFixed(1)} KB`);
}
