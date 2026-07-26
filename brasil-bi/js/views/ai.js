/**
 * Brasil BI — assistente de análise.
 *
 * Roda 100% no navegador (estatística descritiva + interpretação de texto por
 * palavras-chave). Toda conclusão vem rotulada como fato, correlação, projeção
 * ou alerta de qualidade — e projeções nunca são apresentadas como certeza.
 */

import { el, render, fmtByType, fmtPercent, uid } from "../core/utils.js";
import { icon } from "../core/icons.js";
import { toast, emptyState } from "../ui/feedback.js";
import { getState, activeDashboard, upsertDashboard, update } from "../core/store.js";
import { resolveDataset, runQuery, applyContext } from "../data/query.js";
import { analyze, executiveSummary, recommendations, EVIDENCE } from "../ai/insights.js";
import { parseQuestion, intentToTile, suggestedQuestions } from "../ai/nlq.js";
import { aggregate } from "../data/transform.js";
import { mountTile } from "../ui/tile.js";
import { navigate } from "../app.js";

const conversation = [];

export async function renderAiView(root) {
  const state = getState();
  if (!state.datasets.length) {
    render(root, emptyState({
      iconName: "ai",
      title: "O assistente precisa de dados",
      message: "Importe uma fonte para liberar as análises automáticas.",
      action: el("button.btn.btn--primary", { text: "Importar dados", "on:click": () => navigate("importar") }),
    }));
    return;
  }

  const dashboard = activeDashboard();
  const datasetId = dashboard?.datasetId || state.datasets[0].id;
  const source = await resolveDataset(datasetId);
  const context = { ...source, datasetId };

  const insights = analyze(context);
  const summary = executiveSummary(context, insights);
  const recs = recommendations(insights, context);

  const chatBox = el("div.chat");
  const input = el("input.input", {
    placeholder: "Pergunte em português: “Qual o faturamento deste mês?”, “Top 5 produtos”, “Crie um gráfico por estado”…",
    "aria-label": "Pergunta para o assistente",
  });

  const ask = async (question) => {
    if (!question.trim()) return;
    conversation.push({ role: "user", text: question });
    input.value = "";
    drawChat();
    const answer = await answerQuestion(question, context, dashboard);
    conversation.push({ role: "ai", ...answer });
    drawChat();
  };

  const drawChat = () => {
    render(
      chatBox,
      conversation.length
        ? conversation.map((msg) =>
            msg.role === "user"
              ? el("div.msg.msg--user", {}, [el("div.msg__av", { text: "V" }), el("div.msg__body", {}, [el("strong", { text: msg.text })])])
              : el("div.msg.msg--ai", {}, [
                  el("div.msg__av", { text: "BI" }),
                  el("div.msg__body", {}, [
                    el("div", { text: msg.text }),
                    msg.rows?.length
                      ? el("ul", {}, msg.rows.map((r) => el("li", {}, [el("span", { text: `${r.label}: ` }), el("span.kv", { text: r.value })])))
                      : null,
                    msg.disclaimer ? el("div.disclaimer", { style: { marginTop: "8px" } }, [icon("info", { size: 13 }), el("span", { text: msg.disclaimer })]) : null,
                    msg.tile
                      ? el("div", { style: { marginTop: "10px" } }, [
                          previewTile(msg.tile),
                          el("button.btn.btn--sm.btn--primary", {
                            style: { marginTop: "8px" },
                            "on:click": () => {
                              const dash = activeDashboard();
                              if (!dash) return toast("Crie um dashboard primeiro", { level: "warn" });
                              dash.tiles.push(msg.tile);
                              upsertDashboard(dash);
                              toast("Gráfico adicionado ao dashboard", { level: "success" });
                              return true;
                            },
                          }, [icon("plus", { size: 13 }), el("span", { text: "Adicionar ao dashboard" })]),
                        ])
                      : null,
                  ]),
                ])
          )
        : el("p.muted.t-xs", { text: "Faça uma pergunta ou use uma das sugestões abaixo." })
    );
    chatBox.scrollTop = chatBox.scrollHeight;
  };
  drawChat();

  render(root, [
    el("div.view__head", {}, [
      el("div", {}, [
        el("h1", { text: "Análises com IA" }),
        el("p", {
          text: `Análise automática de "${source.dataset.name}" considerando os filtros ativos. Tudo é calculado no seu navegador — nenhum dado sai do dispositivo.`,
        }),
      ]),
    ]),

    el("div.layout-split", {}, [
      el("div.stack-4", {}, [
        /* chat */
        el("div.card.card--pad.stack-3", {}, [
          el("div.section-title", {}, [icon("ai", { size: 13 }), el("span", { text: "Pergunte em linguagem natural" })]),
          chatBox,
          el("div.row", {}, [
            input,
            el("button.btn.btn--primary", { "on:click": () => ask(input.value) }, [icon("play", { size: 15 }), el("span", { text: "Perguntar" })]),
          ]),
          el("div.row.wrap", {}, suggestedQuestions(source.fields).map((q) =>
            el("button.chip", { text: q, "on:click": () => ask(q) })
          )),
        ]),

        /* resumo executivo */
        el("div.card.card--pad.stack-3", {}, [
          el("div.section-title", {}, [icon("reports", { size: 13 }), el("span", { text: "Resumo executivo" })]),
          el("p", { text: summary.text }),
          summary.bullets.length ? el("ul.stack-2.t-xs.muted", {}, summary.bullets.map((b) => el("li", { text: `• ${b}` }))) : null,
        ]),

        /* insights */
        el("div.stack-3", {}, [
          el("div.section-title", {}, [icon("sparkles", { size: 13 }), el("span", { text: "O que os dados mostram" })]),
          ...insights.map((insight) =>
            el(`div.insight.insight--${insight.level}`, {}, [
              el("div.insight__icon", {}, [
                icon(insight.level === "pos" ? "trendUp" : insight.level === "neg" ? "trendDown" : insight.level === "warn" ? "alert" : "info", { size: 15 }),
              ]),
              el("div.grow", {}, [
                el("div.row", {}, [
                  el("div.insight__title.grow", { text: insight.title }),
                  el("span.badge.badge--neutral", { title: EVIDENCE[insight.evidence]?.hint, text: EVIDENCE[insight.evidence]?.label || "" }),
                ]),
                el("div.insight__text", { text: insight.text }),
              ]),
            ])
          ),
        ]),
      ]),

      el("div.side-panel.stack-4", {}, [
        el("div.card.card--pad", {}, [
          el("div.section-title", {}, [icon("target", { size: 13 }), el("span", { text: "Recomendações práticas" })]),
          el("div.stack-3", {}, recs.map((rec) =>
            el("div", {}, [el("div.insight__title", { text: rec.title }), el("div.insight__text", { text: rec.text })])
          )),
        ]),
        el("div.card.card--pad", {}, [
          el("div.section-title", {}, [icon("shield", { size: 13 }), el("span", { text: "Como ler estas análises" })]),
          el("div.stack-2", {}, Object.entries(EVIDENCE).map(([, meta]) =>
            el("div.t-xs.muted", {}, [el("strong", { text: `${meta.label}: ` }), el("span", { text: meta.hint })])
          )),
          el("p.dim.t-xs", {
            style: { marginTop: "10px" },
            text: "O assistente não usa modelo de linguagem externo: são estatísticas calculadas sobre os seus dados e regras de interpretação. Ele não inventa números — quando não consegue responder, avisa.",
          }),
        ]),
      ]),
    ]),
  ]);
}

