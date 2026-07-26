/**
 * Brasil BI — análises automáticas (assistente de IA local).
 *
 * Tudo aqui é calculado no próprio navegador, com estatística descritiva —
 * sem enviar dados para fora. Cada conclusão declara explicitamente se é um
 * FATO (calculado sobre os dados filtrados), uma CORRELAÇÃO ou uma PROJEÇÃO.
 */

import {
  linearRegression,
  mean,
  stddev,
  fmtPercent,
  fmtByType,
  fmtDate,
  toDate,
  truncDate,
  isFiniteNumber,
} from "../core/utils.js";
import { aggregate } from "../data/transform.js";
import { NUMERIC_TYPES, TEMPORAL_TYPES } from "../data/types.js";
import { applyContext, defaultDateField } from "../data/query.js";

export const EVIDENCE = {
  fato: { label: "Fato", hint: "calculado diretamente sobre os dados filtrados" },
  correlacao: { label: "Correlação", hint: "associação estatística — não implica causa" },
  projecao: { label: "Projeção", hint: "estimativa a partir da tendência; não é garantia" },
  alerta: { label: "Alerta de qualidade", hint: "problema nos dados que pode distorcer a análise" },
};

/** Escolhe a medida principal (faturamento > valor > primeira numérica). */
export function pickPrimaryMeasure(fields) {
  const numeric = fields.filter((f) => NUMERIC_TYPES.has(f.type) && f.role === "measure");
  if (!numeric.length) return null;
  const priority = ["faturamento", "receita", "valor", "vendas", "total", "lucro"];
  for (const key of priority) {
    const found = numeric.find((f) => f.name.toLowerCase().includes(key));
    if (found) return found;
  }
  return numeric[0];
}

export function pickDimensions(fields, limit = 4) {
  return fields
    .filter((f) => f.role === "dimension" && f.type === "text" && f.distinct > 1 && f.distinct <= 60)
    .sort((a, b) => a.distinct - b.distinct)
    .slice(0, limit);
}

/**
 * Analisa um dataset e devolve uma lista de insights ordenados por relevância.
 * @param {{rows:Array, fields:Array, datasetId:string, dataset:Object}} source
 * @param {{goal?:number}} [opts]
 */
