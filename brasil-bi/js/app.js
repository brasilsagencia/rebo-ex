/**
 * Brasil BI — bootstrap da aplicação: shell, navegação, cabeçalho e atalhos.
 */

import { el, render, $, fmtRelative, debounce, norm } from "./core/utils.js";
import { icon } from "./core/icons.js";
import { initTheme, cycleTheme, themePreference } from "./core/theme.js";
import { storage } from "./core/db.js";
import {
  getState,
  subscribe,
  update,
  activeDashboard,
  upsertDashboard,
  markNotificationsRead,
  hasDemoData,
} from "./core/store.js";
import { toast, popover, modal, promptDialog } from "./ui/feedback.js";
import { PERIOD_PRESETS } from "./data/query.js";
import { parseShareLink } from "./export/exporters.js";

const ROUTES = [
  { id: "visao-geral", label: "Visão geral", icon: "overview", group: "Painéis" },
  { id: "dashboards", label: "Meus dashboards", icon: "dashboards", group: "Painéis" },
  { id: "fontes", label: "Fontes de dados", icon: "sources", group: "Dados" },
  { id: "importar", label: "Importar arquivos", icon: "upload", group: "Dados" },
  { id: "tratamento", label: "Tratamento de dados", icon: "prepare", group: "Dados" },
  { id: "modelagem", label: "Modelagem", icon: "model", group: "Dados" },
  { id: "indicadores", label: "Indicadores", icon: "kpi", group: "Análise" },
  { id: "relatorios", label: "Relatórios", icon: "reports", group: "Análise" },
  { id: "ia", label: "Análises com IA", icon: "ai", group: "Análise" },
  { id: "compartilhamentos", label: "Compartilhamentos", icon: "share", group: "Administração" },
  { id: "usuarios", label: "Usuários e permissões", icon: "users", group: "Administração" },
  { id: "configuracoes", label: "Configurações", icon: "settings", group: "Administração" },
  { id: "ajuda", label: "Central de ajuda", icon: "help", group: "Administração" },
];

let currentRoute = "visao-geral";
let currentParams = {};
let viewRoot = null;

/* -------------------------------------------------------------- navegação */

export function navigate(route, params = {}) {
  currentRoute = ROUTES.some((r) => r.id === route) ? route : "visao-geral";
  currentParams = params;
  const query = new URLSearchParams(params).toString();
  const hash = `#/${currentRoute}${query ? `?${query}` : ""}`;
  if (window.location.hash !== hash) window.location.hash = hash;
  else renderRoute();
}

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  if (raw.startsWith("compartilhado/")) return { route: "visao-geral", params: {} };
  const [route, query] = raw.split("?");
  return {
    route: ROUTES.some((r) => r.id === route) ? route : "visao-geral",
    params: Object.fromEntries(new URLSearchParams(query || "")),
  };
}

