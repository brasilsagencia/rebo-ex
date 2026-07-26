# Arquitetura — Brasil BI

> Plataforma de Business Intelligence com identidade brasileira: importa arquivos,
> trata os dados, monta dashboards interativos, analisa e exporta.

---

## 1. Decisão arquitetural

O Brasil BI foi entregue em **duas camadas**:

| Camada | Situação | O que é |
| --- | --- | --- |
| **Aplicação cliente** (`brasil-bi/`) | ✅ implementada e funcional | SPA estática, sem build step e sem dependências externas. Faz leitura de arquivos, tratamento, consultas, gráficos, análises e exportação inteiramente no navegador. |
| **Back-end** (especificado) | 📋 projetado, não implementado | Necessário para autenticação real, multiusuário, conectores (Google Sheets, bancos, APIs), agendamentos, envio de alertas e links públicos. Contrato descrito na seção 7. |

**Por que assim.** O repositório hospeda um site estático. Uma SPA sem build roda
no mesmo hosting, sem servidor, e entrega valor imediato: o usuário abre a página,
arrasta um XLSX e tem um painel. Toda a lógica de BI (parsing, tipagem, pipeline de
transformações, motor de consulta, biblioteca de gráficos, exportação) foi escrita
de forma **isolada da UI** — os mesmos módulos rodam sem alteração num back-end
Node quando ele existir.

O que o back-end habilita está listado em [ROADMAP.md](./ROADMAP.md), com a marcação
explícita do que hoje é configuração local versus o que é enforcement real.

---

## 2. Visão geral em camadas

```
┌───────────────────────────────────────────────────────────────────────┐
│  APRESENTAÇÃO                                                         │
│  index.html · app.js (shell, rotas, atalhos)                          │
│  views/*  (13 telas)   ui/tile.js   ui/feedback.js (toast/modal)      │
└───────────────┬───────────────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────────────┐
│  VISUALIZAÇÃO                                                         │
│  charts/index.js  → catálogo, contexto, cross-filter, a11y            │
│  charts/svg.js  cartesian.js  radial.js  special.js  (SVG nativo)     │
└───────────────┬───────────────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────────────┐
│  SEMÂNTICA / CONSULTA                                                 │
│  data/query.js     → runQuery, computeKpi, período, cross-filter      │
│  data/transform.js → pipeline de etapas, filtros, agregações          │
│  data/formula.js   → linguagem de fórmulas pt-BR (lexer→parser→eval)  │
└───────────────┬───────────────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────────────┐
│  INGESTÃO (ETL)                                                       │
│  data/parsers.js (CSV/TSV/TXT/JSON/XML)  data/xlsx.js  data/pdf.js    │
│  data/types.js (inferência/coerção)      data/profile.js (qualidade)  │
└───────────────┬───────────────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────────────┐
│  ESTADO E PERSISTÊNCIA                                                │
│  core/store.js (observável)   core/db.js (IndexedDB + localStorage)   │
│  core/theme.js   core/utils.js   core/icons.js                        │
└───────────────────────────────────────────────────────────────────────┘
```

### Princípios

1. **Imutabilidade da origem.** As linhas importadas nunca são alteradas. Todo
   tratamento é uma lista de etapas reaplicada sobre o original — por isso
   desfazer/refazer e desativar etapa são triviais.
2. **UI burra, núcleo esperto.** Nenhuma view calcula agregação: elas chamam
   `runQuery`/`computeKpi`. Trocar a camada de apresentação não afeta o BI.
3. **Zero dependência externa.** Sem CDN de biblioteca, sem npm em runtime.
   XLSX é descompactado com `DecompressionStream`, PDF é interpretado à mão,
   gráficos são SVG gerado. Funciona offline depois do primeiro carregamento.
4. **Honestidade de dados.** Nada entra sem prévia; leitura incerta de PDF é
   sinalizada; projeção é rotulada como projeção; dado fictício sempre carrega
   a etiqueta "demonstração".

---

## 3. Mapa de telas

