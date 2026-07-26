/**
 * Teste ponta a ponta no navegador (Playwright + Chromium).
 *
 * Sobe um servidor estático, abre a aplicação e exercita o caminho real:
 * importar CSV → confirmar → dashboard automático → cross-filter → exportações.
 *
 *   npx http-server -p 8099 -s .      # na raiz do repositório
 *   node tests/e2e.mjs                # em outro terminal
 *
 * Variável BASE_URL permite apontar para outro endereço.
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8099/brasil-bi/index.html";
const SHOT = process.env.SHOT_DIR || null;

let fails = 0;
const check = (label, ok, detail = "") => {
  if (!ok) fails += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` → ${detail}` : ""}`);
};

const CSV = [
  "Data;Regiao;Produto;Faturamento;Custo",
  "05/01/2025;SP;Plano Pro;R$ 1.200,00;R$ 500,00",
  "12/01/2025;RJ;Plano Essencial;R$ 800,50;R$ 300,00",
  "03/02/2025;SP;Plano Pro;R$ 2.400,00;R$ 900,00",
  "18/02/2025;MG;Consultoria;R$ 3.000,00;R$ 1.100,00",
  "07/03/2025;SP;Consultoria;R$ 1.500,00;R$ 600,00",
  "21/03/2025;RJ;Plano Pro;R$ 950,00;R$ 400,00",
].join("\n");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 980 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/ERR_CONNECTION|fonts\.googleapis/.test(m.text())) errors.push(m.text());
});

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);

// Pula o onboarding e vai direto importar um arquivo real.
const skip = page.locator(".modal").getByRole("button", { name: "Pular" });
if (await skip.count()) await skip.click();
await page.evaluate(() => { window.location.hash = "#/importar"; });
await page.waitForTimeout(600);

await page.setInputFiles("#file-input", {
  name: "vendas-teste.csv",
  mimeType: "text/csv",
  buffer: Buffer.from(CSV, "utf-8"),
});
await page.waitForSelector(".modal", { timeout: 15000 });
await page.waitForTimeout(900);

const previewText = await page.locator(".modal").innerText();
check("prévia mostra 6 linhas", /6 linhas/.test(previewText));
check("prévia mostra 5 colunas", /5 colunas/.test(previewText));
check("detectou moeda em Faturamento", /Moeda/.test(previewText));
if (SHOT) await page.screenshot({ path: `${SHOT}/e2e-preview.png`, animations: "disabled" });

await page.locator(".modal").getByRole("button", { name: /Confirmar importação/ }).click();
await page.waitForTimeout(2500);

// A importação deve gerar dataset + dashboard automático.
const summary = await page.evaluate(async () => {
  const store = await import("./js/core/store.js");
  const query = await import("./js/data/query.js");
  const state = store.getState();
  const dataset = state.datasets[0];
  const source = await query.resolveDataset(dataset.id);
  const kpi = query.computeKpi(
    { rows: source.rows, fields: source.fields, datasetId: dataset.id },
    { measure: { field: "Faturamento", agg: "sum" } }
  );
  const porRegiao = query.runQuery(
    { rows: source.rows, fields: source.fields, datasetId: dataset.id },
    { dimension: "Regiao", measures: [{ field: "Faturamento", agg: "sum" }] }
  );
  return {
    datasets: state.datasets.length,
    dashboards: state.dashboards.length,
    tiles: state.dashboards[0]?.tiles.length || 0,
    rowCount: dataset.rowCount,
    tipoFaturamento: source.fields.find((f) => f.name === "Faturamento")?.type,
    tipoData: source.fields.find((f) => f.name === "Data")?.type,
    kpiValor: kpi.value,
    categorias: porRegiao.categories.map((c) => [c.label, c.values[0]]),
  };
});

check("1 fonte importada", summary.datasets === 1, String(summary.datasets));
check("dashboard automático criado", summary.dashboards === 1 && summary.tiles > 4, `${summary.tiles} componentes`);
check("6 linhas persistidas", summary.rowCount === 6, String(summary.rowCount));
check("Faturamento tipado como moeda", summary.tipoFaturamento === "currency", summary.tipoFaturamento);
check("Data tipada como data", summary.tipoData === "date", summary.tipoData);
check("soma do KPI correta", summary.kpiValor === 9850.5, String(summary.kpiValor));
check(
  "agregação por região correta",
  JSON.stringify(summary.categorias.sort()) === JSON.stringify([["MG", 3000], ["RJ", 1750.5], ["SP", 5100]].sort()),
  JSON.stringify(summary.categorias)
);

// Dashboard renderizado com gráficos reais
await page.evaluate(() => { window.location.hash = "#/visao-geral"; });
await page.waitForTimeout(2500);
const tiles = await page.locator(".tile").count();
const marks = await page.locator(".tile .mark").count();
check("componentes na tela", tiles > 4, String(tiles));
check("elementos interativos desenhados", marks > 3, String(marks));
if (SHOT) await page.screenshot({ path: `${SHOT}/e2e-dashboard.png`, animations: "disabled" });

// Cross-filter
await page.locator(".tile .mark").first().click({ force: true });
await page.waitForTimeout(1200);
const filtros = await page.locator(".filterbar .chip").count();
check("clique gera filtro global", filtros >= 1, String(filtros));
const clear = page.getByRole("button", { name: /Limpar filtros/ });
if (await clear.count()) await clear.first().click();
await page.waitForTimeout(800);

// Round-trip XLSX: escreve com o gerador e lê com o leitor
const xlsx = await page.evaluate(async () => {
  const { writeSimpleXlsx, readWorkbookFile, sheetToTable } = await import("./js/data/xlsx.js");
  const blob = await writeSimpleXlsx(["Produto", "Valor"], [
    { Produto: "Café", Valor: 10.5 },
    { Produto: "Chá", Valor: 7.25 },
  ], "Teste");
  const wb = await readWorkbookFile(await blob.arrayBuffer());
  const table = sheetToTable(wb.sheets[0].matrix);
  return { abas: wb.sheets.length, nome: wb.sheets[0].name, colunas: table.columns, linhas: table.rows };
});
check("XLSX round-trip: 1 aba", xlsx.abas === 1);
check("XLSX round-trip: nome da aba", xlsx.nome === "Teste", xlsx.nome);
check("XLSX round-trip: colunas", JSON.stringify(xlsx.colunas) === '["Produto","Valor"]', JSON.stringify(xlsx.colunas));
check("XLSX round-trip: valores", xlsx.linhas[0].Produto === "Café" && xlsx.linhas[1].Valor === 7.25);

// Exportação CSV a partir dos dados tratados
const csvOut = await page.evaluate(async () => {
  const { toCsv } = await import("./js/export/exporters.js");
  const store = await import("./js/core/store.js");
  const query = await import("./js/data/query.js");
  const source = await query.resolveDataset(store.getState().datasets[0].id);
  return toCsv(source.fields.map((f) => f.name), source.rows.slice(0, 2));
});
check("CSV exportado tem cabeçalho e linhas", csvOut.split("\r\n").length === 3, JSON.stringify(csvOut.split("\r\n")[0]));

// Persistência entre recarregamentos
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2200);
const afterReload = await page.evaluate(async () => {
  const store = await import("./js/core/store.js");
  const rows = await store.getRawRows(store.getState().datasets[0].id);
  return { datasets: store.getState().datasets.length, linhas: rows.length };
});
check("fonte sobrevive ao recarregamento", afterReload.datasets === 1 && afterReload.linhas === 6, JSON.stringify(afterReload));

// Acessibilidade básica
const a11y = await page.evaluate(() => ({
  semLabel: [...document.querySelectorAll("button")].filter((b) => !b.textContent.trim() && !b.getAttribute("aria-label")).length,
  resumos: document.querySelectorAll(".viz__summary").length,
  focaveis: document.querySelectorAll('.mark[tabindex="0"]').length,
}));
check("todo botão tem rótulo acessível", a11y.semLabel === 0, `${a11y.semLabel} sem rótulo`);
check("gráficos publicam resumo textual", a11y.resumos > 0, String(a11y.resumos));
check("elementos de gráfico são focáveis", a11y.focaveis > 0, String(a11y.focaveis));

// Responsivo
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(BASE, { waitUntil: "domcontentloaded" });
await mobile.waitForTimeout(1800);
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("sem rolagem horizontal no celular", overflow <= 2, `${overflow}px`);

check("nenhum erro de JavaScript", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
console.log(`\n${fails ? `❌ ${fails} falha(s)` : "✅ todos os testes passaram"}`);
process.exit(fails ? 1 : 0);