export function analyze(source, opts = {}) {
  const insights = [];
  const fields = source.fields || [];
  const rows = applyContext(source.rows, source.datasetId, fields);
  const measure = opts.measureField
    ? fields.find((f) => f.name === opts.measureField)
    : pickPrimaryMeasure(fields);
  const dateField = opts.dateField || defaultDateField(fields);

  if (!rows.length) {
    return [
      {
        level: "warn",
        evidence: "alerta",
        title: "Nenhum registro no recorte atual",
        text: "Os filtros aplicados não retornaram linhas. Limpe os filtros ou amplie o período para ver as análises.",
      },
    ];
  }

  if (!measure) {
    insights.push({
      level: "info",
      evidence: "alerta",
      title: "Nenhuma medida numérica identificada",
      text: "Defina o tipo de pelo menos uma coluna como número ou moeda na área de tratamento para liberar as análises quantitativas.",
    });
    return insights;
  }

  const total = aggregate(rows.map((r) => r[measure.name]), "sum");
  const fmt = (v) => fmtByType(v, measure.type, { compact: true });

  /* ------------------------------------------------------ série temporal -- */
  let series = [];
  if (dateField) {
    const dated = rows
      .map((r) => ({ d: toDate(r[dateField]), v: r[measure.name] }))
      .filter((x) => x.d && isFiniteNumber(Number(x.v)));
    if (dated.length > 3) {
      const buckets = new Map();
      for (const item of dated) {
        const key = truncDate(item.d, "month").getTime();
        buckets.set(key, (buckets.get(key) || 0) + Number(item.v));
      }
      series = Array.from(buckets.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([time, value]) => ({ time, value }));
    }
  }

  if (series.length >= 3) {
    const reg = linearRegression(series.map((p, i) => ({ x: i, y: p.value })));
    const first = series[0].value;
    const last = series[series.length - 1].value;
    const growth = first ? (last - first) / Math.abs(first) : null;

    if (reg && Math.abs(reg.slope) > 0.0001) {
      const rising = reg.slope > 0;
      const monthlyPct = mean(series.map((p) => p.value)) ? (reg.slope / mean(series.map((p) => p.value))) * 100 : 0;
      insights.push({
        level: rising ? "pos" : "neg",
        evidence: "fato",
        title: rising ? `${measure.label} em tendência de alta` : `${measure.label} em tendência de queda`,
        text: `Entre ${fmtDate(new Date(series[0].time), "month")} e ${fmtDate(
          new Date(series[series.length - 1].time),
          "month"
        )}, a variação foi de ${fmtPercent((growth || 0) * 100)} (${fmt(first)} → ${fmt(last)}). A reta de tendência indica ${
          rising ? "crescimento" : "redução"
        } médio de ${fmtPercent(Math.abs(monthlyPct))} ao mês (aderência R² = ${reg.r2.toFixed(2)}).`,
        score: 90,
      });

      // Projeção do próximo período — sempre rotulada como estimativa.
      const nextValue = reg.slope * series.length + reg.intercept;
      if (reg.r2 >= 0.35 && nextValue > 0) {
        insights.push({
          level: "info",
          evidence: "projecao",
          title: `Projeção para o próximo mês: ${fmt(nextValue)}`,
          text: `Mantida a tendência observada nos últimos ${series.length} meses, ${measure.label.toLowerCase()} ficaria próximo de ${fmt(
            nextValue
          )}. É uma estimativa estatística (R² = ${reg.r2.toFixed(
            2
          )}), não um resultado garantido — mudanças de mercado, sazonalidade ou campanhas alteram esse número.`,
          score: 55,
        });
      }
    }

    // Anomalias
    const values = series.map((p) => p.value);
    const avg = mean(values);
    const sd = stddev(values);
    if (sd && avg) {
      const anomalies = series.filter((p) => Math.abs(p.value - avg) > 2 * sd);
      for (const point of anomalies.slice(0, 2)) {
        const above = point.value > avg;
        insights.push({
          level: above ? "pos" : "neg",
          evidence: "fato",
          title: `${fmtDate(new Date(point.time), "month")} fugiu do padrão`,
          text: `O valor de ${fmt(point.value)} está ${fmtPercent(
            (Math.abs(point.value - avg) / avg) * 100
          )} ${above ? "acima" : "abaixo"} da média do período (${fmt(avg)}), além de 2 desvios-padrão. Vale investigar o que aconteceu nesse mês.`,
          score: 80,
        });
      }
    }

    // Queda recente
    if (series.length >= 2) {
      const prev = series[series.length - 2].value;
      const curr = series[series.length - 1].value;
      if (prev && (curr - prev) / prev <= -0.15) {
        insights.push({
          level: "neg",
          evidence: "fato",
          title: "Queda relevante no último mês",
          text: `${measure.label} caiu ${fmtPercent(Math.abs(((curr - prev) / prev) * 100))} em relação ao mês anterior (${fmt(
            prev
          )} → ${fmt(curr)}).`,
          score: 95,
        });
      }
    }
  }

  /* ------------------------------------------------------- concentração --- */
  for (const dim of pickDimensions(fields, 3)) {
    const groups = new Map();
    for (const row of rows) {
      const key = row[dim.name] ?? "(vazio)";
      groups.set(key, (groups.get(key) || 0) + (Number(row[measure.name]) || 0));
    }
    const sorted = Array.from(groups.entries()).sort((a, b) => b[1] - a[1]);
    if (sorted.length < 2 || !total) continue;

    const topShare = sorted[0][1] / total;
    if (topShare >= 0.35) {
      insights.push({
        level: topShare >= 0.6 ? "warn" : "info",
        evidence: "fato",
        title: `Concentração em ${sorted[0][0]}`,
        text: `${sorted[0][0]} responde por ${fmtPercent(topShare * 100)} de ${measure.label.toLowerCase()} em ${dim.label.toLowerCase()}. ${
          topShare >= 0.6 ? "Essa dependência aumenta o risco: uma queda nessa frente derruba o resultado total." : "Vale acompanhar de perto."
        }`,
        score: 70,
      });
    }

    const bottom = sorted[sorted.length - 1];
    if (sorted.length >= 4 && bottom[1] <= total * 0.02) {
      insights.push({
        level: "info",
        evidence: "fato",
        title: `${bottom[0]} tem participação marginal`,
        text: `Em ${dim.label.toLowerCase()}, ${bottom[0]} representa apenas ${fmtPercent(
          (bottom[1] / total) * 100
        )} do total. Avalie se vale manter o investimento ou concentrar esforços nas frentes mais fortes.`,
        score: 40,
      });
    }
  }

  /* --------------------------------------------------------- correlação --- */
  const numerics = fields.filter((f) => NUMERIC_TYPES.has(f.type) && f.name !== measure.name).slice(0, 6);
  for (const other of numerics) {
    const pairs = rows
      .map((r) => ({ x: Number(r[other.name]), y: Number(r[measure.name]) }))
      .filter((p) => isFiniteNumber(p.x) && isFiniteNumber(p.y));
    if (pairs.length < 20) continue;
    const reg = linearRegression(pairs);
    if (reg && reg.r2 >= 0.5) {
      insights.push({
        level: "info",
        evidence: "correlacao",
        title: `${other.label} acompanha ${measure.label}`,
        text: `As duas variáveis se movem juntas (R² = ${reg.r2.toFixed(
          2
        )}, relação ${reg.slope > 0 ? "positiva" : "negativa"}). Correlação não prova causa: pode haver um terceiro fator explicando as duas.`,
        score: 45,
      });
      break;
    }
  }

  /* ------------------------------------------------------- qualidade ------ */
  if (dateField) {
    const dates = rows.map((r) => toDate(r[dateField])).filter(Boolean);
    if (dates.length) {
      const last = new Date(Math.max(...dates.map((d) => d.getTime())));
      const days = Math.round((Date.now() - last.getTime()) / 86400000);
      if (days > 45) {
        insights.push({
          level: "warn",
          evidence: "alerta",
          title: "Dados possivelmente desatualizados",
          text: `O registro mais recente é de ${fmtDate(last)} (${days} dias atrás). Atualize a fonte antes de tomar decisões com este painel.`,
          score: 85,
        });
      }
    }
  }

  const quality = source.dataset?.quality;
  if (quality?.issues?.length) {
    const errors = quality.issues.filter((i) => i.level === "error");
    if (errors.length) {
      insights.push({
        level: "warn",
        evidence: "alerta",
        title: `${errors.length} problema(s) crítico(s) de qualidade`,
        text: errors.slice(0, 2).map((e) => e.message).join(" "),
        score: 88,
      });
    }
  }

  return insights.sort((a, b) => (b.score || 50) - (a.score || 50));
}

