/**
 * Teste de interação no navegador (Playwright + Chromium).
 *
 * Exercita os caminhos que o e2e não cobre: editor de componentes (todos os
 * tipos de gráfico), painel de filtros, tratamento de dados com fórmula e
 * desfazer, modelagem com tabela calendário, indicadores e alertas, assistente
 * de IA e geração de link de compartilhamento.
 *
 *   npx http-server -p 8099 -s .     # na raiz do repositório
 *   node tests/interactions.mjs      # SHOT_DIR=/tmp/x salva capturas
 */

import { chromium } from "playwright";
const OUT = process.env.SHOT_DIR || null;
const BASE = process.env.BASE_URL || "http://127.0.0.1:8099/brasil-bi/index.html";

let fails = 0;
const check = (l, ok, d = "") => { if (!ok) fails++; console.log(`${ok ? "ok  " : "FAIL"} ${l}${d ? ` → ${d}` : ""}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/ERR_CONNECTION|fonts\./.test(m.text())) errs.push(m.text()); });

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(700);
await page.locator(".modal").getByRole("button", { name: /demonstra/i }).first().click();
await page.waitForTimeout(3000);

// 1. Editor de componente
await page.getByRole("button", { name: /Adicionar componente/ }).click();
await page.waitForSelector(".modal", { timeout: 10000 });
await page.waitForTimeout(1500);
check("editor abriu com prévia", (await page.locator(".modal .tile").count()) > 0);
// troca de tipo de gráfico exercita normalizeTile + re-render
for (const tipo of ["donut", "treemap", "heatmap", "scatter", "radar", "sankey", "matrix", "calendar", "waterfall", "ufmap", "gauge", "bubble", "histogram", "wordcloud", "percentStacked", "areaStacked", "combo"]) {
  await page.locator(".modal select").first().selectOption(tipo);
  await page.waitForTimeout(420);
}
check("todos os tipos renderizaram sem erro", errs.length === 0, errs.slice(0, 2).join(" | "));
if (OUT) await page.screenshot({ path: `${OUT}/i-editor.png`, animations: "disabled" });
await page.locator(".modal").getByRole("button", { name: /Adicionar ao dashboard/ }).click();
await page.waitForTimeout(2500);
check("componente adicionado", (await page.locator(".tile").count()) > 14, String(await page.locator(".tile").count()));

// 2. Painel de filtros
await page.getByRole("button", { name: "Filtros" }).click();
await page.waitForSelector(".modal", { timeout: 10000 });
await page.waitForTimeout(1200);
const checkboxes = page.locator(".modal .list__row input[type=checkbox]");
check("painel lista valores para filtrar", (await checkboxes.count()) > 3, String(await checkboxes.count()));
await checkboxes.first().check();
await page.locator(".modal").getByRole("button", { name: "Aplicar" }).click();
await page.waitForTimeout(2000);
check("filtro global aplicado", (await page.locator(".filterbar .chip").count()) >= 1);
if (OUT) await page.screenshot({ path: `${OUT}/i-filtro.png`, animations: "disabled" });
await page.getByRole("button", { name: /Limpar filtros/ }).click();
await page.waitForTimeout(1200);

// 3. Tratamento: adicionar etapa de coluna calculada
await page.evaluate(() => { window.location.hash = "#/tratamento"; });
await page.waitForTimeout(2500);
await page.getByRole("button", { name: /Nova etapa/ }).click();
await page.waitForSelector(".modal", { timeout: 10000 });
await page.waitForTimeout(700);
await page.locator(".modal input.input").first().fill("Margem");
await page.locator(".modal textarea.input").first().fill("([Faturamento] - [Custo]) / [Faturamento] * 100");
await page.waitForTimeout(600);
const feedback = await page.locator(".modal .text-pos").first().textContent().catch(() => "");
check("fórmula validada com explicação", /Calcula/.test(feedback || ""), (feedback || "").slice(0, 60));
await page.locator(".modal").getByRole("button", { name: /Adicionar etapa/ }).click();
await page.waitForTimeout(2500);
const steps = await page.locator(".tl__item").count();
check("etapa registrada na linha do tempo", steps >= 1, String(steps));
const hasMargem = await page.evaluate(() => [...document.querySelectorAll("th")].some((t) => /Margem/.test(t.textContent)));
check("coluna calculada aparece na prévia", hasMargem);
if (OUT) await page.screenshot({ path: `${OUT}/i-tratamento.png`, animations: "disabled" });

// desfazer
await page.getByRole("button", { name: /Desfazer/ }).click();
await page.waitForTimeout(1800);
check("desfazer removeu a etapa", (await page.locator(".tl__item").count()) === steps - 1);

// 4. Modelagem: gerar tabela calendário
await page.evaluate(() => { window.location.hash = "#/modelagem"; });
await page.waitForTimeout(2500);
check("diagrama desenhou nós", (await page.locator(".model-node").count()) >= 2);
await page.getByRole("button", { name: /tabela calendário/i }).click();
await page.waitForSelector(".modal");
await page.locator(".modal").getByRole("button", { name: "Gerar" }).click();
await page.waitForTimeout(3500);
const datasets = await page.evaluate(async () => (await import("./js/core/store.js")).getState().datasets.length);
check("tabela calendário criada", datasets === 3, String(datasets));

// 5. Indicadores: definir meta e rodar alertas
await page.evaluate(() => { window.location.hash = "#/indicadores"; });
await page.waitForTimeout(3000);
check("catálogo de KPIs montado", (await page.locator("table.data tbody tr").count()) >= 6);
await page.getByRole("button", { name: /Verificar agora/ }).click();
await page.waitForTimeout(1500);
if (OUT) await page.screenshot({ path: `${OUT}/i-indicadores.png`, animations: "disabled" });

// 6. IA: gerar gráfico a partir de pergunta e adicionar ao painel
await page.evaluate(() => { window.location.hash = "#/ia"; });
await page.waitForTimeout(3000);
await page.locator('input[aria-label="Pergunta para o assistente"]').fill("Crie um gráfico de faturamento por estado");
await page.getByRole("button", { name: /Perguntar/ }).click();
await page.waitForTimeout(2500);
check("IA devolveu prévia de gráfico", (await page.locator(".msg--ai .tile").count()) >= 1);
await page.getByRole("button", { name: /Adicionar ao dashboard/ }).first().click();
await page.waitForTimeout(1200);
if (OUT) await page.screenshot({ path: `${OUT}/i-ia.png`, animations: "disabled" });

// 7. Compartilhar
await page.evaluate(() => { window.location.hash = "#/compartilhamentos"; });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /Novo link/ }).click();
await page.waitForSelector(".modal");
await page.locator(".modal").getByRole("button", { name: "Gerar" }).click();
await page.waitForTimeout(1200);
check("link de compartilhamento criado", (await page.locator(".list__row").count()) >= 1);

check("nenhum erro de JavaScript no fluxo", errs.length === 0, errs.slice(0, 3).join(" | "));
await browser.close();
console.log(`\n${fails ? `❌ ${fails} falha(s)` : "✅ interações ok"}`);
