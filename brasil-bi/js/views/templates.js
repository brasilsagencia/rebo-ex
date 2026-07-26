/**
 * Brasil BI — modelos de dashboard e montagem automática.
 *
 * `buildAutoDashboard` monta um painel executivo a partir de qualquer dataset,
 * escolhendo medidas, dimensões e campo de data pelas características dos
 * campos. Os modelos temáticos usam palavras-chave para priorizar campos e
 * caem no automático quando não encontram correspondência.
 */

import { uid, norm } from "../core/utils.js";
import { createDashboard } from "../core/store.js";
import { NUMERIC_TYPES, TEMPORAL_TYPES, defaultAgg } from "../data/types.js";

export const TEMPLATES = [
  { id: "vendas", name: "Vendas", icon: "kpi", description: "Faturamento, ticket médio, ranking de produtos e desempenho por vendedor.", measures: ["faturamento", "receita", "valor", "lucro"], dims: ["produto", "vendedor", "categoria", "canal"] },
  { id: "marketing", name: "Marketing", icon: "sparkles", description: "Leads, custo por aquisição, conversão por canal e campanha.", measures: ["lead", "investimento", "custo", "conversao"], dims: ["canal", "campanha", "origem"] },
  { id: "financeiro", name: "Financeiro", icon: "reports", description: "Receitas, despesas, margem e evolução do resultado.", measures: ["receita", "despesa", "custo", "lucro", "margem"], dims: ["categoria", "centro", "conta"] },
  { id: "comercial", name: "Comercial", icon: "trendUp", description: "Funil, propostas, taxa de fechamento e metas por equipe.", measures: ["quantidade", "valor", "proposta"], dims: ["etapa", "equipe", "vendedor"] },
  { id: "redes-sociais", name: "Redes sociais", icon: "share", description: "Alcance, engajamento e crescimento por rede.", measures: ["alcance", "engajamento", "seguidores", "impressoes"], dims: ["rede", "formato", "post"] },
  { id: "gmb", name: "Google Meu Negócio", icon: "map", description: "Visualizações, cliques, chamadas e rotas por unidade.", measures: ["visualizacoes", "cliques", "chamadas", "rotas"], dims: ["unidade", "cidade"] },
  { id: "trafego-pago", name: "Tráfego pago", icon: "target", description: "Investimento, CPC, CPA, ROAS e desempenho por campanha.", measures: ["investimento", "cliques", "conversoes", "custo"], dims: ["campanha", "canal", "anuncio"] },
  { id: "rh", name: "Recursos humanos", icon: "users", description: "Headcount, turnover, admissões e desligamentos.", measures: ["salario", "quantidade", "horas"], dims: ["departamento", "cargo", "unidade"] },
  { id: "atendimento", name: "Atendimento", icon: "help", description: "Chamados, tempo de resposta, satisfação e backlog.", measures: ["tempo", "chamados", "nota"], dims: ["fila", "canal", "atendente", "status"] },
  { id: "estoque", name: "Estoque", icon: "layers", description: "Saldo, giro, ruptura e curva ABC.", measures: ["quantidade", "saldo", "valor"], dims: ["produto", "deposito", "categoria"] },
  { id: "projetos", name: "Projetos", icon: "grid", description: "Entregas, prazos, horas e status por responsável.", measures: ["horas", "custo", "progresso"], dims: ["projeto", "responsavel", "status"] },
  { id: "igrejas", name: "Igrejas e ministérios", icon: "users", description: "Frequência, contribuições, células e eventos.", measures: ["valor", "quantidade", "frequencia"], dims: ["ministerio", "celula", "evento"] },
  { id: "campanhas", name: "Campanhas", icon: "sparkles", description: "Resultado por campanha, período e público.", measures: ["valor", "conversoes", "investimento"], dims: ["campanha", "publico", "criativo"] },
  { id: "operacao", name: "Operação de equipes", icon: "users", description: "Produtividade, SLA e volume por equipe.", measures: ["quantidade", "tempo", "produtividade"], dims: ["equipe", "turno", "unidade"] },
];

function scoreField(field, keywords) {
  const name = norm(field.label || field.name);
  let score = 0;
  keywords.forEach((key, i) => {
    if (name.includes(norm(key))) score += 10 - i;
  });
  return score;
}

