import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outPath = path.join(rootDir, 'assets', 'app-icon.ico');

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodeRgbaToPng(size, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = size * 4;
  const rawScanlines = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (stride + 1);
    rawScanlines[rowStart] = 0; // filter None
    rgba.copy(rawScanlines, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(rawScanlines, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function blend(dstR, dstG, dstB, srcR, srcG, srcB, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  return [
    Math.round(dstR * (1 - a) + srcR * a),
    Math.round(dstG * (1 - a) + srcG * a),
    Math.round(dstB * (1 - a) + srcB * a),
  ];
}

function renderClockIconRgba(size) {
  const buf = Buffer.alloc(size * size * 4, 0);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const half = size * 0.45;
  const corner = size * 0.22;
  const aa = Math.max(0.8, size / 128);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Signed distance to rounded squircle
      const qx = Math.abs(x - cx) - (half - corner);
      const qy = Math.abs(y - cy) - (half - corner);
      const sd =
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
        Math.min(Math.max(qx, qy), 0) -
        corner;

      if (sd > aa) continue;
      const bgAlpha = Math.max(0, Math.min(1, 0.5 - sd / (aa * 1.4)));

      // Rich slate-indigo gradient background
      const gradT = (x + y) / (2 * size);
      let r = Math.round(15 * (1 - gradT) + 36 * gradT);
      let g = Math.round(23 * (1 - gradT) + 18 * gradT);
      let b = Math.round(42 * (1 - gradT) + 68 * gradT);

      // Clock glowing ring (orange -> coral red)
      const distCenter = Math.hypot(x - cx, y - cy);
      const ringRadius = size * 0.31;
      const ringHalfWidth = Math.max(1.1, size * 0.042);
      const ringDist = Math.abs(distCenter - ringRadius);
      if (ringDist < ringHalfWidth + aa) {
        const ringAlpha = Math.max(0, Math.min(1, 1 - (ringDist - ringHalfWidth + aa * 0.5) / aa));
        const ringR = 249;
        const ringG = Math.round(115 * (1 - gradT * 0.45) + 68 * (gradT * 0.45));
        const ringB = Math.round(22 * (1 - gradT * 0.45) + 68 * (gradT * 0.45));
        [r, g, b] = blend(r, g, b, ringR, ringG, ringB, ringAlpha);
      }

      // Clock hands (hour hand pointing up-left/12, minute hand pointing right-up)
      const handWidth = Math.max(1.0, size * 0.036);
      const dHour = distToSegment(x, y, cx, cy, cx, cy - size * 0.19);
      if (dHour < handWidth + aa) {
        const ha = Math.max(0, Math.min(1, 1 - (dHour - handWidth + aa * 0.5) / aa));
        [r, g, b] = blend(r, g, b, 248, 250, 252, ha);
      }

      const dMin = distToSegment(x, y, cx, cy, cx + size * 0.16, cy + size * 0.06);
      if (dMin < handWidth * 0.9 + aa) {
        const ma = Math.max(0, Math.min(1, 1 - (dMin - handWidth * 0.9 + aa * 0.5) / aa));
        [r, g, b] = blend(r, g, b, 56, 189, 248, ma);
      }

      // Emerald completion badge in bottom-right corner
      const badgeCx = cx + size * 0.23;
      const badgeCy = cy + size * 0.23;
      const badgeR = size * 0.14;
      const dBadge = Math.hypot(x - badgeCx, y - badgeCy);
      if (dBadge < badgeR + aa) {
        const ba = Math.max(0, Math.min(1, 1 - (dBadge - badgeR + aa * 0.5) / aa));
        [r, g, b] = blend(r, g, b, 16, 185, 129, ba);

        // White checkmark inside badge
        const cThick = Math.max(0.85, size * 0.024);
        const dCheck1 = distToSegment(
          x,
          y,
          badgeCx - size * 0.055,
          badgeCy + size * 0.005,
          badgeCx - size * 0.012,
          badgeCy + size * 0.048,
        );
        const dCheck2 = distToSegment(
          x,
          y,
          badgeCx - size * 0.012,
          badgeCy + size * 0.048,
          badgeCx + size * 0.062,
          badgeCy - size * 0.042,
        );
        const dCheck = Math.min(dCheck1, dCheck2);
        if (dCheck < cThick + aa * 0.8) {
          const ca = Math.max(0, Math.min(1, 1 - (dCheck - cThick + aa * 0.4) / aa));
          [r, g, b] = blend(r, g, b, 255, 255, 255, ca);
        }
      }

      const idx = (y * size + x) * 4;
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = Math.round(bgAlpha * 255);
    }
  }

  return buf;
}

export function generateAppIcon() {
  const sizes = [16, 32, 48, 64, 256];
  const pngBuffers = sizes.map((s) => ({
    size: s,
    png: encodeRgbaToPng(s, renderClockIconRgba(s)),
  }));

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(pngBuffers.length, 4);

  const dirEntries = Buffer.alloc(16 * pngBuffers.length);
  let dataOffset = 6 + dirEntries.length;

  pngBuffers.forEach((item, idx) => {
    const entryOffset = idx * 16;
    dirEntries[entryOffset] = item.size === 256 ? 0 : item.size;
    dirEntries[entryOffset + 1] = item.size === 256 ? 0 : item.size;
    dirEntries[entryOffset + 2] = 0; // palette
    dirEntries[entryOffset + 3] = 0; // reserved
    dirEntries.writeUInt16LE(1, entryOffset + 4); // color planes
    dirEntries.writeUInt16LE(32, entryOffset + 6); // bits per pixel
    dirEntries.writeUInt32LE(item.png.length, entryOffset + 8);
    dirEntries.writeUInt32LE(dataOffset, entryOffset + 12);
    dataOffset += item.png.length;
  });

  const icoBuffer = Buffer.concat([
    header,
    dirEntries,
    ...pngBuffers.map((i) => i.png),
  ]);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, icoBuffer);
  return outPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const written = generateAppIcon();
  console.log(`Generated icon: ${written}`);
}
