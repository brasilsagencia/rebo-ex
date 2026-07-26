/**
 * Brasil BI — relatórios: geração de PDF (impressão), exportações em
 * XLSX/CSV/JSON e resumo executivo incluído no documento.
 */

import { el, render, fmtDate } from "../core/utils.js";
import { icon } from "../core/icons.js";
import { toast, emptyState } from "../ui/feedback.js";
import { getState, activeDashboard } from "../core/store.js";
import { resolveDataset, PERIOD_PRESETS } from "../data/query.js";
import { exportPdf, exportCsv, exportXlsx, exportJson } from "../export/exporters.js";
import { analyze, executiveSummary } from "../ai/insights.js";
import { OP_LABEL } from "../data/transform.js";
import { navigate } from "../app.js";

export function renderReportsView(root) {
  const state = getState();
  const dashboard = activeDashboard();

  if (!dashboard) {
    render(root, emptyState({
      iconName: "reports",
      title: "Nenhum dashboard para exportar",
      message: "Crie ou abra um dashboard antes de gerar relatórios.",
      action: el("button.btn.btn--primary", { text: "Ver dashboards", "on:click": () => navigate("dashboards") }),
    }));
    return;
  }

  const config = {
    title: dashboard.name,
    subtitle: dashboard.description || "",
    orientation: "paisagem",
    margins: "12mm",
    author: state.user.name,
    notes: "",
    includeSummary: true,
    logo: "",
  };

  const logoPreview = el("div.dim.t-xs", { text: "Nenhuma logomarca selecionada" });

  render(root, [
    el("div.view__head", {}, [
      el("div", {}, [
        el("h1", { text: "Relatórios" }),
        el("p", { text: "Gere um PDF do painel atual com cabeçalho, rodapé, filtros aplicados e resumo executivo — ou exporte os dados em planilha." }),
      ]),
    ]),

    el("div.layout-split", {}, [
      el("div.card.card--pad.stack-4", {}, [
        el("div.section-title", {}, [icon("reports", { size: 13 }), el("span", { text: "Documento PDF" })]),
        el("div.grid-2", {}, [
          field("Título", el("input.input", { value: config.title, "on:input": (e) => { config.title = e.target.value; } })),
          field("Subtítulo", el("input.input", { value: config.subtitle, "on:input": (e) => { config.subtitle = e.target.value; } })),
        ]),
        el("div.grid-2", {}, [
          field(
            "Orientação",
            el("select.select", { "on:change": (e) => { config.orientation = e.target.value; } }, [
              el("option", { value: "paisagem", text: "A4 paisagem" }),
              el("option", { value: "retrato", text: "A4 retrato" }),
            ])
          ),
          field(
            "Margens",
            el("select.select", { "on:change": (e) => { config.margins = e.target.value; } }, [
              el("option", { value: "12mm", text: "Padrão (12 mm)" }),
              el("option", { value: "6mm", text: "Estreita (6 mm)" }),
              el("option", { value: "20mm", text: "Larga (20 mm)" }),
            ])
          ),
        ]),
        el("div.grid-2", {}, [
          field("Responsável", el("input.input", { value: config.author, "on:input": (e) => { config.author = e.target.value; } })),
          field(
            "Logomarca",
            el("div.stack-2", {}, [
              el("input", {
                type: "file",
                accept: "image/*",
                class: "input",
                style: { paddingTop: "5px", height: "auto" },
                "on:change": async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  config.logo = await fileToDataUrl(file);
                  logoPreview.textContent = `Logomarca: ${file.name}`;
                },
              }),
              logoPreview,
            ])
          ),
        ]),
        field("Observações", el("textarea.input", { rows: "3", "on:input": (e) => { config.notes = e.target.value; } })),
        el("label.check", {}, [
          el("input", { type: "checkbox", checked: "checked", "on:change": (e) => { config.includeSummary = e.target.checked; } }),
          el("span", { text: "Incluir resumo executivo gerado automaticamente" }),
        ]),
        el("div.row", {}, [
          el("button.btn.btn--primary.btn--lg", {
            "on:click": async (e) => {
              e.target.disabled = true;
              await generatePdf(config, dashboard);
              e.target.disabled = false;
            },
          }, [icon("download", { size: 16 }), el("span", { text: "Gerar PDF" })]),
          el("span.dim.t-xs", { text: "Abre a janela de impressão do navegador — escolha “Salvar como PDF”." }),
        ]),
      ]),

      el("div.side-panel.stack-4", {}, [
        el("div.card.card--pad", {}, [
          el("div.section-title", {}, [icon("filter", { size: 13 }), el("span", { text: "O que entra no relatório" })]),
          el("ul.stack-2.t-xs.muted", {}, [
            el("li", { text: `• Dashboard: ${dashboard.name}` }),
            el("li", { text: `• ${dashboard.tiles.length} componentes, exatamente como estão na tela` }),
            el("li", { text: `• Período: ${PERIOD_PRESETS[state.period.preset] || "todos"}` }),
            el("li", { text: `• ${state.filters.global.length + state.filters.selection.length} filtro(s) aplicado(s)` }),
            el("li", { text: `• Gerado em ${fmtDate(new Date(), "datetime")}` }),
          ]),
        ]),

        el("div.card.card--pad", {}, [
          el("div.section-title", {}, [icon("table", { size: 13 }), el("span", { text: "Exportar dados" })]),
          el("div.stack-2", {}, [
            ...state.datasets.map((dataset) =>
              el("div.list__row", {}, [
                el("span.grow.truncate", { text: dataset.name }),
                el("button.btn.btn--sm", {
                  text: "CSV",
                  "on:click": async () => {
                    const source = await resolveDataset(dataset.id);
                    exportCsv(source.fields.map((f) => f.name), source.rows, `${dataset.name}.csv`);
                  },
                }),
                el("button.btn.btn--sm", {
                  text: "XLSX",
                  "on:click": async () => {
                    const source = await resolveDataset(dataset.id);
                    await exportXlsx(source.fields.map((f) => f.name), source.rows, `${dataset.name}.xlsx`, dataset.name.slice(0, 28));
                    toast("Planilha gerada", { level: "success" });
                  },
                }),
                el("button.btn.btn--sm", {
                  text: "JSON",
                  "on:click": async () => {
                    const source = await resolveDataset(dataset.id);
                    exportJson(source.rows, `${dataset.name}.json`);
                  },
                }),
              ])
            ),
          ]),
        ]),

        el("div.card.card--pad", {}, [
          el("div.section-title", {}, [icon("info", { size: 13 }), el("span", { text: "Qualidade do PDF" })]),
          el("p.muted.t-xs", {
            text: "Os gráficos são vetoriais (SVG), então texto e linhas saem nítidos em qualquer zoom. Cada componente é mantido inteiro em uma página — sem cortes no meio de um gráfico.",
          }),
        ]),
      ]),
    ]),
  ]);
}

