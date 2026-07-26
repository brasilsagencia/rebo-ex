/**
 * Brasil BI — indicadores: catálogo de KPIs, metas, medidas calculadas
 * e regras de alerta.
 */

import { el, render, uid, fmtByType, fmtPercent } from "../core/utils.js";
import { icon } from "../core/icons.js";
import { modal, toast, confirmDialog, emptyState } from "../ui/feedback.js";
import { getState, update, upsertDashboard, invalidateDerived, pushNotification } from "../core/store.js";
import { resolveDataset, computeKpi } from "../data/query.js";
import { AGGREGATIONS, createStep } from "../data/transform.js";
import { compileFormula, explainFormula, FUNCTIONS } from "../data/formula.js";
import { NUMERIC_TYPES, defaultAgg } from "../data/types.js";
import { navigate } from "../app.js";

const ALERT_OPS = {
  lt: "ficar abaixo de",
  gt: "ultrapassar",
  lte: "for menor ou igual a",
  gte: "for maior ou igual a",
};

export async function renderIndicatorsView(root) {
  const state = getState();
  if (!state.datasets.length) {
    render(root, emptyState({
      iconName: "kpi",
      title: "Sem indicadores",
      message: "Importe dados para criar indicadores e metas.",
      action: el("button.btn.btn--primary", { text: "Importar", "on:click": () => navigate("importar") }),
    }));
    return;
  }

  // Coleta todos os tiles de KPI/velocímetro dos dashboards.
  const kpiTiles = [];
  for (const dashboard of state.dashboards) {
    for (const tile of dashboard.tiles) {
      if (tile.type === "kpi" || tile.type === "gauge") kpiTiles.push({ dashboard, tile });
    }
  }

  const cards = [];
  for (const { dashboard, tile } of kpiTiles) {
    const source = await resolveDataset(tile.datasetId);
    if (!source || !tile.measures?.[0]) continue;
    const kpi = computeKpi(
      { rows: source.rows, fields: source.fields, datasetId: tile.datasetId },
      { measure: tile.measures[0], goal: tile.options?.goal, higherIsBetter: tile.options?.higherIsBetter, tileId: tile.id }
    );
    cards.push(kpiRow(dashboard, tile, kpi, root));
  }

  render(root, [
    el("div.view__head", {}, [
      el("div", {}, [
        el("h1", { text: "Indicadores" }),
        el("p", { text: "Todos os KPIs dos seus painéis em um só lugar, com metas, status e alertas." }),
      ]),
      el("div.row", {}, [
        el("button.btn", { "on:click": () => openMeasureDialog(root) }, [icon("wand", { size: 15 }), el("span", { text: "Nova medida calculada" })]),
        el("button.btn.btn--primary", { "on:click": () => openAlertDialog(null, root) }, [icon("bell", { size: 15 }), el("span", { text: "Novo alerta" })]),
      ]),
    ]),

    el("div.card", { style: { marginBottom: "20px" } }, [
      el("div.card__head", {}, [el("div.card__title", { text: "Indicadores dos dashboards" })]),
      cards.length
        ? el("div.table-wrap", { style: { border: "0" } }, [
            el("table.data", {}, [
              el("thead", {}, [
                el("tr", {}, [
                  el("th", { text: "Indicador" }),
                  el("th", { text: "Dashboard" }),
                  el("th.num", { text: "Valor" }),
                  el("th.num", { text: "Anterior" }),
                  el("th.num", { text: "Variação" }),
                  el("th.num", { text: "Meta" }),
                  el("th", { text: "Status" }),
                  el("th", { text: "" }),
                ]),
              ]),
              el("tbody", {}, cards),
            ]),
          ])
        : el("div.card__body", {}, [el("p.muted", { text: "Nenhum cartão de indicador nos dashboards. Adicione um componente do tipo KPI." })]),
    ]),

    alertsSection(root),
    measuresSection(root),
  ]);
}