| Rota (`#/`) | Tela | O que faz |
| --- | --- | --- |
| `visao-geral` | Visão geral | Grade do dashboard ativo, barra de filtros ativos, cross-filter, drag/resize, adicionar componente. |
| `dashboards` | Meus dashboards | Lista, criar, duplicar, renomear, excluir, galeria de 14 modelos. |
| `fontes` | Fontes de dados | Cartão por tabela: perfil de qualidade, prévia paginada, exportação, renomear, excluir. |
| `importar` | Importar arquivos | Dropzone, detecção de formato, seletor de aba/página/delimitador, prévia, validação, confirmação. |
| `tratamento` | Tratamento de dados | Editor tipo Power Query: menu por coluna, 18 tipos de etapa, linha do tempo, desfazer/refazer, prévia ao vivo. |
| `modelagem` | Modelagem | Diagrama arrastável, relacionamentos 1:1/1:N/N:N, sugestões por conteúdo, validação, tabela calendário. |
| `indicadores` | Indicadores | Catálogo de KPIs com meta e status, medidas calculadas, regras de alerta. |
| `relatorios` | Relatórios | PDF com cabeçalho/rodapé/logo/observações/resumo, exportação CSV/XLSX/JSON. |
| `ia` | Análises com IA | Pergunta em linguagem natural, insights, resumo executivo, recomendações. |
| `compartilhamentos` | Compartilhamentos | Links de configuração, permissões, histórico de atividades. |
| `usuarios` | Usuários e permissões | Matriz de 6 perfis, perfil local. |
| `configuracoes` | Configurações | Tema, armazenamento, backup, LGPD, notificações. |
| `ajuda` | Central de ajuda | FAQ, atalhos, documentação. |

Roteamento por hash (`#/rota?param=valor`), views carregadas sob demanda com
`import()` dinâmico — o primeiro paint carrega só o shell.

---

## 4. Fluxo do usuário

```
Primeiro acesso
   └─ Onboarding ─┬─ "Importar meu arquivo" → Importar
                  └─ "Ver demonstração"     → dados fictícios + painel pronto

Importar
   arquivo → detecta formato → lê → [aba? página? delimitador?]
          → PRÉVIA (colunas, tipos, vazios, duplicidades, amostra)
          → limpeza sugerida (opcional)
          → CONFIRMAR → dataset salvo → dashboard automático

Explorar
   Dashboard ⇄ clique em gráfico = cross-filter global
            ⇄ Filtros (listas, intervalos, período)
            ⇄ IA (pergunta → resposta + gráfico sugerido)

Refinar
   Tratamento (etapas) → Modelagem (relacionar) → Indicadores (metas/alertas)

Entregar
   Relatórios (PDF/XLSX/CSV) · Compartilhamentos (link)
```

---

## 5. Módulos e responsabilidades

### `core/`
- **store.js** — estado único observável. Mutação só via `update(mutator)`, que
  persiste (debounce 220 ms) e notifica assinantes. Guarda metadados, dashboards,
  filtros, alertas, trilha de atividade. **Não** guarda linhas de dados.
- **db.js** — IndexedDB para linhas (chave = `datasetId`), localStorage para
  configuração. Degrada para memória com aviso ao usuário se a cota estourar.
- **theme.js** — tema claro/escuro/automático + paletas de série, sequencial e
  divergente resolvidas do CSS atual.
- **utils.js** — DOM declarativo (`el`), formatação pt-BR (moeda, percentual,
  data, compacto), parsing tolerante (`parseNumberLoose`, `toDate`), estatística
  (média, mediana, quantil, desvio, regressão linear).

### `data/`
- **types.js** — inferência de tipo por amostra + nome (`Faturamento` → moeda,
  `Data` → data, `Taxa` → percentual, `id` → identificador, não medida).
- **parsers.js** — CSV com aspas/quebras internas/BOM, delimitador farejado por
  consistência entre linhas, detecção da linha de cabeçalho, JSON (incl. NDJSON e
  achatamento de objetos), XML (descobre o nó-registro repetido), TXT largura fixa.
- **xlsx.js** — leitor ZIP (diretório central + `DecompressionStream("deflate-raw")`),
  `sharedStrings`, `styles` (para reconhecer datas por `numFmt`), planilhas com
  referências `A1`. Também escreve XLSX simples para exportação.
- **pdf.js** — indexa objetos, infla streams FlateDecode, lê o content stream
  interpretando `BT/ET/Tm/Td/TD/T*/Tj/TJ/'/"`, aplica `ToUnicode` por fonte,
  agrupa fragmentos em linhas por Y e em colunas por clusters de X, calcula
  confiança e detecta páginas digitalizadas.
- **profile.js** — perfil por coluna (vazios, distintos, min/média/máx, p95,
  outliers 3σ, histograma, top valores), duplicidades, lista de problemas e nota.
- **transform.js** — 18 etapas serializáveis, filtros (12 operadores),
  9 agregações, comparação tipada para ordenação.
- **formula.js** — tokenizer → parser recursivo descendente → avaliador, com 30
  funções em português e explicação da fórmula em linguagem natural.
- **query.js** — `resolveDataset` (memoiza transformações por assinatura),
  `runQuery` (dimensão + granularidade de data + breakdown + N medidas + limite +
  "Outros"), `computeKpi` (período anterior, tendência, meta, sparkline),
  `applyContext` (filtros globais + seleção + período).

### `charts/`
- **svg.js** — escalas linear/banda, domínios "bonitos", eixos, caminhos
  (linha, área, arco, retângulo arredondado), tooltip global.