function field(label, input) {
  return el("div.field", {}, [el("label", { text: label }), input]);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function generatePdf(config, dashboard) {
  const state = getState();
  const grid = document.getElementById("dash-grid");
  if (!grid) {
    toast("Abra o dashboard antes de gerar o PDF", {
      level: "warn",
      message: "O relatório usa exatamente o que está renderizado na visão geral.",
      action: { label: "Abrir dashboard", onClick: () => navigate("visao-geral") },
    });
    return;
  }

  let summary = "";
  if (config.includeSummary) {
    const datasetId = dashboard.datasetId || state.datasets[0]?.id;
    if (datasetId) {
      const source = await resolveDataset(datasetId);
      const insights = analyze({ ...source, datasetId });
      summary = executiveSummary({ ...source, datasetId }, insights).text;
    }
  }

  const filters = [
    ...(state.period.preset !== "todos" ? [`Período: ${PERIOD_PRESETS[state.period.preset]}`] : []),
    ...state.filters.global.map((f) => f.label || `${f.field} ${OP_LABEL[f.op] || f.op} ${f.value}`),
    ...state.filters.selection.map((f) => f.label || `${f.field} = ${f.value}`),
  ];

  exportPdf({
    title: config.title,
    subtitle: config.subtitle,
    orientation: config.orientation,
    margins: config.margins,
    logo: config.logo,
    author: config.author,
    notes: config.notes,
    filters,
    summary,
    content: grid,
  });
}
