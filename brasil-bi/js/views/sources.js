/**
 * Brasil BI — fontes de dados: lista, perfil de qualidade, prévia e ações.
 */

import { el, render, fmtBytes, fmtRelative, fmtByType, fmtPercent, fmtNumber } from "../core/utils.js";
import { icon } from "../core/icons.js";
import { modal, toast, confirmDialog, emptyState, promptDialog } from "../ui/feedback.js";
import { getState, removeDataset, update, hasDemoData } from "../core/store.js";
import { resolveDataset } from "../data/query.js";
import { profileDataset } from "../data/profile.js";
import { formatLabel } from "../data/parsers.js";
import { exportCsv, exportXlsx } from "../export/exporters.js";
import { navigate } from "../app.js";
import { installDemo, demoDatasetIds } from "../demo/demo-data.js";
import { TYPE_LABEL } from "../data/types.js";

export function renderSourcesView(root) {
  const state = getState();

  render(root, [
    el("div.view__head", {}, [
      el("div", {}, [
        el("h1", { text: "Fontes de dados" }),
        el("p", { text: "Todas as tabelas importadas, com perfil de qualidade, transformações aplicadas e ações de manutenção." }),
      ]),
      el("div.row", {}, [
        hasDemoData()
          ? el("button.btn.btn--danger", {
              "on:click": async () => {
                const ok = await confirmDialog({
                  title: "Remover dados de demonstração",
                  message: "As fontes e o painel de demonstração serão apagados. Seus dados reais não são afetados.",
                  confirmLabel: "Remover demonstração",
                  danger: true,
                });
                if (!ok) return;
                for (const id of demoDatasetIds()) await removeDataset(id);
                update((s) => {
                  s.dashboards = s.dashboards.filter((d) => !d.isDemo);
                  if (!s.dashboards.find((d) => d.id === s.activeDashboardId)) {
                    s.activeDashboardId = s.dashboards[0]?.id || null;
                  }
                }, { reason: "demo:remove" });
                toast("Demonstração removida", { level: "success" });
                renderSourcesView(root);
              },
            }, [icon("trash", { size: 15 }), el("span", { text: "Remover demonstração" })])
          : el("button.btn", {
              "on:click": async (e) => {
                e.target.disabled = true;
                await installDemo();
                toast("Demonstração restaurada", { level: "success" });
                renderSourcesView(root);
              },
            }, [icon("play", { size: 15 }), el("span", { text: "Restaurar demonstração" })]),
        el("button.btn.btn--primary", { "on:click": () => navigate("importar") }, [
          icon("upload", { size: 15 }),
          el("span", { text: "Importar arquivo" }),
        ]),
      ]),
    ]),

    state.datasets.length
      ? el("div.grid-auto", {}, state.datasets.map((dataset) => sourceCard(dataset, root)))
      : emptyState({
          iconName: "sources",
          title: "Nenhuma fonte importada",
          message: "Importe um arquivo para começar. Os dados ficam armazenados apenas neste navegador.",
          action: el("button.btn.btn--primary", { text: "Importar agora", "on:click": () => navigate("importar") }),
        }),
  ]);
}

function sourceCard(dataset, root) {
  const quality = dataset.quality;
  const score = quality ? Math.round(quality.score * 100) : null;

  return el("div.card", {}, [
    el("div.card__head", {}, [
      el("div", {}, [
        el("div.card__title", {}, [
          el("span", { text: dataset.name }),
          dataset.isDemo ? el("span.badge.badge--demo", { style: { marginLeft: "8px" }, text: "demonstração" }) : null,
        ]),
        el("div.card__sub", {
          text: `${formatLabel(dataset.source?.format || "")} · ${fmtNumber(dataset.rowCount)} linhas · ${dataset.fields.length} colunas`,
        }),
      ]),
      score !== null
        ? el(`span.badge.badge--${score > 80 ? "ok" : score > 50 ? "warn" : "danger"}`, { text: `${score}%` })
        : null,
    ]),
    el("div.card__body.stack-3", {}, [
      el("div.row.wrap.t-xs.muted", {}, [
        el("span", {}, [icon("file", { size: 12 }), ` ${dataset.source?.fileName || "—"}`]),
        dataset.source?.size ? el("span", { text: fmtBytes(dataset.source.size) }) : null,
        el("span", { text: `importado ${fmtRelative(dataset.importedAt)}` }),
        dataset.transforms?.length ? el("span.badge.badge--info", { text: `${dataset.transforms.length} transformações` }) : null,
      ]),

      quality?.issues?.length
        ? el("div.stack-2", {}, quality.issues.slice(0, 3).map((issue) =>
            el("div.t-xs", {
              class: issue.level === "error" ? "text-neg" : issue.level === "warn" ? "text-warn" : "muted",
              text: `• ${issue.message}`,
            })
          ))
        : el("div.t-xs.text-pos", { text: "• Nenhum problema relevante detectado." }),

      el("div.row.wrap", {}, [
        el("button.btn.btn--sm", { "on:click": () => openPreviewModal(dataset) }, [icon("eye", { size: 13 }), el("span", { text: "Ver dados" })]),
        el("button.btn.btn--sm", { "on:click": () => navigate("tratamento", { dataset: dataset.id }) }, [
          icon("prepare", { size: 13 }),
          el("span", { text: "Tratar" }),
        ]),
        el("button.btn.btn--sm", { "on:click": () => openProfileModal(dataset) }, [icon("kpi", { size: 13 }), el("span", { text: "Perfil" })]),
        el("button.btn.btn--sm", {
          "on:click": async () => {
            const name = await promptDialog({ title: "Renomear fonte", label: "Novo nome", value: dataset.name });
            if (!name) return;
            update((s) => {
              const ds = s.datasets.find((d) => d.id === dataset.id);
              if (ds) ds.name = name;
            }, { reason: "dataset:rename" });
            renderSourcesView(root);
          },
        }, [icon("editor", { size: 13 }), el("span", { text: "Renomear" })]),
        el("button.btn.btn--sm", {
          "on:click": async () => {
            const source = await resolveDataset(dataset.id);
            exportCsv(source.fields.map((f) => f.name), source.rows, `${dataset.name}.csv`);
          },
        }, [icon("download", { size: 13 }), el("span", { text: "CSV" })]),
        el("button.btn.btn--sm.btn--danger", {
          "on:click": async () => {
            const ok = await confirmDialog({
              title: "Excluir fonte",
              message: `"${dataset.name}" e todos os componentes que a usam serão removidos. Esta ação não pode ser desfeita.`,
              confirmLabel: "Excluir",
              danger: true,
            });
            if (!ok) return;
            await removeDataset(dataset.id);
            toast("Fonte removida", { level: "success" });
            renderSourcesView(root);
          },
        }, [icon("trash", { size: 13 })]),
      ]),
    ]),
  ]);
}

