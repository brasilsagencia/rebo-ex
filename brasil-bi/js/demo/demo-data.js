/**
 * Brasil BI — dados de DEMONSTRAÇÃO.
 *
 * IMPORTANTE: tudo aqui é fictício e sempre identificado como tal na interface
 * (etiqueta "Dados de demonstração"). Nunca é misturado a dados reais: as
 * fontes de demonstração são datasets separados, com `isDemo: true`, e podem
 * ser removidas com um clique.
 *
 * A geração é determinística (semente fixa) para que a demonstração seja
 * estável entre recarregamentos.
 */

import { addDataset, createDashboard, upsertDashboard, getState, update } from "../core/store.js";
import { detectFields } from "../data/types.js";
import { uid } from "../core/utils.js";

/** PRNG determinístico (mulberry32). */
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ESTADOS = [
  ["SP", "São Paulo", 0.26], ["RJ", "Rio de Janeiro", 0.13], ["MG", "Minas Gerais", 0.11],
  ["RS", "Rio Grande do Sul", 0.08], ["PR", "Paraná", 0.07], ["SC", "Santa Catarina", 0.06],
  ["BA", "Bahia", 0.06], ["PE", "Pernambuco", 0.05], ["CE", "Ceará", 0.04], ["GO", "Goiás", 0.04],
  ["DF", "Distrito Federal", 0.03], ["ES", "Espírito Santo", 0.03], ["PA", "Pará", 0.02],
  ["AM", "Amazonas", 0.01], ["MT", "Mato Grosso", 0.01],
];

const CIDADES = {
  SP: ["São Paulo", "Campinas", "Santos", "Ribeirão Preto"],
  RJ: ["Rio de Janeiro", "Niterói", "Petrópolis"],
  MG: ["Belo Horizonte", "Uberlândia", "Juiz de Fora"],
  RS: ["Porto Alegre", "Caxias do Sul"],
  PR: ["Curitiba", "Londrina"],
  SC: ["Florianópolis", "Joinville"],
  BA: ["Salvador", "Feira de Santana"],
  PE: ["Recife", "Olinda"],
  CE: ["Fortaleza"],
  GO: ["Goiânia"],
  DF: ["Brasília"],
  ES: ["Vitória"],
  PA: ["Belém"],
  AM: ["Manaus"],
  MT: ["Cuiabá"],
};

const CANAIS = [
  ["E-commerce", 0.3, 1.0],
  ["Loja física", 0.22, 1.15],
  ["WhatsApp", 0.2, 0.85],
  ["Marketplace", 0.16, 0.78],
  ["Indicação", 0.12, 1.35],
];

const CATEGORIAS = [
  ["Software", ["Plano Essencial", "Plano Pro", "Plano Enterprise"], 1.6],
  ["Serviços", ["Implantação", "Suporte premium", "Migração de dados"], 1.25],
  ["Consultoria", ["Diagnóstico", "Projeto sob medida", "Mentoria"], 2.1],
  ["Treinamento", ["Turma aberta", "In company", "Curso online"], 0.7],
  ["Hardware", ["Leitor", "Terminal", "Impressora"], 1.1],
];

const VENDEDORES = [
  ["Ana Beatriz", "Equipe Alfa", 1.18],
  ["Carlos Menezes", "Equipe Alfa", 0.94],
  ["Daniela Souza", "Equipe Beta", 1.07],
  ["Eduardo Lima", "Equipe Beta", 0.82],
  ["Fernanda Rocha", "Equipe Gama", 1.22],
  ["Gustavo Prado", "Equipe Gama", 0.9],
  ["Helena Martins", "Equipe Alfa", 1.03],
  ["Igor Nascimento", "Equipe Beta", 0.88],
];

const CAMPANHAS = ["Institucional", "Black Friday", "Retenção", "Lançamento Pro", "Indique e Ganhe", "Sem campanha"];
const STATUS = [["Concluído", 0.82], ["Pendente", 0.12], ["Cancelado", 0.06]];

