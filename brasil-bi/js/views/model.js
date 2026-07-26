/**
 * Brasil BI — modelagem de dados: diagrama de tabelas, relacionamentos
 * (1:1, 1:N, N:N), sugestões automáticas, validação e tabela calendário.
 */

import { el, render, uid, norm, fmtNumber, MONTHS_LONG, toDate, truncDate, addPeriod, isoWeek } from "../core/utils.js";
import { icon } from "../core/icons.js";
import { modal, toast, confirmDialog, emptyState } from "../ui/feedback.js";
import { getState, update, addDataset, getRawRows } from "../core/store.js";
import { resolveDataset } from "../data/query.js";
import { detectFields, NUMERIC_TYPES, TEMPORAL_TYPES } from "../data/types.js";
import { navigate } from "../app.js";

const CARDINALITY = {
  "1-1": "Um para um",
  "1-n": "Um para muitos",
  "n-n": "Muitos para muitos",
};

export async function renderModelView(root) {
  const state = getState();
  if (state.datasets.length < 1) {
    render(root, emptyState({
      iconName: "model",
      title: "Sem tabelas para modelar",
      message: "Importe pelo menos uma fonte de dados.",
      action: el("button.btn.btn--primary", { text: "Importar", "on:click": () => navigate("importar") }),
    }));
    return;
  }

  const suggestions = await suggestRelationships();
  const issues = validateModel();

  render(root, [
    el("div.view__head", {}, [
      el("div", {}, [
        el("h1", { text: "Modelagem de dados" }),
        el("p", { text: "Relacione as tabelas para cruzar informações. O sistema sugere ligações comparando nome, tipo e conteúdo das colunas." }),
      ]),
      el("div.row", {}, [
        el("button.btn", { "on:click": () => openCalendarDialog() }, [icon("calendar", { size: 15 }), el("span", { text: "Criar tabela calendário" })]),
        el("button.btn.btn--primary", { "on:click": () => openRelationshipDialog(null, root) }, [
          icon("plus", { size: 15 }),
          el("span", { text: "Novo relacionamento" }),
        ]),
      ]),
    ]),

    issues.length
      ? el("div.stack-2", { style: { marginBottom: "16px" } }, issues.map((issue) =>
          el(`div.insight.insight--${issue.level === "error" ? "neg" : "warn"}`, {}, [
            el("div.insight__icon", {}, [icon("alert", { size: 14 })]),
            el("div", {}, [el("div.insight__title", { text: issue.title }), el("div.insight__text", { text: issue.text })]),
          ])
        ))
      : null,

    el("div.layout-split", {}, [
      buildDiagram(root),
      el("div.side-panel.stack-4", {}, [
        el("div.card.card--pad", {}, [
          el("div.section-title", {}, [icon("link", { size: 13 }), el("span", { text: "Relacionamentos" })]),
          state.relationships.length
            ? el("div.stack-2", {}, state.relationships.map((rel) => relationshipRow(rel, root)))
            : el("p.muted.t-xs", { text: "Nenhum relacionamento definido." }),
        ]),
        el("div.card.card--pad", {}, [
          el("div.section-title", {}, [icon("wand", { size: 13 }), el("span", { text: "Sugestões automáticas" })]),
          suggestions.length
            ? el("div.stack-2", {}, suggestions.map((s) =>
                el("div.list__row", {}, [
                  el("div.grow", {}, [
                    el("div.t-xs", { text: `${s.fromName}.${s.fromField} → ${s.toName}.${s.toField}` }),
                    el("div.dim", { style: { fontSize: "10px" }, text: `${CARDINALITY[s.cardinality]} · ${Math.round(s.overlap * 100)}% dos valores conferem` }),
                  ]),
                  el("button.btn.btn--sm.btn--primary", {
                    text: "Criar",
                    "on:click": () => {
                      update((st) => {
                        st.relationships.push({
                          id: uid("rel"),
                          fromDataset: s.fromDataset,
                          fromField: s.fromField,
                          toDataset: s.toDataset,
                          toField: s.toField,
                          cardinality: s.cardinality,
                          active: true,
                        });
                      }, { reason: "model" });
                      renderModelView(root);
                    },
                  }),
                ])
              ))
            : el("p.muted.t-xs", { text: "Nenhuma ligação óbvia encontrada entre as tabelas atuais." }),
        ]),
        el("div.card.card--pad", {}, [
          el("div.section-title", {}, [icon("info", { size: 13 }), el("span", { text: "Como isto é usado" })]),
          el("p.muted.t-xs", {
            text: "Nesta versão, os relacionamentos alimentam as etapas de mesclagem no tratamento de dados e as validações do modelo. Cada componente do dashboard consulta uma tabela; para cruzar duas, use “Mesclar tabela” no tratamento — o sistema já sugere as chaves a partir daqui.",
          }),
        ]),
      ]),
    ]),
  ]);
}

