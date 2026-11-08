# Tráfego Pago — Panfletagem Digital

Esteira de 5 agentes para criar, auditar, medir e administrar anúncios no Meta Ads (Facebook + Instagram).

| Agente | Arquivo | O que faz |
|---|---|---|
| Copywriter | `.claude/agents/trafego-copywriter.md` | Copy de resposta direta: 3 variações por anúncio, ganchos, títulos, CTA, compliance Meta |
| Criativos | `.claude/agents/trafego-criativos.md` | Post estático, carrossel e Reels (roteiro + prompts; gera no Canva/Higgsfield/Kairogen se conectados) |
| Concorrência | `.claude/agents/trafego-concorrencia.md` | Biblioteca de Anúncios da Meta, Google Maps, Instagram → lacunas e plano para ser melhor |
| Métricas | `.claude/agents/trafego-metricas.md` | Diagnóstico (certo / errado / corrigir) e dados para o dashboard |
| Financeiro | `.claude/agents/trafego-financeiro.md` | Divide a verba diária, desliga o pior, escala o melhor — **só executa com seu "sim"** |

## Como usar (Claude Code)

```
/trafego nova-campanha  clínica de estética na Tijuca, quero mensagens no WhatsApp
/trafego otimizar
/trafego orcamento R$6/dia
```

Ou chame um agente direto: *"use o trafego-copywriter para criar a copy da promoção de limpeza de pele"*.

1. Preencha `trafego-pago/briefing.md` (os agentes perguntam o que faltar).
2. Para ler e mexer na conta de anúncios automaticamente, conecte o **Windsor.ai** (conector `facebook`) no Claude. Sem ele, os agentes trabalham com o CSV exportado do Gerenciador de Anúncios e te passam o passo a passo.

## Dashboard

Abra `trafego-pago/dashboard.html` no navegador, informe orçamento diário e CPA alvo e carregue o CSV
(Gerenciador de Anúncios → Conjuntos de anúncios → Relatórios → Exportar dados da tabela). Ele mostra KPIs,
o diagnóstico do que corrigir e a nova divisão de orçamento. Os dados não saem do seu computador.

## Motor de orçamento

`trafego-pago/lib/regras.js` (usado pelo dashboard e pelo agente financeiro):

| Situação | Decisão |
|---|---|
| Gastou < 1x o CPA alvo | ⏳ Aprendendo — não mexe |
| Gastou 2x o CPA alvo sem resultado | ⛔ Desligar |
| CPA > 1,5x o alvo | ⛔ Desligar |
| CPA ≤ 0,8x o alvo | 🚀 Escalar (até +20% por ciclo) |
| Dentro do alvo | ✅ Manter |
| Verba não comporta todos no mínimo (R$5) | ⛔ Corta o de pior nota |

Teste no terminal:

```bash
node trafego-pago/scripts/orcamento.mjs trafego-pago/dados/exemplo-metricas.csv --orcamento 10 --cpa 15
```

Todos os limites são ajustáveis (`--minimo`, `--passo`, `--roas`) ou direto em `PADRAO` no `regras.js`.

## Pastas

- `dados/` — métricas (CSV) normalizadas
- `copies/`, `criativos/` — entregas dos agentes
- `relatorios/` — concorrência, métricas e `financeiro-log.md`