function pickWeighted(random, items, weightIndex = 1) {
  const total = items.reduce((acc, item) => acc + item[weightIndex], 0);
  let r = random() * total;
  for (const item of items) {
    r -= item[weightIndex];
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/** Gera as linhas de vendas fictícias. */
export function buildDemoSales({ months = 18, perMonth = 90, seed = 20240726 } = {}) {
  const random = rng(seed);
  const rows = [];
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - (months - 1), 1);

  let clienteSeq = 1000;
  const clientesPorEstado = new Map();

  for (let m = 0; m < months; m += 1) {
    const monthDate = new Date(start.getFullYear(), start.getMonth() + m, 1);
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    // Tendência de crescimento + sazonalidade (pico em novembro).
    const trend = 1 + m * 0.028;
    const seasonal = 1 + (monthDate.getMonth() === 10 ? 0.45 : monthDate.getMonth() === 11 ? 0.22 : monthDate.getMonth() === 0 ? -0.18 : 0);
    const count = Math.max(12, Math.round(perMonth * trend * seasonal * (0.85 + random() * 0.3)));

    for (let i = 0; i < count; i += 1) {
      const [uf, , ] = pickWeighted(random, ESTADOS, 2);
      const cidade = pick(random, CIDADES[uf] || [uf]);
      const [canal, , canalMult] = pickWeighted(random, CANAIS, 1);
      const [categoria, produtos, catMult] = pick(random, CATEGORIAS);
      const produto = pick(random, produtos);
      const [vendedor, equipe, vendMult] = pick(random, VENDEDORES);
      const campanha = pick(random, CAMPANHAS);
      const [status] = pickWeighted(random, STATUS, 1);

      const dia = 1 + Math.floor(random() * daysInMonth);
      const data = new Date(monthDate.getFullYear(), monthDate.getMonth(), dia);

      const quantidade = 1 + Math.floor(random() ** 2 * 9);
      const baseUnit = 480 + random() * 2600;
      const valorUnitario = Math.round(baseUnit * catMult * canalMult * vendMult * 100) / 100;
      const desconto = random() < 0.28 ? Math.round(valorUnitario * quantidade * (0.03 + random() * 0.12) * 100) / 100 : 0;
      const faturamento = Math.round((valorUnitario * quantidade - desconto) * 100) / 100;
      const margem = 0.34 + random() * 0.22 - (categoria === "Hardware" ? 0.18 : 0);
      const custo = Math.round(faturamento * (1 - margem) * 100) / 100;
      const lucro = Math.round((faturamento - custo) * 100) / 100;

      const chaveCliente = `${uf}-${Math.floor(random() * 220)}`;
      let clienteId = clientesPorEstado.get(chaveCliente);
      const novo = !clienteId;
      if (novo) {
        clienteSeq += 1;
        clienteId = `CLI-${clienteSeq}`;
        clientesPorEstado.set(chaveCliente, clienteId);
      }

      rows.push({
        "Data": `${String(dia).padStart(2, "0")}/${String(monthDate.getMonth() + 1).padStart(2, "0")}/${monthDate.getFullYear()}`,
        "Pedido": `PED-${10000 + rows.length}`,
        "Cliente": clienteId,
        "Novo cliente": novo ? "Sim" : "Não",
        "Estado": uf,
        "Cidade": cidade,
        "Canal": canal,
        "Categoria": categoria,
        "Produto": produto,
        "Vendedor": vendedor,
        "Equipe": equipe,
        "Campanha": campanha,
        "Status": status,
        "Quantidade": quantidade,
        "Valor unitário": valorUnitario,
        "Desconto": desconto,
        "Faturamento": status === "Cancelado" ? 0 : faturamento,
        "Custo": status === "Cancelado" ? 0 : custo,
        "Lucro": status === "Cancelado" ? 0 : lucro,
        "Prazo de entrega (dias)": 1 + Math.floor(random() * 14),
      });
      void data;
    }
  }
  return rows;
}

/** Gera o funil de conversão fictício (por mês, canal e campanha). */
export function buildDemoFunnel({ months = 6, seed = 987654 } = {}) {
  const random = rng(seed);
  const etapas = [
    ["1. Visitantes", 1],
    ["2. Leads", 0.28],
    ["3. Qualificados", 0.46],
    ["4. Propostas", 0.52],
    ["5. Negociação", 0.61],
    ["6. Vendas", 0.44],
  ];
  const rows = [];
  const today = new Date();
  for (let m = months - 1; m >= 0; m -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth() - m, 1);
    for (const [canal] of CANAIS) {
      for (const campanha of ["Institucional", "Black Friday", "Retenção"]) {
        let volume = Math.round((2200 + random() * 2600) * (canal === "E-commerce" ? 1.6 : 1));
        etapas.forEach(([etapa, taxa], idx) => {
          volume = idx === 0 ? volume : Math.round(volume * taxa * (0.9 + random() * 0.2));
          rows.push({
            "Mês": `01/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`,
            "Etapa": etapa,
            "Ordem": idx + 1,
            "Canal": canal,
            "Campanha": campanha,
            "Quantidade": volume,
            "Tempo médio (dias)": Math.round((0.5 + idx * 1.6 + random() * 2) * 10) / 10,
          });
        });
      }
    }
  }
  return rows;
}

/* ------------------------------------------------------ instalação do demo */

export const DEMO_SALES_NAME = "Vendas 2024-2025 (demonstração)";
export const DEMO_FUNNEL_NAME = "Funil de conversão (demonstração)";

