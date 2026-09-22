// 生成「客服」耳机图标 (service.png / service-active.png)
// 与既有 tabBar 图标一致：81x81 RGBA PNG，未选中=灰色描边，选中=黑色填充
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const SIZE = 81;
const SCALE = 4;
const HS = SIZE * SCALE; // 324

// CRC32 (table-less)
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(rgba, w, h) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  // compression/filter/interlace = 0
  const raw = Buffer.alloc((w * 4 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0; // filter none
    rgba.copy(raw, o, y * w * 4, (y + 1) * w * 4);
    o += w * 4;
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 形状判定（输入 81x81 归一坐标）
function inside(px, py) {
  const hdx = px - 40.5, hdy = py - 42;
  const hr = Math.hypot(hdx, hdy);
  const headband = hr >= 19 && hr <= 28 && py <= 44;
  const ldx = px - 16, ldy = py - 52;
  const leftPad = (ldx * ldx) / (11 * 11) + (ldy * ldy) / (15 * 15) <= 1;
  const rdx = px - 65, rdy = py - 52;
  const rightPad = (rdx * rdx) / (11 * 11) + (rdy * rdy) / (15 * 15) <= 1;
  return headband || leftPad || rightPad;
}

// 高分辨率掩码（布尔，含 4x 超采样）
function renderFilledMask() {
  const mask = new Uint8Array(HS * HS);
  for (let y = 0; y < HS; y++) {
    for (let x = 0; x < HS; x++) {
      mask[y * HS + x] = inside(x / SCALE + 0.5 / SCALE, y / SCALE + 0.5 / SCALE) ? 1 : 0;
    }
  }
  return mask;
}

// 盒式腐蚀：像素需在其 R 半径邻域内全部为填充，才视为「内部」
function erode(mask, R) {
  const out = new Uint8Array(HS * HS);
  for (let y = 0; y < HS; y++) {
    for (let x = 0; x < HS; x++) {
      const idx = y * HS + x;
      if (!mask[idx]) continue;
      let ok = true;
      for (let dy = -R; dy <= R && ok; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= HS) { ok = false; break; }
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= HS) { ok = false; break; }
          if (!mask[yy * HS + xx]) { ok = false; break; }
        }
      }
      if (ok) out[idx] = 1;
    }
  }
  return out;
}

// 4x 盒式下采样得到 [0,1] 覆盖率
function downsample(mask) {
  const cov = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let s = 0;
      for (let sy = 0; sy < SCALE; sy++) {
        for (let sx = 0; sx < SCALE; sx++) {
          s += mask[(y * SCALE + sy) * HS + (x * SCALE + sx)];
        }
      }
      cov[y * SIZE + x] = s / (SCALE * SCALE);
    }
  }
  return cov;
}

function toRGBA(cov, r, g, b) {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const a = Math.round(cov[i] * 255);
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
}

const filled = renderFilledMask();
const eroded = erode(filled, 12); // 约 3px 描边
const boundary = new Uint8Array(HS * HS);
for (let i = 0; i < HS * HS; i++) boundary[i] = filled[i] && !eroded[i] ? 1 : 0;

const iconDir = path.join(__dirname, '..', 'miniprogram', 'assets', 'icons');

// 未选中：灰色描边 #8A8D93 (138,141,147)
fs.writeFileSync(
  path.join(iconDir, 'service.png'),
  encodePNG(toRGBA(downsample(boundary), 138, 141, 147), SIZE, SIZE)
);
// 选中：黑色填充 #111111 (17,17,17)
fs.writeFileSync(
  path.join(iconDir, 'service-active.png'),
  encodePNG(toRGBA(downsample(filled), 17, 17, 17), SIZE, SIZE)
);

console.log('生成完成：service.png / service-active.png');