async function renderRoute() {
  if (!viewRoot) return;
  viewRoot.setAttribute("aria-busy", "true");
  renderSidebar();
  renderHeader();

  try {
    switch (currentRoute) {
      case "visao-geral": {
        const { renderDashboardView } = await import("./views/dashboard.js");
        renderDashboardView(viewRoot);
        break;
      }
      case "dashboards": {
        const { renderDashboardsView } = await import("./views/dashboards.js");
        renderDashboardsView(viewRoot);
        break;
      }
      case "fontes": {
        const { renderSourcesView } = await import("./views/sources.js");
        renderSourcesView(viewRoot);
        break;
      }
      case "importar": {
        const { renderImportView } = await import("./views/import.js");
        renderImportView(viewRoot);
        break;
      }
      case "tratamento": {
        const { renderPrepareView } = await import("./views/prepare.js");
        await renderPrepareView(viewRoot, currentParams);
        break;
      }
      case "modelagem": {
        const { renderModelView } = await import("./views/model.js");
        await renderModelView(viewRoot);
        break;
      }
      case "indicadores": {
        const { renderIndicatorsView } = await import("./views/indicators.js");
        await renderIndicatorsView(viewRoot);
        break;
      }
      case "relatorios": {
        const { renderReportsView } = await import("./views/reports.js");
        renderReportsView(viewRoot);
        break;
      }
      case "ia": {
        const { renderAiView } = await import("./views/ai.js");
        await renderAiView(viewRoot);
        break;
      }
      case "compartilhamentos": {
        const { renderSharesView } = await import("./views/admin.js");
        renderSharesView(viewRoot);
        break;
      }
      case "usuarios": {
        const { renderUsersView } = await import("./views/admin.js");
        renderUsersView(viewRoot);
        break;
      }
      case "configuracoes": {
        const { renderSettingsView } = await import("./views/admin.js");
        await renderSettingsView(viewRoot);
        break;
      }
      case "ajuda": {
        const { renderHelpView } = await import("./views/admin.js");
        renderHelpView(viewRoot);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("[brasil-bi] erro ao abrir a tela", currentRoute, err);
    render(viewRoot, [
      el("div.empty", {}, [
        el("div.empty__icon", {}, [icon("alert", { size: 22 })]),
        el("h3", { text: "Não foi possível abrir esta tela" }),
        el("p", { text: err.message }),
        el("button.btn", { text: "Tentar novamente", "on:click": () => renderRoute() }),
      ]),
    ]);
  } finally {
    viewRoot.removeAttribute("aria-busy");
    viewRoot.focus?.({ preventScroll: true });
  }
}

/* --------------------------------------------------------------- sidebar */

function renderSidebar() {
  const nav = $("#nav");
  if (!nav) return;
  const state = getState();
  const groups = [...new Set(ROUTES.map((r) => r.group))];

  render(
    nav,
    groups.flatMap((group) => [
      el("div.nav__group", { text: group }),
      ...ROUTES.filter((r) => r.group === group).map((route) =>
        el(
          `button.nav__item${route.id === currentRoute ? ".is-active" : ""}`,
          {
            "data-tip": route.label,
            "data-tip-pos": "right",
            "aria-current": route.id === currentRoute ? "page" : null,
            "on:click": () => {
              navigate(route.id);
              document.getElementById("app")?.removeAttribute("data-mobile-nav");
            },
          },
          [
            icon(route.icon, { size: 17 }),
            el("span", { text: route.label }),
            route.id === "fontes" && state.datasets.length ? el("span.nav__count", { text: String(state.datasets.length) }) : null,
            route.id === "dashboards" && state.dashboards.length ? el("span.nav__count", { text: String(state.dashboards.length) }) : null,
          ]
        )
      ),
    ])
  );
}

/* -------------------------------------------------------------- cabeçalho */

function renderHeader() {
  const header = $("#header");
  if (!header) return;
  const state = getState();
  const dashboard = activeDashboard();
  const unread = state.notifications.filter((n) => !n.read).length;

  const nameInput = el("input", {
    value: dashboard?.name || "Brasil BI",
    "aria-label": "Nome do dashboard",
    disabled: !dashboard,
    "on:change": (e) => {
      if (!dashboard) return;
      dashboard.name = e.target.value;
      upsertDashboard(dashboard);
    },
  });

  render(header, [
    el("button.btn.btn--ghost.btn--icon.no-print", {
      "aria-label": "Alternar menu",
      "on:click": () => {
        const app = document.getElementById("app");
        if (window.innerWidth <= 760) {
          const open = app.getAttribute("data-mobile-nav") === "open";
          if (open) app.removeAttribute("data-mobile-nav");
          else app.setAttribute("data-mobile-nav", "open");
        } else {
          const collapsed = app.getAttribute("data-sidebar") === "collapsed";
          app.setAttribute("data-sidebar", collapsed ? "expanded" : "collapsed");
          update((s) => {
            s.prefs.sidebar = collapsed ? "expanded" : "collapsed";
          }, { reason: "prefs" });
        }
      },
    }, [icon("menu", { size: 18 })]),

    el("div.header__title", {}, [
      el("div.header__name", {}, [nameInput, hasDemoData() ? el("span.badge.badge--demo", { text: "demo" }) : null]),
      el("div.header__meta", {}, [
        el("span.dot-live"),
        el("span", { text: `Atualizado ${state.lastRefresh ? fmtRelative(state.lastRefresh) : "—"}` }),
        !storage.durable ? el("span.text-warn", { text: "· armazenamento limitado" }) : null,
      ]),
    ]),

    el("div.header__search.no-print", {}, [
      icon("search", { size: 15 }),
      el("input.input", {
        id: "global-search",
        type: "search",
        placeholder: "Buscar (/)",
        "aria-label": "Buscar telas, fontes e dashboards",
        "on:input": debounce((e) => openSearch(e.target), 220),
      }),
    ]),

    el("div.header__actions.no-print", {}, [
      periodButton(state),
      el("button.btn", { "data-tip": "Filtros", "on:click": async () => {
        const { openFilterPanel } = await import("./views/dashboard.js");
        openFilterPanel();
      } }, [icon("filter", { size: 15 }), el("span", { text: "Filtros" })]),
      el("button.btn", { "data-tip": "Recalcular tudo", "on:click": () => refreshAll() }, [
        icon("refresh", { size: 15 }),
        el("span", { text: "Atualizar" }),
      ]),
      el("button.btn", { "on:click": () => navigate("importar") }, [icon("upload", { size: 15 }), el("span", { text: "Importar" })]),
      el("button.btn", { "on:click": () => navigate("relatorios") }, [icon("download", { size: 15 }), el("span", { text: "Exportar" })]),
      el("button.btn", { "on:click": () => navigate("compartilhamentos") }, [icon("share", { size: 15 }), el("span", { text: "Compartilhar" })]),
      el("button.btn.btn--icon", {
        "data-tip": `Tema: ${{ auto: "automático", dark: "escuro", light: "claro" }[themePreference()]}`,
        "aria-label": "Alternar tema",
        "on:click": (e) => {
          const next = cycleTheme();
          toast(`Tema: ${{ auto: "automático", dark: "escuro", light: "claro" }[next]}`, { level: "info", timeout: 1600 });
          renderHeader();
          void e;
        },
      }, [icon(themePreference() === "light" ? "sun" : themePreference() === "dark" ? "moon" : "settings", { size: 16 })]),
      el("button.btn.btn--icon", {
        "aria-label": `Notificações${unread ? ` (${unread} não lidas)` : ""}`,
        "data-tip": "Notificações",
        style: unread ? { borderColor: "var(--accent)", color: "var(--accent-text)" } : {},
        "on:click": (e) => openNotifications(e.currentTarget),
      }, [icon("bell", { size: 16 })]),
      el("button.btn.btn--icon", {
        "aria-label": "Perfil do usuário",
        "data-tip": state.user.name,
        "on:click": (e) => openProfile(e.currentTarget),
      }, [icon("users", { size: 16 })]),
    ]),
  ]);
}

function periodButton(state) {
  return el("button.btn", {
    "data-tip": "Selecionar período",
    "on:click": (e) =>
      popover(
        e.currentTarget,
        Object.entries(PERIOD_PRESETS).map(([value, label]) => ({
          label,
          icon: state.period.preset === value ? "check" : "calendar",
          onClick: async () => {
            if (value === "personalizado") {
              const { openFilterPanel } = await import("./views/dashboard.js");
              openFilterPanel();
              return;
            }
            update((s) => {
              s.period = { ...s.period, preset: value };
            }, { reason: "filter:period" });
            renderRoute();
          },
        }))
      ),
  }, [icon("calendar", { size: 15 }), el("span", { text: PERIOD_PRESETS[state.period.preset] || "Período" })]);
}

function openNotifications(anchor) {
  const state = getState();
  markNotificationsRead();
  popover(
    anchor,
    state.notifications.length
      ? state.notifications.slice(0, 10).map((n) => ({
          label: `${n.title} — ${fmtRelative(n.at)}`,
          icon: n.level === "warn" ? "alert" : n.level === "success" ? "check" : "info",
          onClick: () => {},
        }))
      : [{ label: "Nenhuma notificação", disabled: true }]
  );
  renderHeader();
}

function openProfile(anchor) {
  const state = getState();
  popover(anchor, [
    { label: `${state.user.name} · ${state.user.role}`, disabled: true, icon: "users" },
    "-",
    { label: "Usuários e permissões", icon: "users", onClick: () => navigate("usuarios") },
    { label: "Configurações", icon: "settings", onClick: () => navigate("configuracoes") },
    { label: "Central de ajuda", icon: "help", onClick: () => navigate("ajuda") },
  ]);
}

/* ----------------------------------------------------------------- busca */

function openSearch(input) {
  const term = norm(input.value);
  if (term.length < 2) return;
  const state = getState();
  const results = [
    ...ROUTES.filter((r) => norm(r.label).includes(term)).map((r) => ({
      label: `Ir para: ${r.label}`,
      icon: r.icon,
      onClick: () => navigate(r.id),
    })),
    ...state.datasets
      .filter((d) => norm(d.name).includes(term))
      .map((d) => ({ label: `Fonte: ${d.name}`, icon: "sources", onClick: () => navigate("tratamento", { dataset: d.id }) })),
    ...state.dashboards
      .filter((d) => norm(d.name).includes(term))
      .map((d) => ({
        label: `Dashboard: ${d.name}`,
        icon: "dashboards",
        onClick: () => {
          update((s) => {
            s.activeDashboardId = d.id;
          }, { reason: "dashboard:active" });
          navigate("visao-geral");
        },
      })),
  ].slice(0, 8);

  popover(input, results.length ? results : [{ label: "Nenhum resultado", disabled: true }], { align: "left" });
}

/* ------------------------------------------------------------- atualizar */

async function refreshAll() {
  const { invalidateDerived } = await import("./core/store.js");
  invalidateDerived();
  update((s) => {
    s.lastRefresh = new Date().toISOString();
  }, { reason: "refresh" });
  const { runAlerts } = await import("./views/indicators.js");
  await runAlerts(null);
  renderRoute();
  toast("Dados recalculados", { level: "success", timeout: 2000 });
}

/* ---------------------------------------------------------- onboarding -- */

function maybeOnboard() {
  const state = getState();
  if (state.onboarding.done || state.datasets.length) return;

  const steps = [
    "Criar conta", "Nomear o projeto", "Importar o primeiro arquivo", "Confirmar os dados",
    "Escolher o tipo de dashboard", "Selecionar indicadores", "Gerar o painel",
    "Personalizar cores", "Salvar", "Compartilhar ou exportar",
  ];

  const ref = modal({
    title: "Bem-vindo ao Brasil BI",
    subtitle: "Business Intelligence que roda no seu navegador",
    body: el("div.stack-4", {}, [
      el("p", {
        text: "Em poucos passos você transforma uma planilha, um CSV ou um PDF em um painel executivo interativo. Seus arquivos são lidos localmente — nada é enviado para servidores.",
      }),
      el("div.stepper", {}, steps.map((label, i) =>
        el(`div.step${i === 0 ? ".is-current" : ""}`, {}, [el("span.step__n", { text: String(i + 1) }), el("span", { text: label })])
      )),
      el("div.field", {}, [
        el("label", { text: "Como você quer começar?" }),
        el("div.row.wrap", {}, [
          el("button.btn.btn--primary", {
            "on:click": async () => {
              const name = await promptDialog({ title: "Nome do projeto", label: "Como vamos chamar este projeto?", value: "Meu primeiro projeto" });
              update((s) => {
                s.onboarding = { done: true, step: 2 };
                if (name) s.user.project = name;
              }, { reason: "onboarding" });
              ref.close();
              navigate("importar");
            },
          }, [icon("upload", { size: 15 }), el("span", { text: "Importar meu arquivo" })]),
          el("button.btn", {
            "on:click": async () => {
              const { installDemo } = await import("./demo/demo-data.js");
              await installDemo();
              update((s) => {
                s.onboarding = { done: true, step: 10 };
              }, { reason: "onboarding" });
              ref.close();
              navigate("visao-geral");
              toast("Demonstração carregada", { level: "success", message: "Os dados são fictícios e estão identificados como tal." });
            },
          }, [icon("play", { size: 15 }), el("span", { text: "Ver com dados de demonstração" })]),
        ]),
      ]),
    ]),
    actions: [
      el("button.btn.btn--ghost", {
        text: "Pular",
        "on:click": () => {
          update((s) => {
            s.onboarding.done = true;
          }, { reason: "onboarding" });
          ref.close();
        },
      }),
    ],
  });
}

/* ------------------------------------------------------------- atalhos -- */

function bindShortcuts() {
  let pendingG = false;
  document.addEventListener("keydown", (e) => {
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
    if (e.key === "/" && !typing) {
      e.preventDefault();
      document.getElementById("global-search")?.focus();
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

    if (pendingG) {
      pendingG = false;
      const map = { v: "visao-geral", i: "importar", a: "ia", d: "dashboards", f: "fontes", r: "relatorios" };
      if (map[e.key]) {
        e.preventDefault();
        navigate(map[e.key]);
      }
      return;
    }
    if (e.key === "g") {
      pendingG = true;
      setTimeout(() => {
        pendingG = false;
      }, 1200);
      return;
    }
    if (e.key === "t") {
      cycleTheme();
      renderHeader();
    }
    if (e.key === "f") {
      e.preventDefault();
      import("./views/dashboard.js").then((m) => m.openFilterPanel());
    }
  });
}

/* ----------------------------------------------------------------- boot */

function boot() {
  initTheme();
  viewRoot = $("#view");

  const state = getState();
  document.getElementById("app")?.setAttribute("data-sidebar", state.prefs.sidebar || "expanded");

  // Link compartilhado: aplica a configuração recebida.
  const shared = parseShareLink(window.location.hash);
  if (shared) {
    update((s) => {
      if (shared.d && s.dashboards.some((d) => d.id === shared.d)) s.activeDashboardId = shared.d;
      if (shared.f) s.filters.global = shared.f;
      if (shared.p) s.period = shared.p;
    }, { reason: "share:open" });
    toast("Configuração compartilhada aplicada", {
      level: "info",
      message: "Os dados vêm das fontes deste navegador — o link carrega apenas a configuração do painel.",
    });
  }

  const initial = parseHash();
  currentRoute = initial.route;
  currentParams = initial.params;

  window.addEventListener("hashchange", () => {
    const parsed = parseHash();
    currentRoute = parsed.route;
    currentParams = parsed.params;
    renderRoute();
  });

  document.addEventListener("bi:filters-changed", () => renderRoute());
  document.addEventListener("bi:dashboard-changed", () => renderRoute());
  document.addEventListener("bi:theme", () => {
    if (currentRoute === "visao-geral") renderRoute();
  });

  subscribe((_, reason) => {
    if (["filter:selection", "filter:add", "filter:remove", "filter:clear"].includes(reason)) {
      if (currentRoute === "visao-geral") {
        import("./views/dashboard.js").then((m) => m.renderDashboardView(viewRoot));
      }
    }
  });

  window.addEventListener(
    "resize",
    debounce(() => {
      if (currentRoute === "visao-geral") {
        import("./views/dashboard.js").then((m) => m.refreshTiles());
      }
    }, 320)
  );

  bindShortcuts();
  renderRoute();
  maybeOnboard();

  if (!storage.durable) {
    toast("Armazenamento local limitado", {
      level: "warn",
      message: storage.reason || "Os dados podem se perder ao fechar o navegador.",
    });
  }
}

document.addEventListener("DOMContentLoaded", boot);

export { ROUTES, renderRoute, refreshAll };