/* ------------------------------------------------------------- diagrama -- */

function buildDiagram(root) {
  const state = getState();
  const canvas = el("div.model-canvas", { id: "model-canvas" });
  const links = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  links.setAttribute("class", "model-links");
  canvas.append(links);

  const positions = new Map();
  state.datasets.forEach((dataset, i) => {
    const pos = dataset.uiPos || { x: 24 + (i % 3) * 240, y: 24 + Math.floor(i / 3) * 220 };
    positions.set(dataset.id, pos);

    const node = el("div.model-node", { style: { left: `${pos.x}px`, top: `${pos.y}px` }, "data-dataset": dataset.id }, [
      el("div.model-node__head", {}, [
        icon("table", { size: 13 }),
        el("span.truncate", { text: dataset.name }),
        dataset.isDemo ? el("span.badge.badge--demo", { style: { fontSize: "8px" }, text: "demo" }) : null,
      ]),
      el("div.model-node__fields", {}, dataset.fields.slice(0, 12).map((f) =>
        el("div.model-node__field", {}, [
          f.role === "id" ? el("span.k", { text: "🔑" }) : el("span.k", { text: NUMERIC_TYPES.has(f.type) ? "#" : TEMPORAL_TYPES.has(f.type) ? "🗓" : "A" }),
          el("span.truncate", { text: f.name }),
        ])
      )),
      dataset.fields.length > 12 ? el("div.model-node__field.dim", { text: `+${dataset.fields.length - 12} colunas` }) : null,
    ]);

    enableNodeDrag(node, dataset.id, () => redrawLinks(links, positions));
    canvas.append(node);
  });

  requestAnimationFrame(() => redrawLinks(links, positions));
  return canvas;
}