function kpiRow(dashboard, tile, kpi, root) {
  const statusLabel = {
    acima: ["Acima da meta", "ok"],
    atingida: ["Meta atingida", "ok"],
    proximo: ["Próximo da meta", "warn"],
    abaixo: ["Abaixo da meta", "warn"],
    critico: ["Crítico", "danger"],
    "sem-meta": ["Sem meta", "neutral"],
    "sem-dados": ["Sem dados", "neutral"],
  }[kpi.status] || ["—", "neutral"];

  return el("tr", {}, [
    el("td", { text: tile.title || kpi.label }),
    el("td.dim", { text: dashboard.name }),
    el("td.num", { text: fmtByType(kpi.value, kpi.type) }),
    el("td.num.dim", { text: kpi.previous === null ? "—" : fmtByType(kpi.previous, kpi.type) }),
    el("td.num", {
      class: kpi.delta === null ? "num dim" : kpi.good ? "num text-pos" : "num text-neg",
      text: kpi.delta === null ? "—" : `${kpi.delta > 0 ? "+" : ""}${fmtPercent(kpi.delta * 100)}`,
    }),
    el("td.num", { text: kpi.goal ? fmtByType(kpi.goal, kpi.type) : "—" }),
    el("td", {}, [el(`span.badge.badge--${statusLabel[1]}`, { text: statusLabel[0] })]),
    el("td", {}, [
      el("button.btn.btn--sm", {
        text: "Definir meta",
        "on:click": async () => {
          const { promptDialog } = await import("../ui/feedback.js");
          const value = await promptDialog({
            title: `Meta para "${tile.title || kpi.label}"`,
            label: "Valor da meta (deixe vazio para remover)",
            value: tile.options?.goal ?? "",
          });
          update((s) => {
            const dash = s.dashboards.find((d) => d.id === dashboard.id);
            const t = dash?.tiles.find((x) => x.id === tile.id);
            if (t) t.options = { ...(t.options || {}), goal: value ? Number(value) : undefined };
          }, { reason: "kpi:goal" });
          renderIndicatorsView(root);
        },
      }),
    ]),
  ]);
}

/* --------------------------------------------------------------- alertas */

function alertsSection(root) {
  const state = getState();
  return el("div.card", { style: { marginBottom: "20px" } }, [
    el("div.card__head", {}, [
      el("div", {}, [
        el("div.card__title", { text: "Alertas" }),
        el("div.card__sub", { text: "Regras verificadas quando você atualiza os dados ou clica em “Verificar agora”." }),
      ]),
      el("button.btn.btn--sm", { "on:click": () => runAlerts(root) }, [icon("refresh", { size: 13 }), el("span", { text: "Verificar agora" })]),
    ]),
    el("div.card__body", {}, [
      state.alerts.length
        ? el("div.stack-2", {}, state.alerts.map((alert) => alertRow(alert, root)))
        : el("p.muted.t-xs", { text: "Nenhum alerta configurado." }),
      el("div.disclaimer", { style: { marginTop: "12px" } }, [
        icon("info", { size: 13 }),
        el("span", {
          text: "Notificação interna funciona nesta versão. Envio por e-mail, WhatsApp e webhook precisa de um servidor — as regras ficam salvas e prontas para quando o back-end for conectado (ver docs/ARQUITETURA.md).",
        }),
      ]),
    ]),
  ]);
}

function alertRow(alert, root) {
  const state = getState();
  const dataset = state.datasets.find((d) => d.id === alert.datasetId);
  return el("div.list__row", {}, [
    el("span.badge", { class: alert.enabled ? "badge badge--ok" : "badge badge--neutral", text: alert.enabled ? "ativo" : "pausado" }),
    el("div.grow", {}, [
      el("div.t-xs", { text: alert.name }),
      el("div.dim", {
        style: { fontSize: "10px" },
        text: `${dataset?.name || "?"} · ${AGGREGATIONS[alert.agg]?.label || alert.agg} de ${alert.field} ${ALERT_OPS[alert.op]} ${alert.value}`,
      }),
    ]),
    el("div.row", {}, (alert.channels || []).map((c) => el("span.chip", { text: c }))),
    el("button.btn.btn--ghost.btn--icon.btn--sm", {
      "aria-label": alert.enabled ? "Pausar" : "Ativar",
      "on:click": () => {
        update((s) => {
          const a = s.alerts.find((x) => x.id === alert.id);
          if (a) a.enabled = !a.enabled;
        }, { reason: "alert" });
        renderIndicatorsView(root);
      },
    }, [icon(alert.enabled ? "eye" : "eyeOff", { size: 13 })]),
    el("button.btn.btn--ghost.btn--icon.btn--sm.btn--danger", {
      "aria-label": "Excluir alerta",
      "on:click": () => {
        update((s) => {
          s.alerts = s.alerts.filter((x) => x.id !== alert.id);
        }, { reason: "alert" });
        renderIndicatorsView(root);
      },
    }, [icon("trash", { size: 13 })]),
  ]);
}

