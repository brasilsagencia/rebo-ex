/**
 * Brasil BI — visão do dashboard: grade de componentes, barra de filtros
 * ativos, editor de componente e painel de segmentações.
 */

import { el, render, uid, debounce, norm, fmtByType } from "../core/utils.js";
import { icon } from "../core/icons.js";
import { modal, toast, emptyState, confirmDialog, popover } from "../ui/feedback.js";
import {
  getState,
  activeDashboard,
  upsertDashboard,
  update,
  removeFilter,
  clearFilters,
  addGlobalFilter,
  hasDemoData,
} from "../core/store.js";
import { mountTile } from "../ui/tile.js";
import { CHART_TYPES, CHART_GROUPS, chartLabel } from "../charts/index.js";
import { resolveDataset, distinctValues, PERIOD_PRESETS } from "../data/query.js";
import { AGGREGATIONS, OP_LABEL } from "../data/transform.js";
import { NUMERIC_TYPES, TEMPORAL_TYPES, defaultAgg } from "../data/types.js";
import { suggestTiles } from "./templates.js";
import { navigate } from "../app.js";
import { installDemo } from "../demo/demo-data.js";

let mounted = [];

export function renderDashboardView(root) {
  const state = getState();
  const dashboard = activeDashboard();

  if (!state.datasets.length) {
    render(root, [
      emptyState({
        iconName: "upload",
        title: "Comece importando seus dados",
        message:
          "Envie um arquivo PDF, XLSX, CSV, JSON ou XML para gerar seu primeiro painel. Se preferir explorar antes, carregue os dados de demonstração — eles ficam sempre identificados como fictícios.",
        action: el("div.row", {}, [
          el("button.btn.btn--primary", { text: "Importar arquivo", "on:click": () => navigate("importar") }),
          el("button.btn", {
            text: "Carregar demonstração",
            "on:click": async (e) => {
              e.target.disabled = true;
              await installDemo();
              toast("Demonstração carregada", { level: "success", message: "Todos os dados estão marcados como fictícios." });
              navigate("visao-geral");
            },
          }),
        ]),
      }),
    ]);
    return;
  }

  if (!dashboard) {
    render(root, [
      emptyState({
        iconName: "dashboards",
        title: "Nenhum dashboard criado",
        message: "Crie um painel do zero ou use um dos modelos prontos.",
        action: el("button.btn.btn--primary", { text: "Criar dashboard", "on:click": () => navigate("dashboards") }),
      }),
    ]);
    return;
  }

  const grid = el("div.dash-grid", { id: "dash-grid" });
  mounted = [];

  for (const tile of dashboard.tiles) {
    const instance = mountTile(tile, {
      onEdit: (t) => openTileEditor(t, dashboard),
      onChanged: () => renderDashboardView(root),
    });
    mounted.push(instance);
    grid.append(instance.node);
  }

  render(root, [
    renderFilterBar(root),
    dashboard.isDemo || hasDemoData() ? demoBanner(root) : null,
    grid,
    el("div.row", { style: { marginTop: "18px" } }, [
      el("button.btn.btn--primary", { "on:click": () => openTileEditor(null, dashboard) }, [
        icon("plus", { size: 15 }),
        el("span", { text: "Adicionar componente" }),
      ]),
      el("button.btn", { "on:click": () => openSuggestions(dashboard) }, [
        icon("wand", { size: 15 }),
        el("span", { text: "Sugestões automáticas" }),
      ]),
    ]),
  ]);

  // Renderiza os dados depois do layout (garante medidas corretas do SVG).
  requestAnimationFrame(() => mounted.forEach((m) => m.refresh()));
}

/** Atualiza somente os dados dos tiles (usado quando filtros mudam). */
export function refreshTiles() {
  mounted.forEach((m) => m.refresh());
}

/* ---------------------------------------------------------- barra filtros */

