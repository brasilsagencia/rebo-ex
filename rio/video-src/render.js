// Renderiza scenes.html quadro a quadro e gera o MP4 do hero + as imagens da galeria.
// Uso: node render.js [--preview]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const FPS = 25;
const OUT = path.join(__dirname, '..', 'media');
const preview = process.argv.includes('--preview');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('file://' + path.join(__dirname, 'scenes.html'));
  await page.evaluate(() => document.fonts.ready);

  const slugs = ['pao-de-acucar', 'copacabana', 'bondinho', 'lapa', 'lagoa', 'sambodromo', 'jockey', 'maracana', 'aterro', 'barra'];

  // Imagens da galeria (sem legenda, meio de cada cena)
  for (let i = 0; i < slugs.length; i++) {
    await page.evaluate(i => window.showScene(i), i);
    await page.screenshot({ path: path.join(OUT, `${slugs[i]}.jpg`), type: 'jpeg', quality: 86 });
  }
  if (preview) { await browser.close(); return; }

  const duration = await page.evaluate(() => window.DURATION);
  const frames = Math.round(duration * FPS);
  const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'slow', '-movflags', '+faststart',
    path.join(OUT, 'rio-verao.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });

  for (let f = 0; f < frames; f++) {
    await page.evaluate(t => window.render(t, { noCaption: true }), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f === 0) require('fs').writeFileSync(path.join(OUT, 'rio-verao-poster.jpg'), buf);
    if (f % 100 === 0) console.log(`quadro ${f}/${frames}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
})();