function openAlertDialog(existing, root) {
  const state = getState();
  const datasetSelect = el("select.select", {}, state.datasets.map((d) => el("option", { value: d.id, text: d.name })));
  const fieldSelect = el("select.select");
  const aggSelect = el(
    "select.select",
    {},
    Object.entries(AGGREGATIONS).map(([value, def]) => el("option", { value, text: def.label }))
  );
  const opSelect = el("select.select", {}, Object.entries(ALERT_OPS).map(([value, label]) => el("option", { value, text: label })));
  const valueInput = el("input.input", { type: "number", placeholder: "0" });
  const nameInput = el("input.input", { placeholder: "Ex.: Faturamento abaixo da meta" });
  const channels = { interna: true, email: false, whatsapp: false, webhook: false };

  const syncFields = () => {
    const dataset = state.datasets.find((d) => d.id === datasetSelect.value);
    render(fieldSelect, (dataset?.fields || []).map((f) => el("option", { value: f.name, text: f.label || f.name })));
  };
  datasetSelect.addEventListener("change", syncFields);
  syncFields();

  const ref = modal({
    title: "Novo alerta",
    body: el("div.stack-3", {}, [
      el("div.field", {}, [el("label", { text: "Nome" }), nameInput]),
      el("div.grid-2", {}, [
        el("div.field", {}, [el("label", { text: "Fonte" }), datasetSelect]),
        el("div.field", {}, [el("label", { text: "Campo" }), fieldSelect]),
      ]),
      el("div.grid-2", {}, [
        el("div.field", {}, [el("label", { text: "Cálculo" }), aggSelect]),
        el("div.field", {}, [el("label", { text: "Disparar quando" }), opSelect]),
      ]),
      el("div.field", {}, [el("label", { text: "Valor de referência" }), valueInput]),
      el("div.field", {}, [
        el("label", { text: "Canais" }),
        el("div.row.wrap", {}, Object.keys(channels).map((key) =>
          el("label.check", {}, [
            el("input", {
              type: "checkbox",
              checked: channels[key] ? "checked" : null,
              disabled: key !== "interna",
              "on:change": (e) => {
                channels[key] = e.target.checked;
              },
            }),
            el("span", { text: key === "interna" ? "Notificação interna" : key }),
          ])
        )),
      ]),
    ]),
    actions: [
      el("button.btn", { text: "Cancelar", "on:click": () => ref.close() }),
      el("button.btn.btn--primary", {
        text: "Criar alerta",
        "on:click": () => {
          if (!nameInput.value.trim()) {
            toast("Informe um nome", { level: "warn" });
            return;
          }
          update((s) => {
            s.alerts.push({
              id: uid("alt"),
              name: nameInput.value.trim(),
              datasetId: datasetSelect.value,
              field: fieldSelect.value,
              agg: aggSelect.value,
              op: opSelect.value,
              value: Number(valueInput.value) || 0,
              channels: Object.entries(channels).filter(([, v]) => v).map(([k]) => k),
              enabled: true,
            });
          }, { reason: "alert" });
          ref.close();
          renderIndicatorsView(root);
        },
      }),
    ],
  });
  void existing;
}

/** Avalia todas as regras e gera notificações internas. */
export async function runAlerts(root) {
  const state = getState();
  let fired = 0;
  for (const alert of state.alerts.filter((a) => a.enabled)) {
    const source = await resolveDataset(alert.datasetId);
    if (!source) continue;
    const { aggregate } = await import("../data/transform.js");
    const value = aggregate(source.rows.map((r) => r[alert.field]), alert.agg);
    const triggered =
      (alert.op === "lt" && value < alert.value) ||
      (alert.op === "lte" && value <= alert.value) ||
      (alert.op === "gt" && value > alert.value) ||
      (alert.op === "gte" && value >= alert.value);
    if (triggered) {
      fired += 1;
      pushNotification({
        level: "warn",
        title: alert.name,
        message: `${AGGREGATIONS[alert.agg]?.label} de ${alert.field} = ${fmtByType(value, "number")} (${ALERT_OPS[alert.op]} ${alert.value}).`,
      });
    }
  }
  toast(fired ? `${fired} alerta(s) disparado(s)` : "Nenhum alerta disparado", {
    level: fired ? "warn" : "success",
  });
  if (root) renderIndicatorsView(root);
}

/* -------------------------------------------------- medidas calculadas -- */