/* --------------------------------------------------------------- prévia -- */

async function openPreviewModal(dataset) {
  const source = await resolveDataset(dataset.id);
  const fields = source.fields;
  const pageSize = 50;
  let page = 0;

  const tableBox = el("div.table-wrap", { style: { maxHeight: "440px" } });
  const info = el("div.t-xs.muted");

  const draw = () => {
    const rows = source.rows.slice(page * pageSize, (page + 1) * pageSize);
    render(tableBox, [
      el("table.data", {}, [
        el("thead", {}, [
          el("tr", {}, fields.map((f) =>
            el("th", {}, [el("span", { text: f.label || f.name }), el("span.dim", { text: ` · ${TYPE_LABEL[f.type] || f.type}` })])
          )),
        ]),
        el("tbody", {}, rows.map((row) =>
          el("tr", {}, fields.map((f) =>
            row[f.name] === null || row[f.name] === undefined || row[f.name] === ""
              ? el("td.cell-null", { text: "vazio" })
              : el("td", { text: fmtByType(row[f.name], f.type) })
          ))
        )),
      ]),
    ]);
    info.textContent = `Linhas ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, source.rows.length)} de ${fmtNumber(source.rows.length)}`;
  };
  draw();

  const ref = modal({
    title: dataset.name,
    subtitle: "Dados após as transformações aplicadas",
    wide: true,
    body: el("div.stack-3", {}, [info, tableBox]),
    actions: [
      el("button.btn", {
        text: "Anterior",
        "on:click": () => {
          if (page > 0) {
            page -= 1;
            draw();
          }
        },
      }),
      el("button.btn", {
        text: "Próxima",
        "on:click": () => {
          if ((page + 1) * pageSize < source.rows.length) {
            page += 1;
            draw();
          }
        },
      }),
      el("button.btn", {
        text: "Exportar XLSX",
        "on:click": () => exportXlsx(fields.map((f) => f.name), source.rows, `${dataset.name}.xlsx`, dataset.name.slice(0, 28)),
      }),
      el("button.btn.btn--primary", { text: "Fechar", "on:click": () => ref.close() }),
    ],
  });
}

/* ---------------------------------------------------------------- perfil -- */

async function openProfileModal(dataset) {
  const source = await resolveDataset(dataset.id);
  const quality = profileDataset(source.rows, source.fields);

  const ref = modal({
    title: `Perfil de "${dataset.name}"`,
    subtitle: `${fmtNumber(quality.rowCount)} linhas · qualidade ${Math.round(quality.score * 100)}%`,
    wide: true,
    body: el("div.stack-4", {}, [
      el("div.table-wrap", { style: { maxHeight: "420px" } }, [
        el("table.data", {}, [
          el("thead", {}, [
            el("tr", {}, [
              el("th", { text: "Coluna" }),
              el("th", { text: "Tipo" }),
              el("th.num", { text: "Vazios" }),
              el("th.num", { text: "Distintos" }),
              el("th.num", { text: "Mínimo" }),
              el("th.num", { text: "Média" }),
              el("th.num", { text: "Máximo" }),
              el("th", { text: "Mais frequentes" }),
            ]),
          ]),
          el("tbody", {}, quality.columns.map((col) =>
            el("tr", {}, [
              el("td", { text: col.label }),
              el("td", { text: TYPE_LABEL[col.type] || col.type }),
              el("td.num", { text: col.blanks ? `${col.blanks} (${fmtPercent(col.blankPct * 100, 0)})` : "0" }),
              el("td.num", { text: fmtNumber(col.distinct) }),
              el("td.num", { text: col.min === null ? "—" : fmtByType(col.min, col.type) }),
              el("td.num", { text: col.mean === null ? "—" : fmtByType(col.mean, col.type) }),
              el("td.num", { text: col.max === null ? "—" : fmtByType(col.max, col.type) }),
              el("td.dim", { text: col.top.slice(0, 3).map((t) => `${t.value} (${t.count})`).join(", ") || "—" }),
            ])
          )),
        ]),
      ]),
      quality.issues.length
        ? el("div", {}, [
            el("div.section-title", { text: "Pontos de atenção" }),
            el("div.stack-2", {}, quality.issues.map((issue) =>
              el(`div.insight.insight--${issue.level === "error" ? "neg" : issue.level === "warn" ? "warn" : "info"}`, {}, [
                el("div.insight__icon", {}, [icon("alert", { size: 14 })]),
                el("div.insight__text", { text: issue.message }),
              ])
            )),
          ])
        : null,
    ]),
    actions: [el("button.btn.btn--primary", { text: "Fechar", "on:click": () => ref.close() })],
  });
}
