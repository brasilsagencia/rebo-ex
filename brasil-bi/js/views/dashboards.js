/**
 * Brasil BI — meus dashboards: lista, criação a partir de modelos,
 * duplicação, renomeação e exclusão.
 */

import { el, render, fmtRelative } from "../core/utils.js";
import { icon } from "../core/icons.js";
import { modal, toast, confirmDialog, promptDialog, emptyState } from "../ui/feedback.js";
import {
  getState,
  update,
  upsertDashboard,
  removeDashboard,
  duplicateDashboard,
  createDashboard,
} from "../core/store.js";
import { TEMPLATES, buildAutoDashboard } from "./templates.js";
import { getRawRows } from "../core/store.js";
import { navigate } from "../app.js";

export function renderDashboardsView(root) {
  const state = getState();

  render(root, [
    el("div.view__head", {}, [
      el("div", {}, [
        el("h1", { text: "Meus dashboards" }),
        el("p", { text: "Painéis salvos neste navegador. Cada um pode usar fontes diferentes e ter seu próprio layout." }),
      ]),
      el("div.row", {}, [
        el("button.btn", { "on:click": () => openTemplateGallery(root) }, [icon("grid", { size: 15 }), el("span", { text: "Modelos prontos" })]),
        el("button.btn.btn--primary", {
          "on:click": async () => {
            const name = await promptDialog({ title: "Novo dashboard", label: "Nome", value: "Novo dashboard" });
            if (!name) return;
            const dashboard = createDashboard({ name, datasetId: state.datasets[0]?.id || null });
            upsertDashboard(dashboard);
            navigate("visao-geral");
          },
        }, [icon("plus", { size: 15 }), el("span", { text: "Criar dashboard" })]),
      ]),
    ]),

    state.dashboards.length
      ? el("div.grid-auto", {}, state.dashboards.map((dashboard) => dashboardCard(dashboard, root)))
      : emptyState({
          iconName: "dashboards",
          title: "Nenhum dashboard ainda",
          message: "Crie um painel do zero ou escolha um modelo pronto para o seu tipo de operação.",
          action: el("button.btn.btn--primary", { text: "Ver modelos", "on:click": () => openTemplateGallery(root) }),
        }),
  ]);
}

function dashboardCard(dashboard, root) {
  const state = getState();
  const isActive = state.activeDashboardId === dashboard.id;
  const dataset = state.datasets.find((d) => d.id === dashboard.datasetId);

  return el("div.card", { style: isActive ? { borderColor: "var(--accent)" } : {} }, [
    el("div.card__head", {}, [
      el("div", {}, [
        el("div.card__title", {}, [
          el("span", { text: dashboard.name }),
          dashboard.isDemo ? el("span.badge.badge--demo", { style: { marginLeft: "8px" }, text: "demonstração" }) : null,
        ]),
        el("div.card__sub", { text: dashboard.description || "Sem descrição" }),
      ]),
      isActive ? el("span.badge.badge--ok", { text: "ativo" }) : null,
    ]),
    el("div.card__body.stack-3", {}, [
      el("div.row.wrap.t-xs.muted", {}, [
        el("span", { text: `${dashboard.tiles.length} componentes` }),
        dataset ? el("span", { text: `fonte: ${dataset.name}` }) : null,
        el("span", { text: `atualizado ${fmtRelative(dashboard.updatedAt)}` }),
      ]),
      el("div.row.wrap", {}, [
        el("button.btn.btn--sm.btn--primary", {
          "on:click": () => {
            update((s) => {
              s.activeDashboardId = dashboard.id;
            }, { reason: "dashboard:active" });
            navigate("visao-geral");
          },
        }, [icon("play", { size: 13 }), el("span", { text: "Abrir" })]),
        el("button.btn.btn--sm", {
          "on:click": async () => {
            const name = await promptDialog({ title: "Renomear dashboard", label: "Nome", value: dashboard.name });
            if (!name) return;
            update((s) => {
              const d = s.dashboards.find((x) => x.id === dashboard.id);
              if (d) d.name = name;
            }, { reason: "dashboard:rename" });
            renderDashboardsView(root);
          },
        }, [icon("editor", { size: 13 }), el("span", { text: "Renomear" })]),
        el("button.btn.btn--sm", {
          "on:click": () => {
            duplicateDashboard(dashboard.id);
            toast("Dashboard duplicado", { level: "success" });
            renderDashboardsView(root);
          },
        }, [icon("copy", { size: 13 }), el("span", { text: "Duplicar" })]),
        el("button.btn.btn--sm.btn--danger", {
          "on:click": async () => {
            const ok = await confirmDialog({
              title: "Excluir dashboard",
              message: `"${dashboard.name}" será removido. As fontes de dados permanecem.`,
              confirmLabel: "Excluir",
              danger: true,
            });
            if (!ok) return;
            removeDashboard(dashboard.id);
            renderDashboardsView(root);
          },
        }, [icon("trash", { size: 13 })]),
      ]),
    ]),
  ]);
}

/* ------------------------------------------------------------- modelos --- */

function openTemplateGallery(root) {
  const state = getState();
  if (!state.datasets.length) {
    toast("Importe uma fonte de dados primeiro", { level: "warn" });
    return;
  }

  const datasetSelect = el(
    "select.select",
    {},
    state.datasets.map((d) => el("option", { value: d.id, text: d.name }))
  );

  const ref = modal({
    title: "Modelos prontos",
    subtitle: "O modelo é aplicado sobre a fonte escolhida — campos são reconhecidos por nome e tipo.",
    wide: true,
    body: el("div.stack-4", {}, [
      el("div.field", { style: { maxWidth: "420px" } }, [el("label", { text: "Fonte de dados" }), datasetSelect]),
      el("div.grid-auto", {}, TEMPLATES.map((template) =>
        el("button.card.card--pad", {
          style: { textAlign: "left", cursor: "pointer", border: "1px solid var(--border)", background: "var(--surface-3)" },
          "on:click": async () => {
            const dataset = state.datasets.find((d) => d.id === datasetSelect.value);
            const rows = await getRawRows(dataset.id);
            const dashboard = buildAutoDashboard(dataset, rows, { template: template.id });
            upsertDashboard(dashboard);
            ref.close();
            toast(`Modelo "${template.name}" aplicado`, {
              level: "success",
              message: `${dashboard.tiles.length} componentes criados. Ajuste o que precisar no editor.`,
            });
            navigate("visao-geral");
          },
        }, [
          el("div.row", { style: { marginBottom: "6px" } }, [
            icon(template.icon, { size: 16 }),
            el("strong", { text: template.name }),
          ]),
          el("div.t-xs.muted", { text: template.description }),
        ])
      )),
    ]),
    actions: [el("button.btn", { text: "Fechar", "on:click": () => ref.close() })],
  });
  void root;
}
