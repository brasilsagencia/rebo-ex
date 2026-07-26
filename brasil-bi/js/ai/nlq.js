/**
 * Brasil BI — perguntas em linguagem natural (pt-BR).
 *
 * Interpretação local por palavras-chave e correspondência com os campos do
 * dataset. Devolve uma intenção estruturada que a interface transforma em
 * resposta textual e/ou gráfico. Quando não entende, diz o que não entendeu e
 * sugere reformulações — nunca inventa números.
 */

import { norm, uid } from "../core/utils.js";
import { NUMERIC_TYPES, TEMPORAL_TYPES } from "../data/types.js";

const MEASURE_SYNONYMS = [
  { keys: ["faturamento", "receita", "faturou", "vendas", "venda", "valor vendido", "billing"], match: ["faturamento", "receita", "valor", "venda", "total"] },
  { keys: ["lucro", "resultado", "margem"], match: ["lucro", "margem", "resultado"] },
  { keys: ["custo", "custos", "despesa", "despesas", "gasto"], match: ["custo", "despesa", "gasto"] },
  { keys: ["ticket medio", "ticket"], match: ["faturamento", "valor", "receita"], agg: "avg" },
  { keys: ["cliente", "clientes"], match: ["cliente"], agg: "countDistinct" },
  { keys: ["pedido", "pedidos", "vendas realizadas"], match: ["pedido", "id"], agg: "countDistinct" },
  { keys: ["quantidade", "unidades", "volume"], match: ["quantidade", "qtd"] },
  { keys: ["lead", "leads"], match: ["lead", "quantidade"] },
  { keys: ["conversao", "taxa de conversao"], match: ["conversao", "taxa"] },
];

const DIMENSION_SYNONYMS = [
  { keys: ["estado", "estados", "uf", "regiao", "região"], match: ["estado", "uf", "regiao"] },
  { keys: ["cidade", "cidades", "municipio"], match: ["cidade", "municipio"] },
  { keys: ["produto", "produtos", "item", "itens", "servico", "serviço"], match: ["produto", "servico", "item"] },
  { keys: ["categoria", "categorias", "linha"], match: ["categoria", "linha", "segmento"] },
  { keys: ["vendedor", "vendedores", "consultor"], match: ["vendedor", "consultor", "responsavel"] },
  { keys: ["equipe", "equipes", "time", "times"], match: ["equipe", "time"] },
  { keys: ["canal", "canais", "origem"], match: ["canal", "origem", "fonte"] },
  { keys: ["campanha", "campanhas"], match: ["campanha"] },
  { keys: ["status", "situacao", "situação"], match: ["status", "situacao"] },
  { keys: ["etapa", "etapas", "funil"], match: ["etapa", "fase"] },
  { keys: ["cliente", "clientes"], match: ["cliente"] },
];

const TIME_PRESETS = [
  { keys: ["hoje"], preset: "hoje" },
  { keys: ["ontem"], preset: "ontem" },
  { keys: ["ultimos 7 dias", "ultima semana", "semana passada"], preset: "ultimos7" },
  { keys: ["ultimos 30 dias", "ultimo mes", "30 dias"], preset: "ultimos30" },
  { keys: ["ultimos 90 dias", "ultimo trimestre", "90 dias"], preset: "ultimos90" },
  { keys: ["este mes", "mes atual", "neste mes", "do mes"], preset: "mesAtual" },
  { keys: ["mes passado", "mes anterior"], preset: "mesAnterior" },
  { keys: ["este trimestre", "trimestre atual"], preset: "trimestreAtual" },
  { keys: ["este ano", "ano atual", "neste ano"], preset: "anoAtual" },
  { keys: ["ano passado", "ano anterior"], preset: "anoAnterior" },
];

const GRAIN_KEYS = [
  { keys: ["por dia", "diario", "diária", "diaria"], grain: "day" },
  { keys: ["por semana", "semanal"], grain: "week" },
  { keys: ["por mes", "mensal", "mes a mes", "evolucao"], grain: "month" },
  { keys: ["por trimestre", "trimestral"], grain: "quarter" },
  { keys: ["por ano", "anual"], grain: "year" },
];

function findField(fields, matches, predicate) {
  const candidates = fields.filter(predicate);
  for (const token of matches) {
    const found = candidates.find((f) => norm(f.name).includes(token) || norm(f.label || "").includes(token));
    if (found) return found;
  }
  return null;
}