/**
 * Resumo executivo em texto corrido.
 * @returns {{text:string, bullets:string[]}}
 */
export function executiveSummary(source, insights) {
  const fields = source.fields || [];
  const rows = applyContext(source.rows, source.datasetId, fields);
  const measure = pickPrimaryMeasure(fields);
  const dateField = defaultDateField(fields);

  if (!rows.length) {
    return { text: "Não há registros no recorte atual. Ajuste os filtros para gerar o resumo.", bullets: [] };
  }

  const parts = [];
  const bullets = [];

  if (measure) {
    const total = aggregate(rows.map((r) => r[measure.name]), "sum");
    const avg = aggregate(rows.map((r) => r[measure.name]), "avg");
    parts.push(
      `No recorte atual há ${rows.length.toLocaleString("pt-BR")} registro(s), somando ${fmtByType(total, measure.type)} em ${measure.label.toLowerCase()} (média de ${fmtByType(
        avg,
        measure.type
      )} por registro).`
    );
  } else {
    parts.push(`No recorte atual há ${rows.length.toLocaleString("pt-BR")} registro(s).`);
  }

  if (dateField) {
    const dates = rows.map((r) => toDate(r[dateField])).filter(Boolean);
    if (dates.length) {
      const min = new Date(Math.min(...dates.map((d) => d.getTime())));
      const max = new Date(Math.max(...dates.map((d) => d.getTime())));
      parts.push(`O período coberto vai de ${fmtDate(min)} a ${fmtDate(max)}.`);
    }
  }

  for (const insight of insights.slice(0, 5)) {
    bullets.push(`${insight.title}: ${insight.text}`);
  }

  const risks = insights.filter((i) => i.level === "neg" || i.level === "warn");
  if (risks.length) {
    parts.push(`Há ${risks.length} ponto(s) de atenção — o mais relevante é: ${risks[0].title.toLowerCase()}.`);
  } else {
    parts.push("Não foram encontrados sinais de alerta relevantes no recorte atual.");
  }

  return { text: parts.join(" "), bullets };
}

/** Recomendações práticas derivadas dos insights (sem prometer resultado). */
export function recommendations(insights, source) {
  const out = [];
  const measure = pickPrimaryMeasure(source.fields || []);
  const measureName = measure?.label?.toLowerCase() || "o indicador principal";

  for (const insight of insights) {
    if (insight.title.includes("queda") || insight.level === "neg") {
      out.push({
        title: "Investigar a queda antes de agir no orçamento",
        text: `Abra o período de baixa por canal, produto e vendedor para isolar a origem. Só depois redistribua verba — cortar às cegas costuma reduzir ${measureName} ainda mais.`,
      });
    }
    if (insight.title.startsWith("Concentração")) {
      out.push({
        title: "Reduzir a dependência de uma única frente",
        text: "Defina uma meta de participação máxima (por exemplo, 40%) para a maior categoria e acompanhe mensalmente a diversificação.",
      });
    }
    if (insight.evidence === "alerta") {
      out.push({
        title: "Corrigir a qualidade dos dados",
        text: "Use a área de tratamento para preencher vazios, padronizar tipos e remover duplicidades. Análises sobre dados sujos levam a decisões erradas.",
      });
    }
  }

  if (!out.length) {
    out.push({
      title: "Definir metas para os indicadores principais",
      text: "Cadastre metas nos cartões de KPI para que o sistema classifique automaticamente o desempenho e dispare alertas quando algo sair do esperado.",
    });
  }

  // Remove duplicados por título
  const seen = new Set();
  return out.filter((item) => (seen.has(item.title) ? false : seen.add(item.title)));
}

export { TEMPORAL_TYPES };