function renderFilterBar(root) {
  const state = getState();
  const filters = [...state.filters.global, ...state.filters.selection];
  const period = state.period;
  const hasPeriod = period.preset && period.preset !== "todos";
  if (!filters.length && !hasPeriod) return null;

  return el("div.filterbar", { role: "status" }, [
    icon("filter", { size: 14 }),
    el("strong", { text: "Filtros ativos:" }),
    hasPeriod
      ? el("span.chip.chip--active", {}, [
          el("span", { text: `Período: ${PERIOD_PRESETS[period.preset] || period.preset}` }),
          el("button", {
            "aria-label": "Remover filtro de período",
            text: "×",
            "on:click": () => {
              update((s) => {
                s.period = { ...s.period, preset: "todos", from: null, to: null };
              }, { reason: "filter:period" });
              renderDashboardView(root);
            },
          }),
        ])
      : null,
    ...filters.map((f) =>
      el(`span.chip${f.sourceTile ? ".chip--active" : ""}`, {}, [
        el("span", { text: f.label || `${f.field} ${OP_LABEL[f.op] || f.op} ${formatFilterValue(f.value)}` }),
        el("button", {
          "aria-label": "Remover filtro",
          text: "×",
          "on:click": () => {
            removeFilter(f.id);
            renderDashboardView(root);
          },
        }),
      ])
    ),
    el("button.btn.btn--sm.btn--ghost", {
      style: { marginLeft: "auto" },
      "on:click": () => {
        clearFilters();
        renderDashboardView(root);
      },
    }, [icon("close", { size: 13 }), el("span", { text: "Limpar filtros" })]),
  ]);
}

function formatFilterValue(value) {
  if (Array.isArray(value)) return value.slice(0, 3).join(", ");
  return String(value ?? "");
}

function demoBanner(root) {
  const state = getState();
  if (state.prefs.demoBannerDismissed) return null;
  return el("div.card.card--pad", {
    style: { marginBottom: "16px", borderColor: "color-mix(in srgb, var(--warn) 45%, transparent)" },
  }, [
    el("div.row.wrap", {}, [
      el("span.badge.badge--demo", {}, [icon("info", { size: 11 }), el("span", { text: "Dados de demonstração" })]),
      el("span.grow.t-xs.muted", {
        text: "Os números deste painel são fictícios, gerados pelo próprio sistema para você conhecer os recursos. Nenhum dado real seu está sendo exibido.",
      }),
      el("button.btn.btn--sm", { text: "Importar dados reais", "on:click": () => navigate("importar") }),
      el("button.btn.btn--sm.btn--ghost", {
        text: "Ocultar aviso",
        "on:click": () => {
          update((s) => {
            s.prefs.demoBannerDismissed = true;
          }, { reason: "prefs" });
          renderDashboardView(root);
        },
      }),
    ]),
  ]);
}

/* ------------------------------------------------------- editor de tile -- */

/**
 * Editor visual de um componente (novo ou existente).
 * @param {Object|null} existing
 * @param {Object} dashboard
 */