/** Encontra o campo citado literalmente na pergunta. */
function findFieldByMention(fields, question, predicate) {
  const q = norm(question);
  const candidates = fields
    .filter(predicate)
    .sort((a, b) => (b.name?.length || 0) - (a.name?.length || 0));
  return candidates.find((f) => norm(f.name).length > 3 && q.includes(norm(f.name))) || null;
}

/**
 * Interpreta a pergunta.
 * @param {string} question
 * @param {{fields:Array, datasetId:string, datasetName:string}} context
 * @returns {{intent:string, measure?:Object, dimension?:Object, grain?:string,
 *            period?:string, limit?:number, chartType?:string, unresolved:string[]}}
 */
export function parseQuestion(question, context) {
  const q = norm(question);
  const fields = context.fields || [];
  const unresolved = [];

  const isMeasureField = (f) => NUMERIC_TYPES.has(f.type);
  const isDimensionField = (f) => f.role === "dimension" || f.role === "id" || f.type === "text";
  const isTimeField = (f) => TEMPORAL_TYPES.has(f.type);

  /* -------- intenção -------- */
  let intent = "aggregate";
  let chartType = null;

  if (/resumo executivo|resuma|resumo do dashboard|resumo geral/.test(q)) intent = "summary";
  else if (/gargalo|onde estao os problemas|onde estão os problemas|ponto fraco/.test(q)) intent = "bottleneck";
  else if (/tendencia|previsao|projecao|proximos meses|vai crescer/.test(q)) intent = "trend";
  else if (/abaixo da meta|nao bateu|não bateu|pior|piores|menor desempenho/.test(q)) intent = "bottom";
  else if (/mais vendeu|mais vendido|melhor|melhores|top |ranking|maiores|quem vendeu mais/.test(q)) intent = "top";
  else if (/compare|comparar|comparacao|versus| vs |em relacao ao/.test(q)) intent = "compare";
  else if (/(crie|criar|gere|gerar|monte|montar|faca|faça|mostre|mostrar|exiba) (um |uma )?(grafico|gráfico|mapa|tabela|painel)/.test(q)) intent = "chart";
  else if (/quantos|quantas|numero de|número de/.test(q)) intent = "aggregate";

  if (/mapa|estados|por uf/.test(q)) chartType = "ufmap";
  else if (/pizza|rosca/.test(q)) chartType = /rosca/.test(q) ? "donut" : "pie";
  else if (/linha|evolucao|evolução|ao longo do tempo|mes a mes/.test(q)) chartType = "line";
  else if (/funil/.test(q)) chartType = "funnel";
  else if (/tabela/.test(q)) chartType = "table";
  else if (/barra/.test(q)) chartType = "bar";
  else if (/coluna/.test(q)) chartType = "column";

  /* -------- medida -------- */
  let measure = null;
  let agg = null;
  for (const syn of MEASURE_SYNONYMS) {
    if (syn.keys.some((k) => q.includes(k))) {
      const field = findField(fields, syn.match, syn.agg === "countDistinct" ? isDimensionField : isMeasureField);
      if (field) {
        measure = field;
        agg = syn.agg || null;
        break;
      }
    }
  }
  if (!measure) {
    const mentioned = findFieldByMention(fields, question, isMeasureField);
    if (mentioned) measure = mentioned;
  }
  if (!measure) {
    measure = fields.find((f) => isMeasureField(f) && norm(f.name).includes("faturamento")) || fields.find(isMeasureField) || null;
    if (measure) unresolved.push(`usei "${measure.label || measure.name}" como medida porque a pergunta não deixou claro`);
  }

  /* -------- dimensão -------- */
  let dimension = null;
  for (const syn of DIMENSION_SYNONYMS) {
    if (syn.keys.some((k) => q.includes(k))) {
      const field = findField(fields, syn.match, isDimensionField);
      if (field) {
        dimension = field;
        break;
      }
    }
  }
  if (!dimension) {
    const mentioned = findFieldByMention(fields, question, isDimensionField);
    if (mentioned) dimension = mentioned;
  }

  /* -------- granularidade / tempo -------- */
  let grain = null;
  for (const item of GRAIN_KEYS) {
    if (item.keys.some((k) => q.includes(k))) {
      grain = item.grain;
      break;
    }
  }
  const timeField = fields.find(isTimeField);
  if (grain && timeField) dimension = timeField;

  let period = null;
  for (const item of TIME_PRESETS) {
    if (item.keys.some((k) => q.includes(k))) {
      period = item.preset;
      break;
    }
  }

  /* -------- limite -------- */
  const topMatch = q.match(/top\s*(\d+)|(\d+)\s*(maiores|melhores|primeiros)/);
  const limit = topMatch ? Number(topMatch[1] || topMatch[2]) : intent === "top" || intent === "bottom" ? 10 : null;

  if (!measure) unresolved.push("não encontrei nenhuma coluna numérica para medir");
  if ((intent === "top" || intent === "bottom") && !dimension) {
    unresolved.push("não identifiquei por qual campo ranquear (ex.: “por produto”, “por vendedor”)");
  }

  return {
    intent,
    measure: measure ? { field: measure.name, label: measure.label || measure.name, type: measure.type, agg: agg || defaultAggFor(measure) } : null,
    dimension: dimension ? { field: dimension.name, label: dimension.label || dimension.name, type: dimension.type } : null,
    grain: grain || (dimension && TEMPORAL_TYPES.has(dimension.type) ? "month" : null),
    period,
    limit,
    chartType,
    unresolved,
    question,
  };
}