- **cartesian.js / radial.js / special.js** — 27 tipos de visualização.
- **index.js** — catálogo com requisitos (dimensão? quantas medidas? breakdown?),
  contexto de renderização, cross-filter, legenda com toggle, resumo textual
  acessível e cartão de KPI.

### `ai/`
- **insights.js** — tendência (regressão), anomalias (2σ), quedas recentes,
  concentração/Pareto, correlação, atualidade dos dados, problemas de qualidade;
  resumo executivo e recomendações. Cada item traz `evidence`:
  `fato | correlacao | projecao | alerta`.
- **nlq.js** — interpreta a pergunta (sinônimos de medida/dimensão, expressões de
  tempo, intenções) e devolve uma intenção estruturada + tile pronto.

---

## 6. Interatividade e estado de filtro

Três níveis, combinados por AND (valores do mesmo campo em OR):

1. **Período** — `state.period` (preset ou intervalo) aplicado sobre o campo de
   data escolhido.
2. **Filtros globais** — `state.filters.global`, persistidos.
3. **Seleção (cross-filter)** — `state.filters.selection`, efêmera, gerada por
   clique em elemento de gráfico. O tile de origem é marcado (`sourceTile`) e não
   se autofiltra, preservando o contexto visual da seleção.

Clique em barra/fatia/célula → `selectionFilterFor()` cria o filtro (para datas,
um `dateRange` do balde clicado) → `toggleSelection` → store notifica → a visão
geral redesenha os tiles.

---

## 7. Back-end projetado (não implementado)

```
apps/
  web/        Next.js 15 + React + TypeScript + Tailwind + shadcn/ui
  api/        NestJS — REST (+ GraphQL opcional)
  worker/     Filas (BullMQ/Redis) para arquivos grandes, agendamentos e alertas
  etl/        Serviço Python (FastAPI): Pandas/Polars/DuckDB, OpenPyXL,
              pdfplumber/Camelot + Tesseract (OCR)
packages/
  core/       Reaproveita types.js, transform.js, formula.js, query.js
  charts/     Reaproveita a biblioteca SVG
infra/        Postgres, Redis, S3 compatível, OpenTelemetry, CI/CD
```

**Contrato de API previsto**

| Método | Rota | Descrição |
| --- | --- | --- |
| `POST` | `/uploads` | Upload assinado (S3), devolve `fileId` |
| `POST` | `/datasets/preview` | Lê o arquivo e devolve colunas, tipos e amostra |
| `POST` | `/datasets` | Confirma a importação (grava linhas em Postgres/Parquet) |
| `GET` | `/datasets/:id/rows` | Paginação/virtualização server-side |
| `POST` | `/datasets/:id/transforms` | Salva o pipeline; recalcula em background |
| `POST` | `/query` | Executa `QuerySpec` (mesmo formato de `runQuery`) via DuckDB |
| `CRUD` | `/dashboards`, `/tiles`, `/alerts`, `/shares` | Objetos de configuração |
| `POST` | `/connectors/:tipo/sync` | Google Sheets, Postgres, MySQL, APIs |
| `WS` | `/live` | Progresso de importação e disparo de alertas |

**Por que o cálculo migra bem.** `runQuery` recebe `{rows, fields}` e um
`QuerySpec` declarativo. No servidor, o mesmo `QuerySpec` vira SQL do DuckDB sobre
Parquet — a assinatura pública não muda, só a implementação.

---

## 8. Desempenho

| Técnica | Onde |
| --- | --- |
| Memoização por assinatura do pipeline | `resolveDataset` — só recalcula quando as etapas mudam |
| Renderização adiada (`requestAnimationFrame`) | Tiles medem o SVG depois do layout |
| Skeleton loading | Cada tile enquanto resolve os dados |
| Paginação e limite | Prévia de fonte (50/página), tabela (200 linhas), amostras de 300–800 linhas para inferência |
| Debounce | Persistência (220 ms), busca (220 ms), resize (320 ms), validação de fórmula (220 ms) |
| Import dinâmico por rota | Cada view só é baixada quando aberta |
| Processamento em lotes | `chunked()` devolve o controle ao browser entre fatias |

Referência medida no ambiente de teste: ~1.700 linhas × 20 colunas de
demonstração renderizam 14 componentes em menos de 1 s após o carregamento.

---

## 9. Acessibilidade

- Foco visível padronizado, `skip link`, `aria-label` em todos os controles.
- Cada elemento de gráfico é focável (`tabindex`), ativável por Enter/Espaço e
  descrito por `aria-label`.
- Cada gráfico publica um **resumo textual** (`.viz__summary`) com quantidade de
  categorias, maior, menor e participação — alternativa real ao visual.
- Status nunca dependem só de cor: sempre acompanham ícone + rótulo textual.
- Paletas com luminâncias distintas, contraste AA nos textos em ambos os temas.
- `prefers-reduced-motion` desliga animações.
