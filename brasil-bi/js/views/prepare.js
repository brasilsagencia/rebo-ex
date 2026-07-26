/**
 * Brasil BI — área de tratamento de dados (equivalente simplificado ao
 * Power Query): etapas em linha do tempo, prévia em tempo real, desfazer/refazer.
 */

import { el, render, fmtByType, fmtNumber, deepClone, debounce } from "../core/utils.js";
import { icon } from "../core/icons.js";
import { modal, toast, confirmDialog, popover, emptyState } from "../ui/feedback.js";
import { getState, update, invalidateDerived, getDataset } from "../core/store.js";
import { resolveDataset } from "../data/query.js";
import { STEP_TYPES, createStep, AGGREGATIONS, OP_LABEL } from "../data/transform.js";
import { TYPE_LABEL, NUMERIC_TYPES } from "../data/types.js";
import { compileFormula, FUNCTIONS, explainFormula } from "../data/formula.js";
import { profileDataset, suggestSteps } from "../data/profile.js";
import { navigate } from "../app.js";

const history = new Map(); // datasetId -> { past: [], future: [] }

export async function renderPrepareView(root, params = {}) {
  const state = getState();
  if (!state.datasets.length) {
    render(root, emptyState({
      iconName: "prepare",
      title: "Nenhuma fonte para tratar",
      message: "Importe um arquivo primeiro.",
      action: el("button.btn.btn--primary", { text: "Importar", "on:click": () => navigate("importar") }),
    }));
    return;
  }

  const datasetId = params.dataset || state.datasets[0].id;
  const dataset = getDataset(datasetId) || state.datasets[0];
  const source = await resolveDataset(dataset.id);
  const quality = profileDataset(source.rows, source.fields);

  const rerender = () => renderPrepareView(root, { dataset: dataset.id });

  const commit = (mutate, description) => {
    const entry = history.get(dataset.id) || { past: [], future: [] };
    entry.past.push(deepClone(dataset.transforms || []));
    entry.future = [];
    history.set(dataset.id, entry);
    update((s) => {
      const ds = s.datasets.find((d) => d.id === dataset.id);
      if (ds) mutate(ds);
    }, { reason: "transform" });
    invalidateDerived(dataset.id);
    if (description) toast(description, { level: "success", timeout: 2200 });
    rerender();
  };

  const undo = () => {
    const entry = history.get(dataset.id);
    if (!entry?.past.length) return;
    const previous = entry.past.pop();
    entry.future.push(deepClone(dataset.transforms || []));
    update((s) => {
      const ds = s.datasets.find((d) => d.id === dataset.id);
      if (ds) ds.transforms = previous;
    }, { reason: "transform:undo" });
    invalidateDerived(dataset.id);
    rerender();
  };

  const redo = () => {
    const entry = history.get(dataset.id);
    if (!entry?.future.length) return;
    const next = entry.future.pop();
    entry.past.push(deepClone(dataset.transforms || []));
    update((s) => {
      const ds = s.datasets.find((d) => d.id === dataset.id);
      if (ds) ds.transforms = next;
    }, { reason: "transform:redo" });
    invalidateDerived(dataset.id);
    rerender();
  };

  const entry = history.get(dataset.id) || { past: [], future: [] };

  render(root, [
    el("div.view__head", {}, [
      el("div", {}, [
        el("h1", { text: "Tratamento de dados" }),
        el("p", { text: "Cada ajuste vira uma etapa reversível. Os dados originais nunca são alterados — o resultado é sempre recalculado a partir deles." }),
      ]),
      el("div.row", {}, [
        el("button.btn", { disabled: !entry.past.length, "on:click": undo }, [icon("undo", { size: 15 }), el("span", { text: "Desfazer" })]),
        el("button.btn", { disabled: !entry.future.length, "on:click": redo }, [icon("redo", { size: 15 }), el("span", { text: "Refazer" })]),
      ]),
    ]),

    el("div.field", { style: { maxWidth: "420px", marginBottom: "18px" } }, [
      el("label", { text: "Fonte de dados" }),
      el(
        "select.select",
        { "on:change": (e) => navigate("tratamento", { dataset: e.target.value }) },
        state.datasets.map((d) => el("option", { value: d.id, selected: d.id === dataset.id ? "selected" : null, text: d.name }))
      ),
    ]),

    el("div.layout-split", {}, [
      /* prévia */
      el("div.stack-3", {}, [
        el("div.row.wrap", {}, [
          el("span.badge.badge--info", { text: `${fmtNumber(source.rows.length)} linhas` }),
          el("span.badge.badge--info", { text: `${source.fields.length} colunas` }),
          el(`span.badge.badge--${quality.score > 0.8 ? "ok" : "warn"}`, { text: `qualidade ${Math.round(quality.score * 100)}%` }),
          source.log?.some((l) => l.error)
            ? el("span.badge.badge--danger", { text: `${source.log.filter((l) => l.error).length} etapa(s) com erro` })
            : null,
        ]),
        el("div.card", {}, [
          el("div.card__head", {}, [
            el("div.card__title", { text: "Prévia (100 primeiras linhas)" }),
            el("button.btn.btn--sm.btn--primary", { "on:click": () => openAddStep({ dataset, source, commit }) }, [
              icon("plus", { size: 13 }),
              el("span", { text: "Nova etapa" }),
            ]),
          ]),
          el("div.table-wrap", { style: { maxHeight: "560px", border: "0", borderRadius: "0 0 var(--r-lg) var(--r-lg)" } }, [
            el("table.data", {}, [
              el("thead", {}, [
                el("tr", {}, source.fields.map((field) =>
                  el("th", {}, [
                    el("button.btn.btn--ghost.btn--sm", {
                      style: { padding: "0 4px", height: "20px", fontSize: "10px" },
                      "on:click": (e) => openColumnMenu(e.currentTarget, field, { dataset, source, commit }),
                    }, [
                      el("span", { text: field.label || field.name }),
                      icon("chevronDown", { size: 11 }),
                    ]),
                    el("div.dim", { style: { fontSize: "9px", fontWeight: "400" }, text: TYPE_LABEL[field.type] || field.type }),
                  ])
                )),
              ]),
              el("tbody", {}, source.rows.slice(0, 100).map((row) =>
                el("tr", {}, source.fields.map((f) =>
                  row[f.name] === null || row[f.name] === undefined || row[f.name] === ""
                    ? el("td.cell-null", { text: "vazio" })
                    : el("td", { text: fmtByType(row[f.name], f.type) })
                ))
              )),
            ]),
          ]),
        ]),
      ]),

      /* etapas */
      el("div.side-panel.stack-4", {}, [
        el("div.card.card--pad", {}, [
          el("div.section-title", {}, [icon("history", { size: 13 }), el("span", { text: "Etapas aplicadas" })]),
          (dataset.transforms || []).length
            ? el("div.tl", {}, dataset.transforms.map((step, i) => stepItem(step, i, { dataset, commit, source })))
            : el("p.muted.t-xs", { text: "Nenhuma etapa ainda. Use “Nova etapa” ou o menu de cada coluna." }),
        ]),

        el("div.card.card--pad", {}, [
          el("div.section-title", {}, [icon("wand", { size: 13 }), el("span", { text: "Sugestões" })]),
          (() => {
            const suggestions = suggestSteps(quality);
            return suggestions.length
              ? el("div.stack-2", {}, suggestions.map((s) =>
                  el("button.btn.btn--sm.btn--block", {
                    style: { justifyContent: "flex-start" },
                    "on:click": () => commit((ds) => {
                      ds.transforms = [...(ds.transforms || []), createStep(s.step.type, s.step)];
                    }, "Etapa adicionada"),
                  }, [icon("plus", { size: 12 }), el("span", { text: s.label })])
                ))
              : el("p.muted.t-xs", { text: "Nenhuma sugestão — os dados estão consistentes." });
          })(),
        ]),
      ]),
    ]),
  ]);
}

