#!/usr/bin/env node
// Fábrica: renderiza um ou mais briefs em MP4 compatível com Meta Ads / Instagram / WhatsApp.
//   npm run render                               -> todos os briefs/*.json
//   npm run render -- briefs/meu-pedido.json     -> só um pedido
// Usa a API do Remotion (sem chamar "npx"), então funciona igual em Windows, macOS e Linux.
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {existsSync, mkdirSync, readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const briefs = args.length
  ? args.map((a) => path.resolve(a))
  : readdirSync(path.join(raiz, 'briefs')).filter((f) => f.endsWith('.json')).map((f) => path.join(raiz, 'briefs', f));

// Em ambientes sem internet, aponta para um Chrome já instalado (opcional).
const chrome = process.env.REMOTION_CHROME ?? ['/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'].find(existsSync);

const saidaDir = path.join(raiz, 'out');
mkdirSync(saidaDir, {recursive: true});

console.log('Empacotando o projeto...');
const serveUrl = await bundle({entryPoint: path.join(raiz, 'src', 'index.ts')});

for (const arq of briefs) {
  const brief = JSON.parse(readFileSync(arq, 'utf8'));
  const saida = path.join(saidaDir, `${brief.id}.mp4`);
  console.log(`\n▶ ${brief.id}  (template: ${brief.template})`);
  const composition = await selectComposition({serveUrl, id: brief.template, inputProps: brief.props, browserExecutable: chrome});
  let ultimo = -1;
  await renderMedia({
    serveUrl,
    composition,
    inputProps: brief.props,
    codec: 'h264',
    crf: 20,
    pixelFormat: 'yuv420p', // obrigatório para tocar em iPhone, WhatsApp e no Gerenciador de Anúncios
    colorSpace: 'bt709',
    imageFormat: 'jpeg',
    jpegQuality: 95,
    enforceAudioTrack: true, // faixa de áudio silenciosa: alguns uploaders recusam vídeo sem áudio
    audioCodec: 'aac',
    outputLocation: saida,
    browserExecutable: chrome,
    onProgress: ({progress}) => {
      const p = Math.floor(progress * 10);
      if (p !== ultimo) { ultimo = p; process.stdout.write(`${p * 10}% `); }
    },
  });
  console.log(`\n✔ ${saida}`);
}