function redrawLinks(svgEl, positions) {
  const state = getState();
  svgEl.replaceChildren();
  const NS = "http://www.w3.org/2000/svg";
  for (const rel of state.relationships) {
    const from = positions.get(rel.fromDataset);
    const to = positions.get(rel.toDataset);
    if (!from || !to) continue;
    const x1 = from.x + 208;
    const y1 = from.y + 40;
    const x2 = to.x;
    const y2 = to.y + 40;
    const mid = (x1 + x2) / 2;
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`);
    if (!rel.active) path.setAttribute("stroke-dasharray", "4 4");
    svgEl.append(path);
    const label = document.createElementNS(NS, "text");
    label.setAttribute("x", String(mid));
    label.setAttribute("y", String((y1 + y2) / 2 - 5));
    label.setAttribute("text-anchor", "middle");
    label.textContent = rel.cardinality;
    svgEl.append(label);
  }
}

function enableNodeDrag(node, datasetId, onMove) {
  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let baseY = 0;

  const move = (e) => {
    const x = Math.max(0, baseX + e.clientX - startX);
    const y = Math.max(0, baseY + e.clientY - startY);
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    onMove?.();
  };
  const up = () => {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    update((s) => {
      const ds = s.datasets.find((d) => d.id === datasetId);
      if (ds) ds.uiPos = { x: parseInt(node.style.left, 10), y: parseInt(node.style.top, 10) };
    }, { reason: "model:pos" });
  };

  node.querySelector(".model-node__head").addEventListener("mousedown", (e) => {
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    baseX = parseInt(node.style.left, 10) || 0;
    baseY = parseInt(node.style.top, 10) || 0;
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });
}

/* -------------------------------------------------------- relacionamentos */

function relationshipRow(rel, root) {
  const state = getState();
  const from = state.datasets.find((d) => d.id === rel.fromDataset);
  const to = state.datasets.find((d) => d.id === rel.toDataset);
  return el("div.list__row", {}, [
    el("div.grow", {}, [
      el("div.t-xs", { text: `${from?.name || "?"}.${rel.fromField} → ${to?.name || "?"}.${rel.toField}` }),
      el("div.dim", { style: { fontSize: "10px" }, text: CARDINALITY[rel.cardinality] }),
    ]),
    el("button.btn.btn--ghost.btn--icon.btn--sm", {
      "aria-label": rel.active ? "Desativar" : "Ativar",
      "on:click": () => {
        update((s) => {
          const r = s.relationships.find((x) => x.id === rel.id);
          if (r) r.active = !r.active;
        }, { reason: "model" });
        renderModelView(root);
      },
    }, [icon(rel.active ? "eye" : "eyeOff", { size: 13 })]),
    el("button.btn.btn--ghost.btn--icon.btn--sm.btn--danger", {
      "aria-label": "Excluir relacionamento",
      "on:click": () => {
        update((s) => {
          s.relationships = s.relationships.filter((x) => x.id !== rel.id);
        }, { reason: "model" });
        renderModelView(root);
      },
    }, [icon("trash", { size: 13 })]),
  ]);
}

function openRelationshipDialog(existing, root) {
  const state = getState();
  if (state.datasets.length < 2) {
    toast("São necessárias pelo menos duas tabelas", { level: "warn" });
    return;
  }

  const fromSelect = el("select.select", {}, state.datasets.map((d) => el("option", { value: d.id, text: d.name })));
  const toSelect = el("select.select", {}, state.datasets.map((d) => el("option", { value: d.id, text: d.name })));
  toSelect.selectedIndex = 1;
  const fromField = el("select.select");
  const toField = el("select.select");
  const cardinality = el(
    "select.select",
    {},
    Object.entries(CARDINALITY).map(([value, label]) => el("option", { value, text: label }))
  );
  cardinality.value = "1-n";

  const syncFields = () => {
    const fromDs = state.datasets.find((d) => d.id === fromSelect.value);
    const toDs = state.datasets.find((d) => d.id === toSelect.value);
    render(fromField, (fromDs?.fields || []).map((f) => el("option", { value: f.name, text: f.name })));
    render(toField, (toDs?.fields || []).map((f) => el("option", { value: f.name, text: f.name })));
  };
  fromSelect.addEventListener("change", syncFields);
  toSelect.addEventListener("change", syncFields);
  syncFields();

  const ref = modal({
    title: "Novo relacionamento",
    body: el("div.stack-3", {}, [
      el("div.grid-2", {}, [
        el("div.field", {}, [el("label", { text: "Tabela de origem" }), fromSelect]),
        el("div.field", {}, [el("label", { text: "Coluna de origem" }), fromField]),
      ]),
      el("div.grid-2", {}, [
        el("div.field", {}, [el("label", { text: "Tabela de destino" }), toSelect]),
        el("div.field", {}, [el("label", { text: "Coluna de destino" }), toField]),
      ]),
      el("div.field", {}, [el("label", { text: "Cardinalidade" }), cardinality]),
    ]),
    actions: [
      el("button.btn", { text: "Cancelar", "on:click": () => ref.close() }),
      el("button.btn.btn--primary", {
        text: "Criar",
        "on:click": () => {
          if (fromSelect.value === toSelect.value) {
            toast("Escolha tabelas diferentes", { level: "warn" });
            return;
          }
          update((s) => {
            s.relationships.push({
              id: uid("rel"),
              fromDataset: fromSelect.value,
              fromField: fromField.value,
              toDataset: toSelect.value,
              toField: toField.value,
              cardinality: cardinality.value,
              active: true,
            });
          }, { reason: "model" });
          ref.close();
          renderModelView(root);
        },
      }),
    ],
  });
  void existing;
}

/* ---------------------------------------------------------- sugestões ---- */

async function suggestRelationships() {
  const state = getState();
  const out = [];
  const cache = new Map();

  const valuesOf = async (datasetId, fieldName) => {
    const key = `${datasetId}|${fieldName}`;
    if (cache.has(key)) return cache.get(key);
    const rows = await getRawRows(datasetId);
    const set = new Set(rows.slice(0, 3000).map((r) => String(r[fieldName] ?? "")).filter(Boolean));
    cache.set(key, set);
    return set;
  };

  for (let i = 0; i < state.datasets.length; i += 1) {
    for (let j = 0; j < state.datasets.length; j += 1) {
      if (i === j) continue;
      const a = state.datasets[i];
      const b = state.datasets[j];
      for (const fa of a.fields) {
        for (const fb of b.fields) {
          const sameName = norm(fa.name) === norm(fb.name);
          const idPattern = norm(fa.name).replace(/(_id|id_|codigo)/g, "") === norm(b.name).replace(/s$/, "");
          if (!sameName && !idPattern) continue;
          if (fa.type !== fb.type) continue;
          const exists = state.relationships.some(
            (r) => r.fromDataset === a.id && r.toDataset === b.id && r.fromField === fa.name && r.toField === fb.name
          );
          if (exists) continue;

          const setA = await valuesOf(a.id, fa.name);
          const setB = await valuesOf(b.id, fb.name);
          if (!setA.size || !setB.size) continue;
          let hits = 0;
          for (const value of setA) if (setB.has(value)) hits += 1;
          const overlap = hits / setA.size;
          if (overlap < 0.5) continue;

          out.push({
            fromDataset: a.id,
            fromName: a.name,
            fromField: fa.name,
            toDataset: b.id,
            toName: b.name,
            toField: fb.name,
            cardinality: setB.size === hits && setA.size === setB.size ? "1-1" : "1-n",
            overlap,
          });
        }
      }
    }
  }
  return out.sort((x, y) => y.overlap - x.overlap).slice(0, 6);
}

/* ---------------------------------------------------------- validações --- */

function validateModel() {
  const state = getState();
  const issues = [];
  const pairs = new Map();

  for (const rel of state.relationships) {
    const from = state.datasets.find((d) => d.id === rel.fromDataset);
    const to = state.datasets.find((d) => d.id === rel.toDataset);
    if (!from || !to) {
      issues.push({ level: "error", title: "Relacionamento quebrado", text: "Uma das tabelas do relacionamento não existe mais. Exclua a ligação." });
      continue;
    }
    if (!from.fields.some((f) => f.name === rel.fromField) || !to.fields.some((f) => f.name === rel.toField)) {
      issues.push({
        level: "error",
        title: "Coluna inexistente",
        text: `O relacionamento entre "${from.name}" e "${to.name}" usa uma coluna que foi renomeada ou removida.`,
      });
    }
    const key = [rel.fromDataset, rel.toDataset].sort().join("|");
    pairs.set(key, (pairs.get(key) || 0) + 1);
  }

  for (const [key, count] of pairs) {
    if (count > 1) {
      const [a, b] = key.split("|");
      const nameA = state.datasets.find((d) => d.id === a)?.name;
      const nameB = state.datasets.find((d) => d.id === b)?.name;
      issues.push({
        level: "warn",
        title: "Caminho ambíguo",
        text: `Há ${count} relacionamentos entre "${nameA}" e "${nameB}". Mantenha apenas um ativo para evitar resultados duplicados.`,
      });
    }
  }
  return issues;
}

/* ------------------------------------------------------ tabela calendário */

function openCalendarDialog() {
  const state = getState();
  const options = [];
  for (const dataset of state.datasets) {
    for (const field of dataset.fields) {
      if (TEMPORAL_TYPES.has(field.type)) options.push({ dataset, field });
    }
  }
  if (!options.length) {
    toast("Nenhum campo de data encontrado", { level: "warn", message: "Defina o tipo de uma coluna como Data na área de tratamento." });
    return;
  }

  const select = el(
    "select.select",
    {},
    options.map((o, i) => el("option", { value: String(i), text: `${o.dataset.name} · ${o.field.name}` }))
  );

  const ref = modal({
    title: "Criar tabela calendário",
    body: el("div.stack-3", {}, [
      el("p.muted.t-xs", { text: "Gera uma tabela com uma linha por dia no intervalo dos seus dados, com ano, trimestre, mês, semana e dia da semana — útil para hierarquias de data." }),
      el("div.field", {}, [el("label", { text: "Campo de data de referência" }), select]),
    ]),
    actions: [
      el("button.btn", { text: "Cancelar", "on:click": () => ref.close() }),
      el("button.btn.btn--primary", {
        text: "Gerar",
        "on:click": async () => {
          const chosen = options[Number(select.value)];
          const source = await resolveDataset(chosen.dataset.id);
          const dates = source.rows.map((r) => toDate(r[chosen.field.name])).filter(Boolean);
          if (!dates.length) {
            toast("Não há datas válidas nesse campo", { level: "error" });
            return;
          }
          const min = truncDate(new Date(Math.min(...dates.map((d) => d.getTime()))), "year");
          const max = new Date(Math.max(...dates.map((d) => d.getTime())));
          const rows = [];
          let cursor = min;
          let guard = 0;
          while (cursor <= max && guard < 20000) {
            rows.push({
              Data: cursor.toISOString(),
              Ano: cursor.getFullYear(),
              Trimestre: `T${Math.floor(cursor.getMonth() / 3) + 1}`,
              "Mês": cursor.getMonth() + 1,
              "Nome do mês": MONTHS_LONG[cursor.getMonth()],
              Semana: isoWeek(cursor),
              Dia: cursor.getDate(),
              "Dia da semana": ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][cursor.getDay()],
              "Fim de semana": [0, 6].includes(cursor.getDay()) ? "Sim" : "Não",
            });
            cursor = addPeriod(cursor, "day", 1);
            guard += 1;
          }
          const fields = detectFields(rows.slice(0, 500));
          fields[0].type = "date";
          fields[0].role = "time";
          await addDataset(
            {
              name: "Calendário",
              fields,
              source: { kind: "gerado", format: "interno", fileName: "—", size: 0 },
              notes: `Gerado a partir de ${chosen.dataset.name}.${chosen.field.name}`,
            },
            rows
          );
          toast("Tabela calendário criada", { level: "success", message: `${fmtNumber(rows.length)} dias.` });
          ref.close();
          navigate("modelagem");
        },
      }),
    ],
  });
}

export { confirmDialog };