export async function openTileEditor(existing, dashboard) {
  const state = getState();
  if (!state.datasets.length) {
    toast("Importe uma fonte de dados primeiro", { level: "warn" });
    return;
  }

  const tile = existing
    ? JSON.parse(JSON.stringify(existing))
    : {
        id: uid("tile"),
        type: "column",
        datasetId: dashboard.datasetId || state.datasets[0].id,
        title: "",
        measures: [],
        options: {},
        layout: { col: 6, h: 3 },
      };

  const body = el("div.stack-4");
  const previewBox = el("div.card", { style: { padding: "10px", minHeight: "260px", display: "flex" } });

  const ref = modal({
    title: existing ? "Editar componente" : "Adicionar componente",
    wide: true,
    body: el("div.layout-split", { style: { gridTemplateColumns: "1fr 380px" } }, [previewBox, body]),
    actions: [
      el("button.btn", { text: "Cancelar", "on:click": () => ref.close() }),
      el("button.btn.btn--primary", {
        text: existing ? "Salvar alterações" : "Adicionar ao dashboard",
        "on:click": () => {
          const idx = dashboard.tiles.findIndex((t) => t.id === tile.id);
          if (idx >= 0) dashboard.tiles[idx] = tile;
          else dashboard.tiles.push(tile);
          upsertDashboard(dashboard);
          ref.close();
          toast(existing ? "Componente atualizado" : "Componente adicionado", { level: "success" });
          document.dispatchEvent(new CustomEvent("bi:dashboard-changed"));
        },
      }),
    ],
  });

  let source = await resolveDataset(tile.datasetId);

  const updatePreview = debounce(async () => {
    previewBox.replaceChildren();
    const preview = mountTile({ ...tile, locked: true }, {});
    previewBox.append(preview.node);
    preview.node.style.width = "100%";
    requestAnimationFrame(() => preview.refresh());
  }, 180);

  const rerender = async () => {
    source = await resolveDataset(tile.datasetId);
    const fields = source?.fields || [];
    const requires = CHART_TYPES[tile.type]?.requires || { dimension: true, measures: [1, 3], breakdown: "optional" };
    const dims = fields.filter((f) => !NUMERIC_TYPES.has(f.type) || f.role !== "measure");
    const nums = fields;

    render(body, [
      /* tipo de visualização */
      el("div.field", {}, [
        el("label", { text: "Tipo de visualização" }),
        el(
          "select.select",
          {
            "on:change": (e) => {
              tile.type = e.target.value;
              const size = CHART_TYPES[tile.type]?.defaultSize;
              if (size) tile.layout = { ...size };
              normalizeTile(tile, fields);
              rerender();
            },
          },
          CHART_GROUPS.map((group) =>
            el(
              "optgroup",
              { label: group },
              Object.entries(CHART_TYPES)
                .filter(([, def]) => def.group === group)
                .map(([id, def]) =>
                  el("option", { value: id, selected: tile.type === id ? "selected" : null, text: def.label })
                )
            )
          )
        ),
      ]),

      /* fonte */
      el("div.field", {}, [
        el("label", { text: "Fonte de dados" }),
        el(
          "select.select",
          {
            "on:change": async (e) => {
              tile.datasetId = e.target.value;
              tile.dimension = null;
              tile.breakdown = null;
              tile.measures = [];
              await rerender();
            },
          },
          state.datasets.map((d) =>
            el("option", { value: d.id, selected: tile.datasetId === d.id ? "selected" : null, text: d.name })
          )
        ),
      ]),

      /* título */
      el("div.field", {}, [
        el("label", { text: "Título" }),
        el("input.input", {
          value: tile.title || "",
          placeholder: chartLabel(tile.type),
          "on:input": (e) => {
            tile.title = e.target.value;
            updatePreview();
          },
        }),
      ]),

      /* dimensão */
      requires.dimension
        ? el("div.field", {}, [
            el("label", { text: "Dimensão (eixo / categorias)" }),
            el(
              "select.select",
              {
                "on:change": (e) => {
                  tile.dimension = e.target.value || null;
                  const field = fields.find((f) => f.name === tile.dimension);
                  tile.grain = field && TEMPORAL_TYPES.has(field.type) ? tile.grain || "month" : undefined;
                  rerender();
                },
              },
              [
                el("option", { value: "", text: "— selecione —" }),
                ...dims.map((f) =>
                  el("option", { value: f.name, selected: tile.dimension === f.name ? "selected" : null, text: f.label || f.name })
                ),
              ]
            ),
          ])
        : null,

      /* granularidade de data */
      tile.dimension && TEMPORAL_TYPES.has(fields.find((f) => f.name === tile.dimension)?.type)
        ? el("div.field", {}, [
            el("label", { text: "Agrupar datas por" }),
            el(
              "select.select",
              {
                "on:change": (e) => {
                  tile.grain = e.target.value;
                  updatePreview();
                },
              },
              [
                ["day", "Dia"],
                ["week", "Semana"],
                ["month", "Mês"],
                ["quarter", "Trimestre"],
                ["year", "Ano"],
              ].map(([value, label]) => el("option", { value, selected: tile.grain === value ? "selected" : null, text: label }))
            ),
          ])
        : null,

      /* breakdown */
      requires.breakdown !== "none"
        ? el("div.field", {}, [
            el("label", {
              text: requires.breakdown === "required" ? "Dividir por (obrigatório)" : "Dividir por (opcional)",
            }),
            el(
              "select.select",
              {
                "on:change": (e) => {
                  tile.breakdown = e.target.value || null;
                  updatePreview();
                },
              },
              [
                el("option", { value: "", text: "— nenhum —" }),
                ...dims
                  .filter((f) => f.name !== tile.dimension)
                  .map((f) =>
                    el("option", { value: f.name, selected: tile.breakdown === f.name ? "selected" : null, text: f.label || f.name })
                  ),
              ]
            ),
          ])
        : null,

      /* medidas */
      requires.measures[1] > 0 ? measuresEditor(tile, nums, requires, rerender, updatePreview) : null,

      /* limite e ordenação */
      requires.dimension
        ? el("div.grid-2", {}, [
            el("div.field", {}, [
              el("label", { text: "Máximo de categorias" }),
              el("input.input", {
                type: "number",
                min: "0",
                value: String(tile.limit || ""),
                placeholder: "todas",
                "on:change": (e) => {
                  tile.limit = Number(e.target.value) || undefined;
                  updatePreview();
                },
              }),
            ]),
            el("div.field", {}, [
              el("label", { text: "Ordenar por" }),
              el(
                "select.select",
                {
                  "on:change": (e) => {
                    const [by, dir] = e.target.value.split("|");
                    tile.sort = by ? { by, dir } : undefined;
                    updatePreview();
                  },
                },
                [
                  ["", "Padrão"],
                  ["m0|desc", "Medida (maior primeiro)"],
                  ["m0|asc", "Medida (menor primeiro)"],
                  ["dimension|asc", "Categoria (A→Z)"],
                  ["dimension|desc", "Categoria (Z→A)"],
                ].map(([value, label]) =>
                  el("option", {
                    value,
                    selected: `${tile.sort?.by || ""}|${tile.sort?.dir || ""}` === value ? "selected" : null,
                    text: label,
                  })
                )
              ),
            ]),
          ])
        : null,

      /* opções visuais */
      el("details", { open: "" }, [
        el("summary.section-title", { style: { cursor: "pointer" }, text: "Aparência e comportamento" }),
        el("div.stack-3", { style: { paddingTop: "8px" } }, [
          el("div.grid-2", {}, [
            el("div.field", {}, [
              el("label", { text: "Largura (colunas de 12)" }),
              el("input.input", {
                type: "number",
                min: "2",
                max: "12",
                value: String(tile.layout?.col || 6),
                "on:change": (e) => {
                  tile.layout = { ...(tile.layout || {}), col: Number(e.target.value) };
                  updatePreview();
                },
              }),
            ]),
            el("div.field", {}, [
              el("label", { text: "Altura (1 a 5)" }),
              el("input.input", {
                type: "number",
                min: "1",
                max: "5",
                value: String(tile.layout?.h || 3),
                "on:change": (e) => {
                  tile.layout = { ...(tile.layout || {}), h: Number(e.target.value) };
                  updatePreview();
                },
              }),
            ]),
          ]),
          checkboxOption(tile, "showLegend", "Mostrar legenda", true, updatePreview),
          checkboxOption(tile, "showValues", "Mostrar valores nos elementos", false, updatePreview),
          checkboxOption(tile, "groupOthers", "Agrupar categorias menores em “Outros”", true, updatePreview),
          tile.type === "kpi" || tile.type === "gauge"
            ? el("div.grid-2", {}, [
                el("div.field", {}, [
                  el("label", { text: "Meta" }),
                  el("input.input", {
                    type: "number",
                    value: tile.options?.goal ?? "",
                    placeholder: "sem meta",
                    "on:change": (e) => {
                      tile.options = { ...(tile.options || {}), goal: e.target.value === "" ? undefined : Number(e.target.value) };
                      updatePreview();
                    },
                  }),
                ]),
                el("div.field", {}, [
                  el("label", { text: "Direção desejada" }),
                  el(
                    "select.select",
                    {
                      "on:change": (e) => {
                        tile.options = { ...(tile.options || {}), higherIsBetter: e.target.value === "maior" };
                        updatePreview();
                      },
                    },
                    [
                      el("option", { value: "maior", selected: tile.options?.higherIsBetter !== false ? "selected" : null, text: "Maior é melhor" }),
                      el("option", { value: "menor", selected: tile.options?.higherIsBetter === false ? "selected" : null, text: "Menor é melhor" }),
                    ]
                  ),
                ]),
              ])
            : null,
        ]),
      ]),
    ]);

    updatePreview();
  };

  await rerender();
}

