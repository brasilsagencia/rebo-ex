#!/usr/bin/env node
/*
 * Agente financeiro — cálculo do orçamento.
 *
 * Uso:
 *   node trafego-pago/scripts/orcamento.mjs <metricas.csv|metricas.json> --orcamento 10 --cpa 15 [--roas 0] [--minimo 5] [--passo 0.2] [--json]
 *
 * Lê as métricas, aplica trafego-pago/lib/regras.js e imprime o plano:
 * quem desligar, quem manter, quem escalar e o novo orçamento diário de cada um.
 * NÃO altera nada na conta de anúncios.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Regras = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'regras.js'));

const args = process.argv.slice(2);
const arquivo = args.find((a) => !a.startsWith('--') && !/^[\d.]+$/.test(a));
const opt = (nome) => {
  const i = args.indexOf('--' + nome);
  return i > -1 ? args[i + 1] : undefined;
};

if (!arquivo) {
  console.error('Uso: node trafego-pago/scripts/orcamento.mjs <metricas.csv|json> --orcamento 10 --cpa 15');
  process.exit(1);
}

const texto = readFileSync(arquivo, 'utf8');
const linhas = arquivo.endsWith('.json') ? JSON.parse(texto) : Regras.lerCsv(texto);

const r = Regras.analisar(linhas, {
  orcamentoDiarioTotal: opt('orcamento'),
  cpaAlvo: opt('cpa'),
  roasMinimo: opt('roas'),
  minimoPorConjunto: opt('minimo'),
  passoEscala: opt('passo'),
});

if (args.includes('--json')) {
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}

const brl = (v) => (v === null || v === undefined ? '—' : 'R$ ' + v.toFixed(2).replace('.', ','));
const rotulo = { desligar: '⛔ DESLIGAR', escalar: '🚀 ESCALAR', manter: '✅ MANTER', aprendendo: '⏳ APRENDENDO' };

console.log(`\nPLANO DE ORÇAMENTO — ${brl(r.config.orcamentoDiarioTotal)}/dia | CPA alvo ${brl(r.config.cpaAlvo)}\n`);
for (const i of [...r.itens].sort((a, b) => b.pontuacao - a.pontuacao)) {
  console.log(`${rotulo[i.decisao.acao]}  ${i.nome}`);
  console.log(`   nota ${i.pontuacao} | gasto ${brl(i.gasto)} | resultados ${i.resultados} | CPA ${brl(i.cpa)} | CTR ${i.ctr?.toFixed(2) ?? '—'}%`);
  console.log(`   orçamento: ${brl(i.orcamentoDiario)} → ${brl(i.orcamentoNovo)}  (${i.decisao.motivo})\n`);
}
console.log(`Alocado: ${brl(r.distribuicao.alocado)} | Reserva: ${brl(r.distribuicao.reserva)}`);
r.alertas.forEach((a) => console.log('⚠️  ' + a));
console.log('\nNada foi alterado na conta. Confirme o plano para o agente executar.\n');
