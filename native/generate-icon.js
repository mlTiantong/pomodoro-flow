const { PNG } = require('pngjs');
const fs = require('fs'), path = require('path');

const S = 256, cx = S/2, cy = S/2, R = S * 0.42;

const png = new PNG({ width: S, height: S });
const d = png.data;

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const dx = x - cx, dy = y - cy;
    const dist = Math.sqrt(dx*dx + dy*dy);

    if (dist < R) {
      // 番茄红色渐变
      const t = dist / R;
      let r = Math.round(235 - t * 25);
      let g = Math.round(105 - t * 35);
      let b = Math.round(60  - t * 30);

      // 左上高光
      const hx = dx + cx*0.25, hy = dy + cy*0.30;
      const hd = Math.sqrt(hx*hx + hy*hy);
      if (hd < R * 0.35) {
        const f = 1 - hd / (R * 0.35);
        r += Math.round(130 * f);
        g += Math.round(100 * f);
        b += Math.round(60  * f);
      }

      // 边缘稍微提亮（让圆形更立体）
      const edge = R - dist;
      if (edge < R * 0.08) {
        const f = edge / (R * 0.08);
        r += Math.round(15 * f);
        g += Math.round(15 * f);
        b += Math.round(15 * f);
      }

      d[i]   = Math.min(255, Math.max(0, r));
      d[i+1] = Math.min(255, Math.max(0, g));
      d[i+2] = Math.min(255, Math.max(0, b));
      d[i+3] = 255;
    } else {
      d[i] = d[i+1] = d[i+2] = d[i+3] = 0; // 完全透明
    }
  }
}

const outPath = path.join(__dirname, '..', 'src', 'assets', 'icons', 'icon-256.png');
const dir = path.dirname(outPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(outPath, PNG.sync.write(png));
console.log('OK: ' + outPath);