function checkboxOption(tile, key, label, defaultValue, onChange) {
  return el("label.check", {}, [
    el("input", {
      type: "checkbox",
      checked: (tile.options?.[key] ?? defaultValue) ? "checked" : null,
      "on:change": (e) => {
        tile.options = { ...(tile.options || {}), [key]: e.target.checked };
        onChange();
      },
    }),
    el("span", { text: label }),
  ]);
}

function measuresEditor(tile, fields, requires, rerender, updatePreview) {
  const max = requires.measures[1];
  const list = el("div.stack-2");
  (tile.measures || []).forEach((measure, i) => {
    list.append(
      el("div.row", {}, [
        el(
          "select.select",
          {
            style: { flex: "2" },
            "on:change": (e) => {
              measure.field = e.target.value;
              updatePreview();
            },
          },
          fields.map((f) => el("option", { value: f.name, selected: measure.field === f.name ? "selected" : null, text: f.label || f.name }))
        ),
        el(
          "select.select",
          {
            style: { flex: "1" },
            "on:change": (e) => {
              measure.agg = e.target.value;
              updatePreview();
            },
          },
          Object.entries(AGGREGATIONS).map(([value, def]) =>
            el("option", { value, selected: measure.agg === value ? "selected" : null, text: def.label })
          )
        ),
        el("button.btn.btn--icon.btn--sm.btn--danger", {
          "aria-label": "Remover medida",
          "on:click": () => {
            tile.measures.splice(i, 1);
            rerender();
          },
        }, [icon("trash", { size: 13 })]),
      ])
    );
  });

  return el("div.field", {}, [
    el("label", { text: `Medidas (${(tile.measures || []).length}/${max})` }),
    list,
    (tile.measures || []).length < max
      ? el("button.btn.btn--sm", {
          "on:click": () => {
            const candidate = fields.find((f) => NUMERIC_TYPES.has(f.type)) || fields[0];
            if (!candidate) return;
            tile.measures = [...(tile.measures || []), { field: candidate.name, agg: defaultAgg(candidate) }];
            rerender();
          },
        }, [icon("plus", { size: 13 }), el("span", { text: "Adicionar medida" })])
      : null,
  ]);
}

