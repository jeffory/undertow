// WATER-CHECK — numeric QA for the water-mood pass. Decodes a PNG (reusing the
// minimal zlib decoder from smoke.mjs) and reports:
//   mean lum (full frame), mean lum (lower 60% = water-dominant band),
//   std-dev of lum (full), and a high-frequency "facet" energy proxy computed
//   on the lower band (mean |dL| per pixel in x + y). The goal direction for a
//   pass is: water mean luminance DROPS vs the shipped lake-boat.png while
//   facet energy RISES.
// Usage: node tools/water-check.mjs <shot.png>

import zlib from 'node:zlib';

function decodePNG(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('not a PNG');
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (!width || !height) throw new Error('missing IHDR');
  if (interlace !== 0) throw new Error('unsupported interlace');
  const bpp = { 6: 4, 2: 3, 0: 1, 4: 2 }[colorType];
  if (!bpp) throw new Error(`unsupported color type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const byte = raw[p + x];
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let val;
      switch (filter) {
        case 0: val = byte; break;
        case 1: val = byte + a; break;
        case 2: val = byte + b; break;
        case 3: val = byte + ((a + b) >> 1); break;
        case 4: {
          const pa = Math.abs(b - c);
          const pb = Math.abs(a - c);
          const pc = Math.abs(a + b - 2 * c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          val = byte + pr;
          break;
        }
        default: throw new Error(`bad filter ${filter}`);
      }
      row[x] = val & 0xff;
    }
    p += stride;
  }
  const colorsPerPx = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const isGray = colorType === 0 || colorType === 4;
  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * colorsPerPx;
    if (isGray) lum[i] = out[o];
    else lum[i] = out[o] * 0.2126 + out[o + 1] * 0.7152 + out[o + 2] * 0.0722;
  }
  return { width, height, lum };
}

const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/water-check.mjs <shot.png>');
  process.exit(1);
}
const fs = await import('node:fs');
const { width, height, lum } = decodePNG(fs.readFileSync(file));

// Lower band: rows from 40% height down (water-dominant, sky excluded).
const y0 = Math.floor(height * 0.4);
function bandStats(yStart, yEnd) {
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  let edge = 0;
  let edgeN = 0;
  for (let y = yStart; y < yEnd; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const l = lum[i];
      sum += l;
      sum2 += l * l;
      n++;
      if (x + 1 < width) edge += Math.abs(lum[i + 1] - l);
      if (y + 1 < yEnd) edge += Math.abs(lum[i + width] - l);
      edgeN += 2;
    }
  }
  const mean = sum / n;
  const variance = sum2 / n - mean * mean;
  return { mean, std: Math.sqrt(Math.max(0, variance)), edgeEnergy: edge / edgeN };
}

let sum = 0;
let sum2 = 0;
for (let i = 0; i < lum.length; i++) {
  sum += lum[i];
  sum2 += lum[i] * lum[i];
}
const fullMean = sum / lum.length;
const fullStd = Math.sqrt(Math.max(0, sum2 / lum.length - fullMean * fullMean));
const band = bandStats(y0, height);
const sky = bandStats(0, Math.floor(height * 0.22));

console.log(file);
console.log(`  size ${width}x${height}`);
console.log(`  full frame  mean=${fullMean.toFixed(2)}  std=${fullStd.toFixed(2)}`);
console.log(`  sky band    mean=${sky.mean.toFixed(2)}  std=${sky.std.toFixed(2)}  edge=${sky.edgeEnergy.toFixed(3)}`);
console.log(`  water band  mean=${band.mean.toFixed(2)}  std=${band.std.toFixed(2)}  edge=${band.edgeEnergy.toFixed(3)}`);