function defaultAggFor(field) {
  if (!NUMERIC_TYPES.has(field.type)) return "countDistinct";
  if (field.type === "percent") return "avg";
  return "sum";
}

/** Converte a intenção em um tile pronto para o dashboard. */
export function intentToTile(parsed, datasetId) {
  if (!parsed.measure) return null;

  let type = parsed.chartType;
  if (!type) {
    if (parsed.dimension && TEMPORAL_TYPES.has(parsed.dimension.type)) type = "line";
    else if (parsed.dimension && parsed.intent === "top") type = "bar";
    else if (parsed.dimension) type = "column";
    else type = "kpi";
  }
  if (type === "ufmap" && !parsed.dimension) type = "column";

  return {
    id: uid("tile"),
    type,
    datasetId,
    title: buildTitle(parsed),
    dimension: parsed.dimension?.field || null,
    grain: parsed.grain || undefined,
    measures: [{ field: parsed.measure.field, agg: parsed.measure.agg }],
    limit: parsed.limit || (parsed.dimension && !TEMPORAL_TYPES.has(parsed.dimension.type) ? 12 : undefined),
    sort: parsed.intent === "bottom" ? { by: "m0", dir: "asc" } : undefined,
    options: { showLegend: true },
    layout: { col: type === "kpi" ? 3 : 6, h: type === "kpi" ? 2 : 3 },
    createdBy: "ia",
  };
}

export function buildTitle(parsed) {
  const measure = parsed.measure?.label || "Valor";
  if (!parsed.dimension) return measure;
  const prefix = parsed.intent === "top" ? "Maiores" : parsed.intent === "bottom" ? "Menores" : "";
  return `${prefix ? `${prefix} — ` : ""}${measure} por ${parsed.dimension.label.toLowerCase()}`;
}

/** Sugestões de perguntas para o usuário começar. */
export function suggestedQuestions(fields) {
  const measure = fields.find((f) => NUMERIC_TYPES.has(f.type));
  const dim = fields.find((f) => f.role === "dimension" && f.type === "text");
  const list = ["Gere um resumo executivo deste dashboard", "Onde estão os principais gargalos?"];
  if (measure) {
    list.push(`Qual foi o ${String(measure.label || measure.name).toLowerCase()} deste mês?`);
    list.push(`Qual a tendência de ${String(measure.label || measure.name).toLowerCase()}?`);
  }
  if (measure && dim) {
    list.push(`Crie um gráfico de ${String(measure.label || measure.name).toLowerCase()} por ${String(dim.label || dim.name).toLowerCase()}`);
    list.push(`Top 5 ${String(dim.label || dim.name).toLowerCase()} por ${String(measure.label || measure.name).toLowerCase()}`);
  }
  if (fields.some((f) => norm(f.name).includes("estado") || norm(f.name).includes("uf"))) {
    list.push("Mostre as cidades e estados com maior resultado");
  }
  return list.slice(0, 6);
}