/** Garante que o tile atenda aos requisitos do tipo escolhido. */
function normalizeTile(tile, fields) {
  const requires = CHART_TYPES[tile.type]?.requires;
  if (!requires) return;
  tile.measures = tile.measures || [];
  while (tile.measures.length > requires.measures[1]) tile.measures.pop();
  while (tile.measures.length < requires.measures[0]) {
    const used = new Set(tile.measures.map((m) => m.field));
    const candidate = fields.find((f) => NUMERIC_TYPES.has(f.type) && !used.has(f.name)) || fields[0];
    if (!candidate) break;
    tile.measures.push({ field: candidate.name, agg: defaultAgg(candidate) });
  }
  if (requires.dimension && !tile.dimension) {
    const dim = fields.find((f) => f.role === "dimension") || fields.find((f) => TEMPORAL_TYPES.has(f.type));
    if (dim) tile.dimension = dim.name;
  }
  if (requires.breakdown === "required" && !tile.breakdown) {
    const alt = fields.find((f) => f.role === "dimension" && f.name !== tile.dimension);
    if (alt) tile.breakdown = alt.name;
  }
  if (requires.breakdown === "none") tile.breakdown = null;
}

/* ------------------------------------------------------------ sugestões -- */

async function openSuggestions(dashboard) {
  const state = getState();
  const dataset = state.datasets.find((d) => d.id === (dashboard.datasetId || state.datasets[0].id));
  if (!dataset) return;
  const suggestions = suggestTiles(dataset);

  const ref = modal({
    title: "Componentes sugeridos",
    subtitle: `Baseado nos campos de "${dataset.name}"`,
    body: el("div.stack-2", {}, suggestions.map((s) =>
      el("div.list__row", {}, [
        icon("wand", { size: 14 }),
        el("span.grow", { text: s.label }),
        el("span.badge.badge--neutral", { text: chartLabel(s.type) }),
        el("button.btn.btn--sm.btn--primary", {
          text: "Adicionar",
          "on:click": (e) => {
            dashboard.tiles.push({
              id: uid("tile"),
              datasetId: dataset.id,
              title: s.label,
              type: s.type,
              dimension: s.dimension,
              grain: s.grain,
              measures: s.measures,
              limit: s.limit,
              options: {},
              layout: CHART_TYPES[s.type]?.defaultSize || { col: 6, h: 3 },
            });
            upsertDashboard(dashboard);
            e.target.disabled = true;
            e.target.textContent = "Adicionado";
            document.dispatchEvent(new CustomEvent("bi:dashboard-changed"));
          },
        }),
      ])
    )),
    actions: [el("button.btn", { text: "Fechar", "on:click": () => ref.close() })],
  });
}