/** Escolhe as melhores medidas do dataset (priorizando palavras-chave). */
export function pickMeasures(fields, keywords = [], max = 4) {
  return fields
    .filter((f) => NUMERIC_TYPES.has(f.type) && f.role === "measure")
    .map((f) => ({ field: f, score: scoreField(f, keywords) + (f.type === "currency" ? 3 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.field);
}

/** Escolhe dimensões categóricas com cardinalidade útil. */
export function pickDims(fields, keywords = [], max = 4) {
  return fields
    .filter((f) => (f.role === "dimension" || f.role === "id") && !TEMPORAL_TYPES.has(f.type))
    .filter((f) => (f.distinct ?? 2) >= 2 && (f.distinct ?? 2) <= 400)
    .map((f) => ({
      field: f,
      score: scoreField(f, keywords) + (f.distinct <= 12 ? 4 : f.distinct <= 40 ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.field);
}

export function pickDateField(fields) {
  return fields.find((f) => TEMPORAL_TYPES.has(f.type)) || null;
}

const tile = (config) => ({ id: uid("tile"), options: {}, ...config });

/**
 * Monta um dashboard executivo a partir de um dataset qualquer.
 * @param {Object} dataset metadados
 * @param {Array} rows linhas (para estatísticas rápidas)
 * @param {{template?:string, name?:string}} [opts]
 */
export function buildAutoDashboard(dataset, rows, opts = {}) {
  const templateDef = TEMPLATES.find((t) => t.id === opts.template);
  const fields = dataset.fields || [];
  const measures = pickMeasures(fields, templateDef?.measures || []);
  const dims = pickDims(fields, templateDef?.dims || []);
  const dateField = pickDateField(fields);
  const tiles = [];

  // Linha 1 — cartões
  const kpiFields = measures.slice(0, 4);
  for (const field of kpiFields) {
    tiles.push(
      tile({
        type: "kpi",
        datasetId: dataset.id,
        title: field.label || field.name,
        measures: [{ field: field.name, agg: defaultAgg(field) }],
        options: { higherIsBetter: !/custo|despesa|churn|cancel/i.test(field.name) },
        layout: { col: 3, h: 2 },
      })
    );
  }
  if (dims[0]) {
    tiles.push(
      tile({
        type: "kpi",
        datasetId: dataset.id,
        title: `${dims[0].label || dims[0].name} distintos`,
        measures: [{ field: dims[0].name, agg: "countDistinct" }],
        layout: { col: 3, h: 2 },
      })
    );
  }
  tiles.push(
    tile({
      type: "kpi",
      datasetId: dataset.id,
      title: "Registros",
      measures: [{ field: fields[0]?.name || "*", agg: "count" }],
      layout: { col: 3, h: 2 },
    })
  );

  // Linha 2 — evolução + composição
  if (dateField && measures[0]) {
    tiles.push(
      tile({
        type: measures[1] ? "combo" : "area",
        datasetId: dataset.id,
        title: `Evolução de ${(measures[0].label || measures[0].name).toLowerCase()}`,
        dimension: dateField.name,
        grain: "month",
        measures: measures.slice(0, 2).map((f) => ({ field: f.name, agg: defaultAgg(f) })),
        options: { showLegend: true, lineSeries: [1] },
        layout: { col: 8, h: 3 },
      })
    );
  }
  if (dims[0] && measures[0]) {
    tiles.push(
      tile({
        type: "donut",
        datasetId: dataset.id,
        title: `${measures[0].label || measures[0].name} por ${(dims[0].label || dims[0].name).toLowerCase()}`,
        dimension: dims[0].name,
        measures: [{ field: measures[0].name, agg: defaultAgg(measures[0]) }],
        limit: 8,
        options: { centerLabel: "Total" },
        layout: { col: 4, h: 3 },
      })
    );
  }

  // Linha 3 — ranking, geografia e comparação
  const ufField = fields.find((f) => /estado|uf$|^uf|regiao|região/i.test(f.name));
  if (ufField && measures[0]) {
    tiles.push(
      tile({
        type: "ufmap",
        datasetId: dataset.id,
        title: `${measures[0].label || measures[0].name} por estado`,
        dimension: ufField.name,
        measures: [{ field: measures[0].name, agg: defaultAgg(measures[0]) }],
        layout: { col: 4, h: 3 },
      })
    );
  }
  if (dims[1] && measures[0]) {
    tiles.push(
      tile({
        type: "bar",
        datasetId: dataset.id,
        title: `Ranking por ${(dims[1].label || dims[1].name).toLowerCase()}`,
        dimension: dims[1].name,
        measures: [{ field: measures[0].name, agg: defaultAgg(measures[0]) }],
        limit: 10,
        layout: { col: 4, h: 3 },
      })
    );
  }
  if (dims[2] && measures[0]) {
    tiles.push(
      tile({
        type: "columnStacked",
        datasetId: dataset.id,
        title: `${measures[0].label || measures[0].name} por ${(dims[2].label || dims[2].name).toLowerCase()}`,
        dimension: dims[2].name,
        breakdown: dims[0]?.name !== dims[2].name ? dims[0]?.name : undefined,
        measures: [{ field: measures[0].name, agg: defaultAgg(measures[0]) }],
        limit: 12,
        layout: { col: 4, h: 3 },
      })
    );
  }

  // Linha 4 — detalhe
  tiles.push(
    tile({
      type: "table",
      datasetId: dataset.id,
      title: "Registros detalhados",
      options: { rowLimit: 100 },
      layout: { col: 12, h: 4 },
    })
  );

  return createDashboard({
    name: opts.name || `${templateDef ? `${templateDef.name} — ` : ""}${dataset.name}`,
    description: templateDef?.description || "Painel gerado automaticamente a partir da fonte importada.",
    template: opts.template || "auto",
    datasetId: dataset.id,
    tiles,
  });
}

/** Sugestões de componentes para o editor, com base nos campos disponíveis. */
export function suggestTiles(dataset) {
  const fields = dataset.fields || [];
  const measures = pickMeasures(fields, [], 3);
  const dims = pickDims(fields, [], 3);
  const dateField = pickDateField(fields);
  const out = [];

  if (measures[0]) {
    out.push({ label: `KPI de ${measures[0].label}`, type: "kpi", measures: [{ field: measures[0].name, agg: defaultAgg(measures[0]) }] });
  }
  if (dateField && measures[0]) {
    out.push({
      label: `Evolução mensal de ${measures[0].label}`,
      type: "line",
      dimension: dateField.name,
      grain: "month",
      measures: [{ field: measures[0].name, agg: defaultAgg(measures[0]) }],
    });
  }
  for (const dim of dims) {
    if (!measures[0]) break;
    out.push({
      label: `${measures[0].label} por ${dim.label}`,
      type: dim.distinct <= 8 ? "donut" : "bar",
      dimension: dim.name,
      limit: 10,
      measures: [{ field: measures[0].name, agg: defaultAgg(measures[0]) }],
    });
  }
  return out.slice(0, 6);
}
