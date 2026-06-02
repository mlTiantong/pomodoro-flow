const https = require('https');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SVG_URL = 'https://raw.githubusercontent.com/googlefonts/noto-emoji/main/svg/emoji_u1f345.svg';
const OUT_DIR = path.join(__dirname, '..', 'src', 'assets', 'icons');
const OUT_PNG = path.join(OUT_DIR, 'icon-256.png');

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // 下载 SVG
  console.log('Downloading SVG...');
  const svgBuffer = await new Promise((resolve, reject) => {
    https.get(SVG_URL, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
  });

  // 用 sharp 渲染为 256x256 PNG（透明背景）
  const pngBuffer = await sharp(svgBuffer)
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  fs.writeFileSync(OUT_PNG, pngBuffer);
  console.log('OK: ' + OUT_PNG + ' (' + pngBuffer.length + ' bytes)');
}

main().catch(e => { console.error(e); process.exit(1); });