/* -------------------------------------------------- painel de segmentações */

/** Painel lateral com filtros por campo (listas, intervalos e período). */
export async function openFilterPanel() {
  const state = getState();
  if (!state.datasets.length) {
    toast("Importe dados para usar os filtros", { level: "warn" });
    return;
  }
  const dashboard = activeDashboard();
  const datasetId = dashboard?.datasetId || state.datasets[0].id;
  const source = await resolveDataset(datasetId);
  if (!source) return;

  const body = el("div.stack-4");
  const ref = modal({
    title: "Filtros e segmentações",
    subtitle: source.dataset.name,
    body,
    actions: [
      el("button.btn.btn--danger", {
        text: "Limpar tudo",
        "on:click": () => {
          clearFilters();
          ref.close();
          document.dispatchEvent(new CustomEvent("bi:filters-changed"));
        },
      }),
      el("button.btn.btn--primary", { text: "Aplicar", "on:click": () => {
        ref.close();
        document.dispatchEvent(new CustomEvent("bi:filters-changed"));
      } }),
    ],
  });

  const dims = source.fields.filter((f) => f.role === "dimension" && (f.distinct ?? 0) <= 300).slice(0, 10);
  const nums = source.fields.filter((f) => NUMERIC_TYPES.has(f.type)).slice(0, 6);
  const dates = source.fields.filter((f) => TEMPORAL_TYPES.has(f.type));

  render(body, [
    dates.length ? periodSection(dates, datasetId) : null,
    ...dims.map((field) => listSection(field, source, datasetId)),
    ...nums.map((field) => rangeSection(field, source, datasetId)),
    el("div", {}, [
      el("div.section-title", { text: "Filtros favoritos" }),
      el("div.row.wrap", {}, [
        ...state.filters.saved.map((set) =>
          el("span.chip", {}, [
            el("button.btn.btn--ghost.btn--sm", {
              text: set.name,
              "on:click": () => {
                update((s) => {
                  s.filters.global = JSON.parse(JSON.stringify(set.filters));
                }, { reason: "filter:load" });
                ref.close();
                document.dispatchEvent(new CustomEvent("bi:filters-changed"));
              },
            }),
          ])
        ),
        el("button.btn.btn--sm", {
          "on:click": async () => {
            const { promptDialog } = await import("../ui/feedback.js");
            const name = await promptDialog({ title: "Salvar filtros", label: "Nome do conjunto", placeholder: "Ex.: Sudeste 2025" });
            if (!name) return;
            update((s) => {
              s.filters.saved.push({ id: uid("fs"), name, filters: JSON.parse(JSON.stringify(s.filters.global)) });
            }, { reason: "filter:save" });
            toast("Conjunto de filtros salvo", { level: "success" });
          },
        }, [icon("save", { size: 13 }), el("span", { text: "Salvar atuais" })]),
      ]),
    ]),
  ]);
}