/** Cria as fontes e o dashboard de demonstração. */
export async function installDemo() {
  const salesRows = buildDemoSales();
  const funnelRows = buildDemoFunnel();

  const salesFields = detectFields(salesRows.slice(0, 600));
  // Ajustes semânticos que a inferência não tem como adivinhar.
  for (const field of salesFields) {
    if (["Faturamento", "Custo", "Lucro", "Valor unitário", "Desconto"].includes(field.name)) {
      field.type = "currency";
      field.role = "measure";
    }
    if (field.name === "Cliente") field.role = "id";
  }

  const sales = await addDataset(
    {
      name: DEMO_SALES_NAME,
      fields: salesFields,
      isDemo: true,
      source: { kind: "demonstração", format: "interno", fileName: "—", size: 0 },
      notes: "Conjunto fictício gerado pelo próprio sistema para demonstração.",
    },
    salesRows
  );

  const funnelFields = detectFields(funnelRows.slice(0, 400));
  const funnel = await addDataset(
    {
      name: DEMO_FUNNEL_NAME,
      fields: funnelFields,
      isDemo: true,
      source: { kind: "demonstração", format: "interno", fileName: "—", size: 0 },
      notes: "Funil fictício por mês, canal e campanha.",
    },
    funnelRows
  );

  const dashboard = buildDemoDashboard(sales.id, funnel.id);
  upsertDashboard(dashboard);
  update((s) => {
    s.period = { preset: "todos", from: null, to: null, field: "Data", datasetId: sales.id };
  }, { reason: "demo" });

  return { sales, funnel, dashboard };
}

/** Monta o dashboard executivo padrão (seção "tela inicial"). */
export function buildDemoDashboard(salesId, funnelId) {
  const tile = (config) => ({
    id: uid("tile"),
    datasetId: salesId,
    options: {},
    layout: { col: 3, h: 2 },
    ...config,
  });

  return createDashboard({
    name: "Visão executiva (demonstração)",
    description: "Painel gerado automaticamente com os dados de demonstração.",
    template: "vendas",
    datasetId: salesId,
    isDemo: true,
    tiles: [
      tile({
        type: "kpi",
        title: "Faturamento",
        measures: [{ field: "Faturamento", agg: "sum" }],
        options: { goal: 17000000 },
        layout: { col: 2, h: 2 },
      }),
      tile({
        type: "kpi",
        title: "Lucro",
        measures: [{ field: "Lucro", agg: "sum" }],
        layout: { col: 2, h: 2 },
      }),
      tile({
        type: "kpi",
        title: "Custo",
        measures: [{ field: "Custo", agg: "sum" }],
        options: { higherIsBetter: false },
        layout: { col: 2, h: 2 },
      }),
      tile({
        type: "kpi",
        title: "Clientes",
        measures: [{ field: "Cliente", agg: "countDistinct" }],
        layout: { col: 2, h: 2 },
      }),
      tile({
        type: "kpi",
        title: "Ticket médio",
        measures: [{ field: "Faturamento", agg: "avg" }],
        layout: { col: 2, h: 2 },
      }),
      tile({
        type: "kpi",
        title: "Pedidos",
        measures: [{ field: "Pedido", agg: "countDistinct" }],
        layout: { col: 2, h: 2 },
      }),
      tile({
        type: "combo",
        title: "Evolução do faturamento e do lucro",
        dimension: "Data",
        grain: "month",
        measures: [
          { field: "Faturamento", agg: "sum" },
          { field: "Lucro", agg: "sum" },
        ],
        options: { showLegend: true, lineSeries: [1] },
        layout: { col: 8, h: 3 },
      }),
      tile({
        type: "donut",
        title: "Vendas por categoria",
        dimension: "Categoria",
        measures: [{ field: "Faturamento", agg: "sum" }],
        options: { centerLabel: "Faturamento" },
        layout: { col: 4, h: 3 },
      }),
      tile({
        type: "funnel",
        title: "Funil de conversão",
        datasetId: funnelId,
        dimension: "Etapa",
        measures: [{ field: "Quantidade", agg: "sum" }],
        options: { funnelSort: "none" },
        layout: { col: 4, h: 3 },
      }),
      tile({
        type: "ufmap",
        title: "Faturamento por estado",
        dimension: "Estado",
        measures: [{ field: "Faturamento", agg: "sum" }],
        layout: { col: 4, h: 3 },
      }),
      tile({
        type: "bar",
        title: "Ranking de produtos",
        dimension: "Produto",
        measures: [{ field: "Faturamento", agg: "sum" }],
        limit: 8,
        layout: { col: 4, h: 3 },
      }),
      tile({
        type: "columnStacked",
        title: "Desempenho por equipe e canal",
        dimension: "Equipe",
        breakdown: "Canal",
        measures: [{ field: "Faturamento", agg: "sum" }],
        layout: { col: 6, h: 3 },
      }),
      tile({
        type: "line",
        title: "Novos clientes por mês",
        dimension: "Data",
        grain: "month",
        breakdown: "Novo cliente",
        measures: [{ field: "Cliente", agg: "countDistinct" }],
        layout: { col: 6, h: 3 },
      }),
      tile({
        type: "table",
        title: "Registros detalhados",
        options: { rowLimit: 100 },
        layout: { col: 12, h: 4 },
      }),
    ],
  });
}

/** Remove as fontes e dashboards de demonstração. */
export function demoDatasetIds() {
  return getState().datasets.filter((d) => d.isDemo).map((d) => d.id);
}