function stepItem(step, index, ctx) {
  const meta = STEP_TYPES[step.type];
  const errored = ctx.source.log?.find((l) => l.id === step.id)?.error;
  return el(`div.tl__item${step.enabled ? "" : ".is-off"}`, {}, [
    el("div.tl__dot", { text: String(index + 1) }),
    el("div.tl__body", {}, [
      el("div.tl__title", { text: meta?.label || step.type }),
      el("div.tl__desc", { text: meta?.describe ? meta.describe(step) : "" }),
      errored ? el("div.t-xs.text-neg", { text: `Erro: ${errored}` }) : null,
    ]),
    el("div.tl__acts", {}, [
      el("button.btn.btn--ghost.btn--icon.btn--sm", {
        "aria-label": step.enabled ? "Desativar etapa" : "Ativar etapa",
        "on:click": () => ctx.commit((ds) => {
          const s = ds.transforms.find((t) => t.id === step.id);
          if (s) s.enabled = !s.enabled;
        }),
      }, [icon(step.enabled ? "eye" : "eyeOff", { size: 13 })]),
      el("button.btn.btn--ghost.btn--icon.btn--sm", {
        "aria-label": "Mover para cima",
        disabled: index === 0,
        "on:click": () => ctx.commit((ds) => {
          const arr = ds.transforms;
          [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
        }),
      }, [icon("chevronLeft", { size: 13 })]),
      el("button.btn.btn--ghost.btn--icon.btn--sm.btn--danger", {
        "aria-label": "Excluir etapa",
        "on:click": () => ctx.commit((ds) => {
          ds.transforms = ds.transforms.filter((t) => t.id !== step.id);
        }, "Etapa removida"),
      }, [icon("trash", { size: 13 })]),
    ]),
  ]);
}

/* ---------------------------------------------------- menu por coluna ---- */

function openColumnMenu(anchor, field, ctx) {
  const add = (type, config, message) =>
    ctx.commit((ds) => {
      ds.transforms = [...(ds.transforms || []), createStep(type, config)];
    }, message);

  popover(anchor, [
    {
      label: "Renomear coluna",
      icon: "editor",
      onClick: async () => {
        const { promptDialog } = await import("../ui/feedback.js");
        const to = await promptDialog({ title: "Renomear coluna", label: "Novo nome", value: field.name });
        if (to && to !== field.name) add("renameColumn", { from: field.name, to }, "Coluna renomeada");
      },
    },
    {
      label: "Alterar tipo",
      icon: "layers",
      onClick: () => openTypeDialog(field, ctx),
    },
    { label: "Remover coluna", icon: "trash", onClick: () => add("dropColumns", { fields: [field.name] }, "Coluna removida") },
    "-",
    { label: "Aparar espaços", icon: "wand", onClick: () => add("trim", { field: field.name }, "Espaços removidos") },
    { label: "MAIÚSCULAS", icon: "wand", onClick: () => add("textCase", { field: field.name, mode: "upper" }) },
    { label: "minúsculas", icon: "wand", onClick: () => add("textCase", { field: field.name, mode: "lower" }) },
    { label: "Primeira Maiúscula", icon: "wand", onClick: () => add("textCase", { field: field.name, mode: "title" }) },
    "-",
    { label: "Substituir valores…", icon: "editor", onClick: () => openReplaceDialog(field, ctx) },
    { label: "Preencher vazios…", icon: "wand", onClick: () => openFillDialog(field, ctx) },
    { label: "Filtrar linhas…", icon: "filter", onClick: () => openFilterDialog(field, ctx) },
    { label: "Dividir coluna…", icon: "layers", onClick: () => openSplitDialog(field, ctx) },
    "-",
    { label: "Ordenar crescente", icon: "chevronDown", onClick: () => add("sortRows", { field: field.name, dir: "asc" }) },
    { label: "Ordenar decrescente", icon: "chevronDown", onClick: () => add("sortRows", { field: field.name, dir: "desc" }) },
  ]);
}

function openTypeDialog(field, ctx) {
  let type = field.type;
  const ref = modal({
    title: `Tipo de "${field.name}"`,
    body: el("div.field", {}, [
      el("label", { text: "Novo tipo" }),
      el(
        "select.select",
        { "on:change": (e) => { type = e.target.value; } },
        Object.entries(TYPE_LABEL).map(([value, label]) =>
          el("option", { value, selected: field.type === value ? "selected" : null, text: label })
        )
      ),
      el("p.dim.t-xs", { text: "Valores que não puderem ser convertidos ficarão vazios — o contador de erros aparece no perfil da fonte." }),
    ]),
    actions: [
      el("button.btn", { text: "Cancelar", "on:click": () => ref.close() }),
      el("button.btn.btn--primary", {
        text: "Aplicar",
        "on:click": () => {
          ctx.commit((ds) => {
            ds.transforms = [...(ds.transforms || []), createStep("setType", { field: field.name, toType: type })];
          }, "Tipo alterado");
          ref.close();
        },
      }),
    ],
  });
}

function openReplaceDialog(field, ctx) {
  const from = el("input.input", { placeholder: "valor atual" });
  const to = el("input.input", { placeholder: "novo valor" });
  const mode = el("select.select", {}, [
    el("option", { value: "exact", text: "Valor exato" }),
    el("option", { value: "contains", text: "Trecho do texto" }),
  ]);
  const ref = modal({
    title: `Substituir valores em "${field.name}"`,
    body: el("div.stack-3", {}, [
      el("div.field", {}, [el("label", { text: "Procurar" }), from]),
      el("div.field", {}, [el("label", { text: "Substituir por" }), to]),
      el("div.field", {}, [el("label", { text: "Modo" }), mode]),
    ]),
    actions: [
      el("button.btn", { text: "Cancelar", "on:click": () => ref.close() }),
      el("button.btn.btn--primary", {
        text: "Aplicar",
        "on:click": () => {
          ctx.commit((ds) => {
            ds.transforms = [
              ...(ds.transforms || []),
              createStep("replaceValues", { field: field.name, from: from.value, to: to.value, mode: mode.value }),
            ];
          }, "Valores substituídos");
          ref.close();
        },
      }),
    ],
  });
}

function openFillDialog(field, ctx) {
  const strategy = el("select.select", {}, [
    el("option", { value: "value", text: "Valor fixo" }),
    el("option", { value: "zero", text: "Zero" }),
    el("option", { value: "mean", text: "Média da coluna" }),
    el("option", { value: "median", text: "Mediana da coluna" }),
    el("option", { value: "previous", text: "Valor da linha anterior" }),
  ]);
  const value = el("input.input", { placeholder: "valor a usar" });
  const ref = modal({
    title: `Preencher vazios em "${field.name}"`,
    body: el("div.stack-3", {}, [
      el("div.field", {}, [el("label", { text: "Estratégia" }), strategy]),
      el("div.field", {}, [el("label", { text: "Valor (para estratégia “valor fixo”)" }), value]),
    ]),
    actions: [
      el("button.btn", { text: "Cancelar", "on:click": () => ref.close() }),
      el("button.btn.btn--primary", {
        text: "Aplicar",
        "on:click": () => {
          ctx.commit((ds) => {
            ds.transforms = [
              ...(ds.transforms || []),
              createStep("fillBlanks", { field: field.name, strategy: strategy.value, value: value.value }),
            ];
          }, "Vazios preenchidos");
          ref.close();
        },
      }),
    ],
  });
}

function openFilterDialog(field, ctx) {
  const op = el(
    "select.select",
    {},
    Object.entries(OP_LABEL)
      .filter(([key]) => !["in", "dateRange"].includes(key))
      .map(([value, label]) => el("option", { value, text: label }))
  );
  const value = el("input.input", { placeholder: "valor de comparação" });
  const ref = modal({
    title: `Filtrar por "${field.name}"`,
    body: el("div.stack-3", {}, [
      el("div.field", {}, [el("label", { text: "Condição" }), op]),
      el("div.field", {}, [el("label", { text: "Valor" }), value]),
      el("p.dim.t-xs", { text: "Apenas as linhas que atenderem à condição permanecem na tabela tratada." }),
    ]),
    actions: [
      el("button.btn", { text: "Cancelar", "on:click": () => ref.close() }),
      el("button.btn.btn--primary", {
        text: "Aplicar",
        "on:click": () => {
          ctx.commit((ds) => {
            ds.transforms = [
              ...(ds.transforms || []),
              createStep("filterRows", { field: field.name, op: op.value, value: value.value }),
            ];
          }, "Filtro aplicado");
          ref.close();
        },
      }),
    ],
  });
}

function openSplitDialog(field, ctx) {
  const sep = el("input.input", { value: " ", placeholder: "separador" });
  const names = el("input.input", { placeholder: "Parte 1; Parte 2" });
  const removeOriginal = el("input", { type: "checkbox" });
  const ref = modal({
    title: `Dividir "${field.name}"`,
    body: el("div.stack-3", {}, [
      el("div.field", {}, [el("label", { text: "Separador" }), sep]),
      el("div.field", {}, [el("label", { text: "Nomes das novas colunas (separados por ;)" }), names]),
      el("label.check", {}, [removeOriginal, el("span", { text: "Remover a coluna original" })]),
    ]),
    actions: [
      el("button.btn", { text: "Cancelar", "on:click": () => ref.close() }),
      el("button.btn.btn--primary", {
        text: "Aplicar",
        "on:click": () => {
          const into = names.value.split(";").map((s) => s.trim()).filter(Boolean);
          if (into.length < 2) {
            toast("Informe pelo menos dois nomes de coluna", { level: "warn" });
            return;
          }
          ctx.commit((ds) => {
            ds.transforms = [
              ...(ds.transforms || []),
              createStep("splitColumn", { field: field.name, separator: sep.value, into, removeOriginal: removeOriginal.checked }),
            ];
          }, "Coluna dividida");
          ref.close();
        },
      }),
    ],
  });
}

/* ------------------------------------------------------ nova etapa geral -- */

function openAddStep(ctx) {
  const state = getState();
  const others = state.datasets.filter((d) => d.id !== ctx.dataset.id);
  const options = [
    { id: "computedColumn", label: "Coluna calculada (fórmula)" },
    { id: "conditionalColumn", label: "Coluna condicional (regras)" },
    { id: "removeDuplicates", label: "Remover duplicidades" },
    { id: "groupRows", label: "Agrupar e resumir" },
    { id: "keepTop", label: "Limitar número de linhas" },
    ...(others.length ? [{ id: "appendDataset", label: "Anexar outra tabela" }, { id: "mergeDataset", label: "Mesclar com outra tabela" }] : []),
  ];

  const container = el("div.stack-3");
  let selected = options[0].id;

  const drawForm = () => {
    const form = el("div.stack-3");
    if (selected === "computedColumn") drawFormula(form, ctx);
    else if (selected === "conditionalColumn") drawConditional(form, ctx);
    else if (selected === "removeDuplicates") drawDuplicates(form, ctx);
    else if (selected === "groupRows") drawGroup(form, ctx);
    else if (selected === "keepTop") drawKeepTop(form, ctx);
    else if (selected === "appendDataset") drawCombine(form, ctx, others, "appendDataset");
    else if (selected === "mergeDataset") drawCombine(form, ctx, others, "mergeDataset");
    render(container, [
      el("div.field", {}, [
        el("label", { text: "Tipo de etapa" }),
        el(
          "select.select",
          {
            "on:change": (e) => {
              selected = e.target.value;
              drawForm();
            },
          },
          options.map((o) => el("option", { value: o.id, selected: o.id === selected ? "selected" : null, text: o.label }))
        ),
      ]),
      form,
    ]);
  };

  const ref = modal({ title: "Nova etapa de tratamento", wide: true, body: container });
  ctx.close = () => ref.close();
  drawForm();
}

function drawFormula(form, ctx) {
  const name = el("input.input", { placeholder: "Ex.: Margem" });
  const expr = el("textarea.input", { rows: "3", placeholder: "Ex.: ([Faturamento] - [Custo]) / [Faturamento] * 100" });
  const feedback = el("div.t-xs.muted");

  const validate = debounce(() => {
    const result = compileFormula(expr.value, ctx.source.fields.map((f) => f.name));
    if (!expr.value.trim()) {
      feedback.textContent = "";
      expr.classList.remove("input--invalid");
      return;
    }
    if (result.ok) {
      expr.classList.remove("input--invalid");
      feedback.className = "t-xs text-pos";
      feedback.textContent = `✓ ${explainFormula(expr.value)}`;
    } else {
      expr.classList.add("input--invalid");
      feedback.className = "t-xs text-neg";
      feedback.textContent = `✗ ${result.error}`;
    }
  }, 220);
  expr.addEventListener("input", validate);

  form.append(
    el("div.field", {}, [el("label", { text: "Nome da nova coluna" }), name]),
    el("div.field", {}, [el("label", { text: "Fórmula" }), expr, feedback]),
    el("details", {}, [
      el("summary.t-xs.muted", { style: { cursor: "pointer" }, text: "Campos e funções disponíveis" }),
      el("div.row.wrap", { style: { marginTop: "8px" } }, [
        ...ctx.source.fields.map((f) =>
          el("button.chip", {
            "on:click": () => {
              expr.value += `[${f.name}]`;
              validate();
              expr.focus();
            },
            text: f.name,
          })
        ),
      ]),
      el("div.row.wrap", { style: { marginTop: "8px" } },
        Object.entries(FUNCTIONS).map(([fnName, def]) =>
          el("button.chip", {
            title: def.help,
            "on:click": () => {
              expr.value += `${fnName}(`;
              validate();
              expr.focus();
            },
            text: fnName,
          })
        )
      ),
    ]),
    el("button.btn.btn--primary", {
      text: "Adicionar etapa",
      "on:click": () => {
        const result = compileFormula(expr.value, ctx.source.fields.map((f) => f.name));
        if (!name.value.trim()) return toast("Informe o nome da coluna", { level: "warn" });
        if (!result.ok) return toast("Corrija a fórmula", { level: "error", message: result.error });
        ctx.commit((ds) => {
          ds.transforms = [...(ds.transforms || []), createStep("computedColumn", { name: name.value.trim(), expr: expr.value })];
        }, "Coluna calculada criada");
        ctx.close?.();
        return true;
      },
    })
  );
}

function drawConditional(form, ctx) {
  const name = el("input.input", { placeholder: "Ex.: Faixa de valor" });
  const rules = [{ when: "", then: "" }];
  const rulesBox = el("div.stack-2");
  const otherwise = el("input.input", { placeholder: "Valor padrão (senão)" });

  const drawRules = () => {
    render(
      rulesBox,
      rules.map((rule, i) =>
        el("div.row", {}, [
          el("input.input", {
            placeholder: "condição — ex.: [Faturamento] > 10000",
            value: rule.when,
            "on:input": (e) => {
              rule.when = e.target.value;
            },
          }),
          el("input.input", {
            placeholder: "resultado",
            value: rule.then,
            style: { maxWidth: "160px" },
            "on:input": (e) => {
              rule.then = e.target.value;
            },
          }),
          el("button.btn.btn--icon.btn--sm.btn--danger", {
            "aria-label": "Remover regra",
            "on:click": () => {
              rules.splice(i, 1);
              drawRules();
            },
          }, [icon("trash", { size: 13 })]),
        ])
      )
    );
  };
  drawRules();

  form.append(
    el("div.field", {}, [el("label", { text: "Nome da nova coluna" }), name]),
    el("div.field", {}, [el("label", { text: "Regras (avaliadas em ordem)" }), rulesBox]),
    el("button.btn.btn--sm", {
      text: "Adicionar regra",
      "on:click": () => {
        rules.push({ when: "", then: "" });
        drawRules();
      },
    }),
    el("div.field", {}, [el("label", { text: "Senão" }), otherwise]),
    el("button.btn.btn--primary", {
      text: "Adicionar etapa",
      "on:click": () => {
        if (!name.value.trim()) return toast("Informe o nome da coluna", { level: "warn" });
        const valid = rules.filter((r) => r.when.trim());
        if (!valid.length) return toast("Adicione pelo menos uma regra", { level: "warn" });
        for (const rule of valid) {
          const result = compileFormula(rule.when, ctx.source.fields.map((f) => f.name));
          if (!result.ok) return toast("Condição inválida", { level: "error", message: result.error });
        }
        ctx.commit((ds) => {
          ds.transforms = [
            ...(ds.transforms || []),
            createStep("conditionalColumn", { name: name.value.trim(), rules: valid, otherwise: otherwise.value }),
          ];
        }, "Coluna condicional criada");
        ctx.close?.();
        return true;
      },
    })
  );
}

function drawDuplicates(form, ctx) {
  const selected = new Set();
  form.append(
    el("p.muted.t-xs", { text: "Marque as colunas que definem uma linha única. Sem marcar nenhuma, considera a linha inteira." }),
    el("div.row.wrap", {}, ctx.source.fields.map((f) =>
      el("label.check", {}, [
        el("input", {
          type: "checkbox",
          "on:change": (e) => {
            if (e.target.checked) selected.add(f.name);
            else selected.delete(f.name);
          },
        }),
        el("span", { text: f.name }),
      ])
    )),
    el("button.btn.btn--primary", {
      text: "Adicionar etapa",
      "on:click": () => {
        ctx.commit((ds) => {
          ds.transforms = [...(ds.transforms || []), createStep("removeDuplicates", { fields: Array.from(selected) })];
        }, "Duplicidades removidas");
        ctx.close?.();
      },
    })
  );
}

function drawGroup(form, ctx) {
  const dims = new Set();
  const aggs = [{ field: ctx.source.fields.find((f) => NUMERIC_TYPES.has(f.type))?.name, agg: "sum" }];
  const aggBox = el("div.stack-2");

  const drawAggs = () => {
    render(
      aggBox,
      aggs.map((spec, i) =>
        el("div.row", {}, [
          el(
            "select.select",
            { "on:change": (e) => { spec.field = e.target.value; } },
            ctx.source.fields.map((f) => el("option", { value: f.name, selected: spec.field === f.name ? "selected" : null, text: f.name }))
          ),
          el(
            "select.select",
            { style: { maxWidth: "160px" }, "on:change": (e) => { spec.agg = e.target.value; } },
            Object.entries(AGGREGATIONS).map(([value, def]) => el("option", { value, selected: spec.agg === value ? "selected" : null, text: def.label }))
          ),
          el("button.btn.btn--icon.btn--sm.btn--danger", {
            "aria-label": "Remover",
            "on:click": () => {
              aggs.splice(i, 1);
              drawAggs();
            },
          }, [icon("trash", { size: 13 })]),
        ])
      )
    );
  };
  drawAggs();

  form.append(
    el("div.field", {}, [
      el("label", { text: "Agrupar por" }),
      el("div.row.wrap", {}, ctx.source.fields.map((f) =>
        el("label.check", {}, [
          el("input", {
            type: "checkbox",
            "on:change": (e) => {
              if (e.target.checked) dims.add(f.name);
              else dims.delete(f.name);
            },
          }),
          el("span", { text: f.name }),
        ])
      )),
    ]),
    el("div.field", {}, [el("label", { text: "Calcular" }), aggBox]),
    el("button.btn.btn--sm", {
      text: "Adicionar cálculo",
      "on:click": () => {
        aggs.push({ field: ctx.source.fields[0].name, agg: "sum" });
        drawAggs();
      },
    }),
    el("div.disclaimer", {}, [
      icon("alert", { size: 13 }),
      el("span", { text: "Agrupar reduz a tabela: as colunas não listadas desaparecem do resultado." }),
    ]),
    el("button.btn.btn--primary", {
      text: "Adicionar etapa",
      "on:click": () => {
        if (!dims.size) return toast("Escolha ao menos uma coluna para agrupar", { level: "warn" });
        ctx.commit((ds) => {
          ds.transforms = [
            ...(ds.transforms || []),
            createStep("groupRows", { dimensions: Array.from(dims), aggs: aggs.filter((a) => a.field) }),
          ];
        }, "Agrupamento aplicado");
        ctx.close?.();
        return true;
      },
    })
  );
}

function drawKeepTop(form, ctx) {
  const n = el("input.input", { type: "number", value: "1000", min: "1" });
  form.append(
    el("div.field", {}, [el("label", { text: "Manter as primeiras N linhas" }), n]),
    el("button.btn.btn--primary", {
      text: "Adicionar etapa",
      "on:click": () => {
        ctx.commit((ds) => {
          ds.transforms = [...(ds.transforms || []), createStep("keepTop", { n: Number(n.value) })];
        }, "Limite aplicado");
        ctx.close?.();
      },
    })
  );
}

function drawCombine(form, ctx, others, type) {
  const target = el(
    "select.select",
    {},
    others.map((d) => el("option", { value: d.id, text: d.name }))
  );
  const leftKey = el(
    "select.select",
    {},
    ctx.source.fields.map((f) => el("option", { value: f.name, text: f.name }))
  );
  const rightKey = el("select.select", {});

  const syncRight = () => {
    const other = others.find((d) => d.id === target.value);
    render(rightKey, (other?.fields || []).map((f) => el("option", { value: f.name, text: f.name })));
  };
  target.addEventListener("change", syncRight);
  syncRight();

  form.append(
    el("div.field", {}, [el("label", { text: "Tabela" }), target]),
    type === "mergeDataset"
      ? el("div.grid-2", {}, [
          el("div.field", {}, [el("label", { text: "Chave nesta tabela" }), leftKey]),
          el("div.field", {}, [el("label", { text: "Chave na outra tabela" }), rightKey]),
        ])
      : el("p.muted.t-xs", { text: "As linhas da outra tabela serão adicionadas abaixo. Colunas ausentes ficam vazias." }),
    el("button.btn.btn--primary", {
      text: "Adicionar etapa",
      "on:click": () => {
        const other = others.find((d) => d.id === target.value);
        ctx.commit((ds) => {
          ds.transforms = [
            ...(ds.transforms || []),
            createStep(type, {
              datasetId: target.value,
              datasetName: other?.name,
              leftKey: leftKey.value,
              rightKey: rightKey.value,
              prefix: type === "mergeDataset" ? `${(other?.name || "").slice(0, 8)}_` : "",
            }),
          ];
        }, "Tabelas combinadas");
        ctx.close?.();
      },
    })
  );
}

export { confirmDialog };