function previewTile(tile) {
  const holder = el("div", { style: { maxWidth: "520px" } });
  const instance = mountTile({ ...tile, locked: true }, {});
  holder.append(instance.node);
  requestAnimationFrame(() => instance.refresh());
  return holder;
}

/* ------------------------------------------------------------- respostas */

async function answerQuestion(question, context, dashboard) {
  const parsed = parseQuestion(question, { fields: context.fields, datasetId: context.datasetId });

  if (parsed.intent === "summary") {
    const insights = analyze(context);
    const summary = executiveSummary(context, insights);
    return {
      text: summary.text,
      rows: insights.slice(0, 4).map((i) => ({ label: i.title, value: EVIDENCE[i.evidence]?.label || "" })),
      disclaimer: "Resumo calculado sobre o recorte filtrado atual.",
    };
  }

  if (parsed.intent === "trend") {
    const insights = analyze(context).filter((i) => i.evidence === "projecao" || i.title.includes("tendência"));
    if (!insights.length) {
      return { text: "Não encontrei uma série temporal consistente para avaliar tendência. Verifique se há um campo de data reconhecido na fonte." };
    }
    return {
      text: insights.map((i) => `${i.title}. ${i.text}`).join(" "),
      disclaimer: "Projeções são estimativas estatísticas — não garantem resultado futuro.",
    };
  }

  if (parsed.intent === "bottleneck") {
    const insights = analyze(context).filter((i) => i.level === "neg" || i.level === "warn");
    if (!insights.length) return { text: "Não identifiquei gargalos relevantes no recorte atual." };
    return {
      text: "Os pontos que mais pesam negativamente no recorte atual:",
      rows: insights.slice(0, 5).map((i) => ({ label: i.title, value: EVIDENCE[i.evidence]?.label || "" })),
      disclaimer: insights[0].text,
    };
  }

  if (!parsed.measure) {
    return {
      text: `Não consegui entender qual valor você quer medir. ${parsed.unresolved.join("; ") || ""} Tente algo como “Qual o faturamento deste mês?” ou “Top 5 produtos por lucro”.`,
    };
  }

  // Aplica o período pedido na pergunta (temporariamente, de forma explícita).
  if (parsed.period) {
    update((s) => {
      s.period = { ...s.period, preset: parsed.period };
    }, { reason: "filter:period" });
  }

  const params = { rows: context.rows, fields: context.fields, datasetId: context.datasetId };

  // Resposta escalar
  if (!parsed.dimension) {
    const rows = applyContext(context.rows, context.datasetId, context.fields);
    const value = aggregate(rows.map((r) => r[parsed.measure.field]), parsed.measure.agg);
    return {
      text: `${parsed.measure.label}: ${fmtByType(value, parsed.measure.type)}.`,
      rows: [
        { label: "Registros considerados", value: rows.length.toLocaleString("pt-BR") },
        { label: "Cálculo", value: `${parsed.measure.agg} de ${parsed.measure.field}` },
      ],
      disclaimer: parsed.unresolved.length ? `Observação: ${parsed.unresolved.join("; ")}.` : undefined,
    };
  }

  // Resposta agregada por dimensão
  const data = runQuery(params, {
    dimension: parsed.dimension.field,
    grain: parsed.grain,
    measures: [{ field: parsed.measure.field, agg: parsed.measure.agg }],
    limit: parsed.limit || 10,
    sort: parsed.intent === "bottom" ? { by: "m0", dir: "asc" } : { by: "m0", dir: "desc" },
  });

  if (!data.categories?.length) {
    return { text: "A consulta não retornou resultados com os filtros atuais." };
  }

  const total = data.categories.reduce((acc, c) => acc + (Number(c.values[0]) || 0), 0);
  const tile = intentToTile(parsed, context.datasetId);
  if (tile) tile.id = uid("tile");

  const top = data.categories[0];
  const lead =
    parsed.intent === "bottom"
      ? `Menores valores de ${parsed.measure.label.toLowerCase()} por ${parsed.dimension.label.toLowerCase()}:`
      : `${top.label} lidera em ${parsed.measure.label.toLowerCase()} com ${fmtByType(top.values[0], parsed.measure.type)}${
          total ? ` (${fmtPercent((top.values[0] / total) * 100)} do total listado)` : ""
        }.`;

  return {
    text: lead,
    rows: data.categories.slice(0, 8).map((c) => ({
      label: c.label,
      value: fmtByType(c.values[0], parsed.measure.type),
    })),
    tile,
    disclaimer: parsed.unresolved.length ? `Observação: ${parsed.unresolved.join("; ")}.` : undefined,
  };
  void dashboard;
}