function periodSection(dateFields, datasetId) {
  const state = getState();
  const custom = el("div.row", { style: { display: state.period.preset === "personalizado" ? "flex" : "none" } }, [
    el("input.input", {
      type: "date",
      value: state.period.from ? String(state.period.from).slice(0, 10) : "",
      "on:change": (e) => update((s) => {
        s.period.from = e.target.value;
      }, { reason: "filter:period" }),
    }),
    el("input.input", {
      type: "date",
      value: state.period.to ? String(state.period.to).slice(0, 10) : "",
      "on:change": (e) => update((s) => {
        s.period.to = e.target.value;
      }, { reason: "filter:period" }),
    }),
  ]);

  return el("div", {}, [
    el("div.section-title", {}, [icon("calendar", { size: 13 }), el("span", { text: "Período" })]),
    el("div.grid-2", {}, [
      el("div.field", {}, [
        el("label", { text: "Campo de data" }),
        el(
          "select.select",
          {
            "on:change": (e) => update((s) => {
              s.period.field = e.target.value;
              s.period.datasetId = datasetId;
            }, { reason: "filter:period" }),
          },
          dateFields.map((f) =>
            el("option", { value: f.name, selected: state.period.field === f.name ? "selected" : null, text: f.label || f.name })
          )
        ),
      ]),
      el("div.field", {}, [
        el("label", { text: "Intervalo" }),
        el(
          "select.select",
          {
            "on:change": (e) => {
              update((s) => {
                s.period.preset = e.target.value;
                if (!s.period.field) s.period.field = dateFields[0]?.name;
              }, { reason: "filter:period" });
              custom.style.display = e.target.value === "personalizado" ? "flex" : "none";
            },
          },
          Object.entries(PERIOD_PRESETS).map(([value, label]) =>
            el("option", { value, selected: state.period.preset === value ? "selected" : null, text: label })
          )
        ),
      ]),
    ]),
    custom,
  ]);
}

function listSection(field, source, datasetId) {
  const values = distinctValues(source.rows, field.name, 200);
  const state = getState();
  const existing = state.filters.global.find((f) => f.field === field.name && f.op === "in");
  const selected = new Set(existing?.value || []);

  const listEl = el("div.list");
  const draw = (term = "") => {
    render(
      listEl,
      values
        .filter((v) => !term || norm(v.value).includes(norm(term)))
        .slice(0, 120)
        .map((v) =>
          el("label.check.list__row", {}, [
            el("input", {
              type: "checkbox",
              checked: selected.has(v.value) ? "checked" : null,
              "on:change": (e) => {
                if (e.target.checked) selected.add(v.value);
                else selected.delete(v.value);
                applyList();
              },
            }),
            el("span.grow", { text: v.value }),
            el("span.dim", { text: String(v.count) }),
          ])
        )
    );
  };

  const applyList = () => {
    if (existing) removeFilter(existing.id);
    if (selected.size) {
      addGlobalFilter({
        field: field.name,
        op: "in",
        value: Array.from(selected),
        datasetId,
        label: `${field.label || field.name}: ${Array.from(selected).slice(0, 2).join(", ")}${selected.size > 2 ? ` +${selected.size - 2}` : ""}`,
      });
    }
  };

  draw();
  return el("div", {}, [
    el("div.section-title", { text: field.label || field.name }),
    el("input.input", {
      placeholder: "Pesquisar valores…",
      "on:input": debounce((e) => draw(e.target.value), 160),
      style: { marginBottom: "6px" },
    }),
    listEl,
  ]);
}

function rangeSection(field, source, datasetId) {
  const nums = source.rows.map((r) => Number(r[field.name])).filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const state = getState();
  const existing = state.filters.global.find((f) => f.field === field.name && f.op === "between");
  let lo = existing?.value?.[0] ?? min;
  let hi = existing?.value?.[1] ?? max;

  const apply = () => {
    if (existing) removeFilter(existing.id);
    if (lo > min || hi < max) {
      addGlobalFilter({
        field: field.name,
        op: "between",
        value: [lo, hi],
        datasetId,
        label: `${field.label || field.name}: ${fmtByType(lo, field.type)} a ${fmtByType(hi, field.type)}`,
      });
    }
  };

  return el("div.field", {}, [
    el("label", { text: `${field.label || field.name} (${fmtByType(min, field.type)} – ${fmtByType(max, field.type)})` }),
    el("div.row", {}, [
      el("input.input", {
        type: "number",
        value: String(lo),
        "on:change": (e) => {
          lo = Number(e.target.value);
          apply();
        },
      }),
      el("span.dim", { text: "até" }),
      el("input.input", {
        type: "number",
        value: String(hi),
        "on:change": (e) => {
          hi = Number(e.target.value);
          apply();
        },
      }),
    ]),
  ]);
}

export { confirmDialog, popover };
