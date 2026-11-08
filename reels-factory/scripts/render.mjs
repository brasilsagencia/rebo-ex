#!/usr/bin/env node
// Fábrica: renderiza um ou mais briefs.  Uso:
//   node scripts/render.mjs                      -> todos os briefs/*.json
//   node scripts/render.mjs briefs/meu-pedido.json
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const args = process.argv.slice(2);
const arquivos = args.length ? args : readdirSync('briefs').filter((f) => f.endsWith('.json')).map((f) => join('briefs', f));
mkdirSync('out', {recursive: true});

const browser = ['/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'].find(existsSync);

for (const arq of arquivos) {
  const brief = JSON.parse(readFileSync(arq, 'utf8'));
  const props = join('out', `${brief.id}.props.json`);
  writeFileSync(props, JSON.stringify(brief.props));
  const saida = join('out', `${brief.id}.mp4`);
  console.log(`\n▶ ${brief.id}  (template: ${brief.template})`);
  execFileSync(
    'npx',
    ['remotion', 'render', 'src/index.ts', brief.template, saida, `--props=${props}`, '--codec=h264', '--crf=18', ...(browser ? [`--browser-executable=${browser}`] : [])],
    {stdio: 'inherit'},
  );
  console.log(`✔ ${saida}`);
}