function measuresSection(root) {
  const state = getState();
  const computed = [];
  for (const dataset of state.datasets) {
    for (const step of dataset.transforms || []) {
      if (step.type === "computedColumn") computed.push({ dataset, step });
    }
  }

  return el("div.card", {}, [
    el("div.card__head", {}, [
      el("div", {}, [
        el("div.card__title", { text: "Medidas calculadas" }),
        el("div.card__sub", { text: "Colunas criadas por fórmula, disponíveis em todos os componentes." }),
      ]),
    ]),
    el("div.card__body", {}, [
      computed.length
        ? el("div.stack-2", {}, computed.map(({ dataset, step }) =>
            el("div.list__row", {}, [
              icon("wand", { size: 14 }),
              el("div.grow", {}, [
                el("div.t-xs", { text: `${step.name} (${dataset.name})` }),
                el("code.dim", { style: { fontSize: "10px" }, text: step.expr }),
              ]),
              el("button.btn.btn--ghost.btn--icon.btn--sm.btn--danger", {
                "aria-label": "Excluir medida",
                "on:click": async () => {
                  const ok = await confirmDialog({
                    title: "Excluir medida",
                    message: `A coluna "${step.name}" deixará de existir. Componentes que a usam ficarão vazios.`,
                    danger: true,
                    confirmLabel: "Excluir",
                  });
                  if (!ok) return;
                  update((s) => {
                    const ds = s.datasets.find((d) => d.id === dataset.id);
                    if (ds) ds.transforms = ds.transforms.filter((t) => t.id !== step.id);
                  }, { reason: "measure:remove" });
                  invalidateDerived(dataset.id);
                  renderIndicatorsView(root);
                },
              }, [icon("trash", { size: 13 })]),
            ])
          ))
        : el("p.muted.t-xs", { text: "Nenhuma medida calculada. Crie uma para calcular margem, ticket médio, ROI e afins." }),
    ]),
  ]);
}

function openMeasureDialog(root) {
  const state = getState();
  const datasetSelect = el("select.select", {}, state.datasets.map((d) => el("option", { value: d.id, text: d.name })));
  const nameInput = el("input.input", { placeholder: "Ex.: Margem (%)" });
  const exprInput = el("textarea.input", { rows: "3", placeholder: "([Faturamento] - [Custo]) / [Faturamento] * 100" });
  const feedback = el("div.t-xs.muted");
  const fieldsBox = el("div.row.wrap");

  const syncFields = () => {
    const dataset = state.datasets.find((d) => d.id === datasetSelect.value);
    render(
      fieldsBox,
      (dataset?.fields || []).map((f) =>
        el("button.chip", {
          text: f.name,
          "on:click": () => {
            exprInput.value += `[${f.name}]`;
            validate();
            exprInput.focus();
          },
        })
      )
    );
  };

  const validate = () => {
    const dataset = state.datasets.find((d) => d.id === datasetSelect.value);
    const result = compileFormula(exprInput.value, (dataset?.fields || []).map((f) => f.name));
    if (!exprInput.value.trim()) {
      feedback.textContent = "";
      return;
    }
    feedback.className = result.ok ? "t-xs text-pos" : "t-xs text-neg";
    feedback.textContent = result.ok ? `✓ ${explainFormula(exprInput.value)}` : `✗ ${result.error}`;
  };

  exprInput.addEventListener("input", validate);
  datasetSelect.addEventListener("change", syncFields);
  syncFields();

  const ref = modal({
    title: "Nova medida calculada",
    wide: true,
    body: el("div.stack-3", {}, [
      el("div.grid-2", {}, [
        el("div.field", {}, [el("label", { text: "Fonte" }), datasetSelect]),
        el("div.field", {}, [el("label", { text: "Nome da medida" }), nameInput]),
      ]),
      el("div.field", {}, [el("label", { text: "Fórmula" }), exprInput, feedback]),
      el("div.field", {}, [el("label", { text: "Campos disponíveis (clique para inserir)" }), fieldsBox]),
      el("details", {}, [
        el("summary.t-xs.muted", { style: { cursor: "pointer" }, text: "Funções disponíveis" }),
        el("div.stack-2", { style: { marginTop: "8px" } }, Object.entries(FUNCTIONS).map(([name, def]) =>
          el("div.t-xs.muted", {}, [el("code", { text: name }), el("span", { text: ` — ${def.help}` })])
        )),
      ]),
    ]),
    actions: [
      el("button.btn", { text: "Cancelar", "on:click": () => ref.close() }),
      el("button.btn.btn--primary", {
        text: "Criar medida",
        "on:click": () => {
          const dataset = state.datasets.find((d) => d.id === datasetSelect.value);
          const result = compileFormula(exprInput.value, (dataset?.fields || []).map((f) => f.name));
          if (!nameInput.value.trim()) return toast("Informe o nome", { level: "warn" });
          if (!result.ok) return toast("Fórmula inválida", { level: "error", message: result.error });
          update((s) => {
            const ds = s.datasets.find((d) => d.id === dataset.id);
            if (ds) ds.transforms = [...(ds.transforms || []), createStep("computedColumn", { name: nameInput.value.trim(), expr: exprInput.value })];
          }, { reason: "measure:add" });
          invalidateDerived(dataset.id);
          ref.close();
          toast("Medida criada", { level: "success" });
          renderIndicatorsView(root);
          return true;
        },
      }),
    ],
  });
}

export { defaultAgg, NUMERIC_TYPES, upsertDashboard };
