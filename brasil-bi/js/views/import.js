/**
 * Brasil BI — importação de arquivos.
 * Fluxo: envio → detecção do formato → leitura → prévia → validação →
 * confirmação → persistência. Nada entra no banco sem revisão do usuário.
 */

import { el, render, fmtBytes, fmtByType, debounce } from "../core/utils.js";
import { icon } from "../core/icons.js";
import { toast, modal, progressBar, emptyState } from "../ui/feedback.js";
import {
  parseDelimitedText,
  parseJSONText,
  parseXMLText,
  parseFixedWidth,
  sniffDelimiter,
  extensionOf,
  formatLabel,
  guessHeaderRow,
} from "../data/parsers.js";
import { readWorkbookFile, sheetToTable } from "../data/xlsx.js";
import { readPdf, pdfPagesToTable } from "../data/pdf.js";
import { detectFields, applyTypes, TYPE_LABEL, isBlank } from "../data/types.js";
import { profileDataset, suggestSteps } from "../data/profile.js";
import { addDataset, getState, upsertDashboard, createDashboard, pushNotification } from "../core/store.js";
import { createStep } from "../data/transform.js";
import { navigate } from "../app.js";

const ACCEPTED = ".csv,.tsv,.txt,.json,.xml,.xlsx,.xlsm,.xls,.pdf";

export function renderImportView(root) {
  const input = el("input", {
    type: "file",
    multiple: true,
    accept: ACCEPTED,
    class: "sr-only",
    id: "file-input",
    "on:change": (e) => handleFiles(Array.from(e.target.files || [])),
  });

  const dropzone = el(
    "div.dropzone",
    {
      role: "button",
      tabindex: "0",
      "aria-label": "Área de upload: clique ou arraste arquivos",
      "on:click": () => input.click(),
      "on:keydown": (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          input.click();
        }
      },
      "on:dragover": (e) => {
        e.preventDefault();
        dropzone.classList.add("is-dragging");
      },
      "on:dragleave": () => dropzone.classList.remove("is-dragging"),
      "on:drop": (e) => {
        e.preventDefault();
        dropzone.classList.remove("is-dragging");
        handleFiles(Array.from(e.dataTransfer.files || []));
      },
    },
    [
      el("div.dropzone__icon", {}, [icon("upload", { size: 26 })]),
      el("h3", { text: "Arraste seus arquivos aqui" }),
      el("p.muted", { text: "ou clique para escolher no computador" }),
      el("div.row.wrap", { style: { justifyContent: "center", marginTop: "14px" } },
        ["PDF", "XLSX", "XLS", "CSV", "TXT", "JSON", "XML"].map((f) => el("span.chip", { text: f }))
      ),
      el("p.dim.t-xs", {
        style: { marginTop: "12px" },
        text: "Os arquivos são lidos no seu próprio navegador. Nada é enviado para servidores externos.",
      }),
    ]
  );

  render(root, [
    el("div.view__head", {}, [
      el("div", {}, [
        el("h1", { text: "Importar arquivos" }),
        el("p", {
          text: "Envie planilhas, CSVs, JSON, XML ou PDFs. O sistema identifica colunas, tipos, datas, moedas e inconsistências, e mostra uma prévia antes de confirmar.",
        }),
      ]),
    ]),
    input,
    dropzone,
    el("div.grid-2", { style: { marginTop: "24px" } }, [
      sourceCard("Planilhas (XLSX/XLSM)", "table", [
        "Escolha da aba e da linha de cabeçalho",
        "Datas e moedas reconhecidas pelo formato da célula",
        "Fórmulas entram com o último valor calculado",
      ]),
      sourceCard("CSV, TSV e TXT", "file", [
        "Delimitador detectado automaticamente (e ajustável)",
        "Aspas, quebras de linha internas e BOM tratados",
        "TXT de largura fixa reconhecido por alinhamento",
      ]),
      sourceCard("PDF", "reports", [
        "Extração de texto com posição para montar tabelas",
        "Seleção das páginas a importar",
        "Páginas digitalizadas são sinalizadas (exigem OCR)",
      ]),
      sourceCard("JSON e XML", "layers", [
        "Localiza automaticamente a lista de registros",
        "Achata objetos aninhados em colunas",
        "Suporte a NDJSON (um registro por linha)",
      ]),
    ]),
    el("div.card.card--pad", { style: { marginTop: "20px" } }, [
      el("div.section-title", {}, [icon("info", { size: 13 }), el("span", { text: "Conexões externas" })]),
      el("p.muted.t-sm", {
        text: "Google Sheets, bancos de dados (PostgreSQL/MySQL) e APIs externas exigem um servidor intermediário para guardar credenciais com segurança. A arquitetura está documentada em docs/ARQUITETURA.md; nesta versão estática, use a exportação em CSV/XLSX dessas ferramentas.",
      }),
      el("div.row.wrap", {}, [
        el("span.badge.badge--neutral", { text: "Google Sheets — via exportação CSV" }),
        el("span.badge.badge--neutral", { text: "Banco de dados — roadmap (back-end)" }),
        el("span.badge.badge--neutral", { text: "API externa — roadmap (back-end)" }),
      ]),
    ]),
  ]);
}

function sourceCard(title, iconName, items) {
  return el("div.card.card--pad", {}, [
    el("div.row", { style: { marginBottom: "8px" } }, [icon(iconName, { size: 16 }), el("strong", { text: title })]),
    el("ul.stack-2.muted.t-xs", {}, items.map((i) => el("li", { text: `• ${i}` }))),
  ]);
}

/* ------------------------------------------------------------- leitura --- */

export async function handleFiles(files) {
  for (const file of files) {
    try {
      await handleFile(file);
    } catch (err) {
      console.error(err);
      toast(`Falha ao ler "${file.name}"`, { level: "error", message: err.message });
    }
  }
}

async function handleFile(file) {
  const ext = extensionOf(file.name);
  const progress = progressBar();
  const status = el("div.muted.t-sm", { text: "Lendo o arquivo…" });
  const ref = modal({
    title: `Importando ${file.name}`,
    subtitle: `${formatLabel(ext)} · ${fmtBytes(file.size)}`,
    dismissible: false,
    body: el("div.stack-3", {}, [status, progress.root]),
  });
  progress.set(0.1);

  try {
    if (ext === "xls") {
      throw new Error(
        "Arquivos .xls (Excel 97-2003) não são suportados. Abra no Excel/LibreOffice e salve como .xlsx ou .csv."
      );
    }

    let result;
    if (["xlsx", "xlsm"].includes(ext)) {
      status.textContent = "Descompactando e lendo as abas…";
      const buffer = await file.arrayBuffer();
      progress.set(0.4);
      const workbook = await readWorkbookFile(buffer);
      progress.set(0.8);
      ref.close();
      openSheetPicker(file, workbook);
      return;
    }
    if (ext === "pdf") {
      status.textContent = "Extraindo texto e detectando tabelas…";
      const buffer = await file.arrayBuffer();
      progress.set(0.35);
      const pdf = await readPdf(buffer);
      progress.set(0.85);
      ref.close();
      if (pdf.encrypted) {
        toast("PDF protegido", { level: "error", message: pdf.warnings[0] });
        return;
      }
      openPdfPicker(file, pdf);
      return;
    }

    const text = await file.text();
    progress.set(0.5);
    if (ext === "json") result = parseJSONText(text);
    else if (ext === "xml") result = parseXMLText(text);
    else if (ext === "txt") {
      const delimiter = sniffDelimiter(text);
      const looksDelimited = text.split(/\r?\n/).slice(0, 5).every((l) => !l.trim() || l.includes(delimiter));
      result = looksDelimited ? parseDelimitedText(text, { delimiter }) : parseFixedWidth(text);
    } else {
      result = parseDelimitedText(text);
    }

    progress.set(1);
    ref.close();
    openPreview({
      file,
      table: result,
      format: ext,
      reparse: ["csv", "tsv", "txt"].includes(ext)
        ? (opts) => parseDelimitedText(text, opts)
        : null,
    });
  } catch (err) {
    ref.close();
    throw err;
  }
}

/* ------------------------------------------------------- seletor de abas */

function openSheetPicker(file, workbook) {
  let selected = workbook.sheets.findIndex((s) => !s.hidden && s.rows > 1);
  if (selected < 0) selected = 0;

  const list = el("div.list", { style: { maxHeight: "320px" } });
  const renderList = () => {
    render(
      list,
      workbook.sheets.map((sheet, i) =>
        el(
          `div.list__row${i === selected ? ".is-selected" : ""}`,
          {
            role: "button",
            tabindex: "0",
            "on:click": () => {
              selected = i;
              renderList();
            },
          },
          [
            icon("table", { size: 14 }),
            el("span.grow", { text: sheet.name }),
            sheet.hidden ? el("span.badge.badge--warn", { text: "oculta" }) : null,
            el("span.dim", { text: `${sheet.rows} linhas · ${sheet.cells} células` }),
          ]
        )
      )
    );
  };
  renderList();

  const ref = modal({
    title: "Escolha a aba",
    subtitle: file.name,
    body: el("div.stack-3", {}, [
      workbook.warnings.length
        ? el("div.disclaimer", {}, [icon("alert", { size: 13 }), el("span", { text: workbook.warnings.join(" ") })])
        : null,
      list,
    ]),
    actions: [
      el("button.btn", { text: "Cancelar", "on:click": () => ref.close() }),
      el("button.btn.btn--primary", {
        text: "Continuar",
        "on:click": () => {
          const sheet = workbook.sheets[selected];
          ref.close();
          const table = sheetToTable(sheet.matrix);
          openPreview({
            file,
            table: { ...table, warnings: [...table.warnings, ...workbook.warnings] },
            format: "xlsx",
            sheetName: sheet.name,
            reparse: (opts) => sheetToTable(sheet.matrix, opts),
          });
        },
      }),
    ],
  });
}

/* ------------------------------------------------- seletor de páginas PDF */

function openPdfPicker(file, pdf) {
  const selected = new Set(pdf.pages.filter((p) => p.matrix.length && p.confidence >= 0.45).map((p) => p.number));

  const pageList = el("div.list", { style: { maxHeight: "300px" } });
  const previewBox = el("div.table-wrap", { style: { maxHeight: "260px" } });

  const showPreview = (page) => {
    if (!page?.matrix?.length) {
      render(previewBox, el("div.empty", {}, [el("p", { text: "Sem tabela detectada nesta página." })]));
      return;
    }
    render(previewBox, [
      el("table.data", {}, [
        el("tbody", {}, page.matrix.slice(0, 25).map((row) => el("tr", {}, row.map((cell) => el("td", { text: cell || "—" }))))),
      ]),
    ]);
  };

  const renderPages = () => {
    render(
      pageList,
      pdf.pages.map((page) => {
        const confidencePct = Math.round(page.confidence * 100);
        const level = page.needsOcr ? "danger" : page.confidence >= 0.7 ? "ok" : page.confidence >= 0.45 ? "warn" : "danger";
        return el("div.list__row", {}, [
          el("label.check.grow", {}, [
            el("input", {
              type: "checkbox",
              checked: selected.has(page.number),
              disabled: !page.matrix.length,
              "on:change": (e) => {
                if (e.target.checked) selected.add(page.number);
                else selected.delete(page.number);
              },
            }),
            el("span", { text: `Página ${page.number}` }),
          ]),
          el(`span.badge.badge--${level}`, {
            text: page.needsOcr ? "requer OCR" : page.empty ? "vazia" : `confiança ${confidencePct}%`,
          }),
          el("span.dim", { text: `${page.matrix.length} linha(s) · ${page.columns} coluna(s)` }),
          el("button.btn.btn--sm.btn--ghost", { text: "Ver", "on:click": () => showPreview(page) }),
        ]);
      })
    );
  };
  renderPages();
  showPreview(pdf.pages.find((p) => selected.has(p.number)) || pdf.pages[0]);

  const ref = modal({
    title: "Páginas do PDF",
    subtitle: `${file.name} · ${pdf.pages.length} página(s)`,
    wide: true,
    body: el("div.stack-3", {}, [
      pdf.warnings.length
        ? el("div.disclaimer", {}, [icon("alert", { size: 13 }), el("span", { text: pdf.warnings.join(" ") })])
        : null,
      el("div.grid-2", {}, [
        el("div", {}, [el("div.section-title", { text: "Selecione as páginas" }), pageList]),
        el("div", {}, [el("div.section-title", { text: "Prévia do conteúdo extraído" }), previewBox]),
      ]),
      el("p.dim.t-xs", {
        text: "Revise a prévia com atenção: a leitura de PDF depende de como o arquivo foi gerado. Páginas digitalizadas precisam de OCR, que não está disponível nesta versão offline.",
      }),
    ]),
    actions: [
      el("button.btn", { text: "Cancelar", "on:click": () => ref.close() }),
      el("button.btn.btn--primary", {
        text: "Continuar",
        "on:click": () => {
          if (!selected.size) {
            toast("Selecione ao menos uma página", { level: "warn" });
            return;
          }
          const table = pdfPagesToTable(pdf.pages, Array.from(selected));
          if (!table.rows.length) {
            toast("Nenhuma linha foi extraída das páginas selecionadas", { level: "error" });
            return;
          }
          ref.close();
          openPreview({
            file,
            table: { ...table, warnings: [...(table.warnings || []), ...pdf.warnings] },
            format: "pdf",
          });
        },
      }),
    ],
  });
}

/* ------------------------------------------------------------- prévia --- */

/**
 * Prévia + validação + confirmação.
 * @param {{file:File, table:Object, format:string, sheetName?:string, reparse?:Function}} params
 */
export function openPreview({ file, table, format, sheetName, reparse }) {
  let current = table;
  let fields = detectFields(current.rows.slice(0, 800), current.columns);
  let name = file.name.replace(/\.[^.]+$/, "");
  const chosenSteps = new Set();

  const body = el("div.stack-4");
  const ref = modal({
    title: "Prévia da importação",
    subtitle: `${file.name}${sheetName ? ` · aba "${sheetName}"` : ""}`,
    wide: true,
    body,
    actions: [
      el("button.btn", { text: "Cancelar", "on:click": () => ref.close() }),
      el("button.btn.btn--primary", {
        text: "Confirmar importação",
        "on:click": () => confirmImport(),
      }),
    ],
  });

  const rerender = () => {
    const typed = applyTypes(current.rows, fields);
    const quality = profileDataset(typed.rows, fields);
    const suggestions = suggestSteps(quality);

    render(body, [
      /* nome + opções de leitura */
      el("div.grid-2", {}, [
        el("div.field", {}, [
          el("label", { text: "Nome da fonte de dados" }),
          el("input.input", {
            value: name,
            "on:input": debounce((e) => {
              name = e.target.value;
            }, 150),
          }),
        ]),
        reparse ? readOptionsField() : el("div"),
      ]),

      /* resumo */
      el("div.row.wrap", {}, [
        el("span.badge.badge--info", { text: `${current.rows.length.toLocaleString("pt-BR")} linhas` }),
        el("span.badge.badge--info", { text: `${fields.length} colunas` }),
        el("span.badge.badge--neutral", { text: formatLabel(format) }),
        quality.duplicates ? el("span.badge.badge--warn", { text: `${quality.duplicates} duplicadas` }) : null,
        el(`span.badge.badge--${quality.score > 0.8 ? "ok" : quality.score > 0.5 ? "warn" : "danger"}`, {
          text: `qualidade ${Math.round(quality.score * 100)}%`,
        }),
      ]),

      /* avisos do leitor */
      current.warnings?.length
        ? el("div.disclaimer", {}, [
            icon("alert", { size: 13 }),
            el("div", {}, current.warnings.map((w) => el("div", { text: w }))),
          ])
        : null,

      /* colunas detectadas */
      el("div", {}, [
        el("div.section-title", {}, [icon("layers", { size: 13 }), el("span", { text: "Colunas detectadas" })]),
        el("div.table-wrap", { style: { maxHeight: "260px" } }, [
          el("table.data", {}, [
            el("thead", {}, [
              el("tr", {}, [
                el("th", { text: "Incluir" }),
                el("th", { text: "Coluna" }),
                el("th", { text: "Tipo detectado" }),
                el("th.num", { text: "Vazios" }),
                el("th.num", { text: "Distintos" }),
                el("th", { text: "Exemplo" }),
              ]),
            ]),
            el(
              "tbody",
              {},
              fields.map((field, idx) => {
                const col = quality.columns[idx];
                const sample = current.rows.find((r) => !isBlank(r[field.name]))?.[field.name];
                return el("tr", {}, [
                  el("td", {}, [
                    el("input", {
                      type: "checkbox",
                      checked: field.visible !== false,
                      "aria-label": `Incluir coluna ${field.name}`,
                      "on:change": (e) => {
                        field.visible = e.target.checked;
                      },
                    }),
                  ]),
                  el("td", { text: field.name }),
                  el("td", {}, [
                    el(
                      "select.select",
                      {
                        style: { height: "26px", fontSize: "11px" },
                        "on:change": (e) => {
                          field.type = e.target.value;
                          rerender();
                        },
                      },
                      Object.entries(TYPE_LABEL).map(([value, label]) =>
                        el("option", { value, selected: field.type === value ? "selected" : null, text: label })
                      )
                    ),
                  ]),
                  el("td.num", {
                    text: `${col.blanks}`,
                    class: col.blankPct > 0.3 ? "text-warn num" : "num",
                  }),
                  el("td.num", { text: String(col.distinct) }),
                  el("td.dim", { text: sample === undefined ? "—" : String(sample).slice(0, 40) }),
                ]);
              })
            ),
          ]),
        ]),
      ]),

      /* problemas encontrados */
      quality.issues.length
        ? el("div", {}, [
            el("div.section-title", {}, [icon("alert", { size: 13 }), el("span", { text: "O que encontramos" })]),
            el("div.stack-2", {}, quality.issues.slice(0, 6).map((issue) =>
              el(`div.insight.insight--${issue.level === "error" ? "neg" : issue.level === "warn" ? "warn" : "info"}`, {}, [
                el("div.insight__icon", {}, [icon(issue.level === "info" ? "info" : "alert", { size: 14 })]),
                el("div", {}, [el("div.insight__text", { text: issue.message })]),
              ])
            )),
          ])
        : null,

      /* limpeza sugerida */
      suggestions.length
        ? el("div", {}, [
            el("div.section-title", {}, [icon("wand", { size: 13 }), el("span", { text: "Limpeza sugerida (opcional)" })]),
            el("div.stack-2", {}, suggestions.map((s, i) =>
              el("label.check", {}, [
                el("input", {
                  type: "checkbox",
                  "on:change": (e) => {
                    if (e.target.checked) chosenSteps.add(i);
                    else chosenSteps.delete(i);
                  },
                }),
                el("span", { text: s.label }),
              ])
            )),
            el("input", { type: "hidden", "data-suggestions": JSON.stringify(suggestions.map((s) => s.step)) }),
          ])
        : null,

      /* amostra */
      el("div", {}, [
        el("div.section-title", {}, [icon("table", { size: 13 }), el("span", { text: "Amostra dos dados (20 primeiras linhas)" })]),
        el("div.table-wrap", { style: { maxHeight: "300px" } }, [
          el("table.data", {}, [
            el("thead", {}, [el("tr", {}, fields.filter((f) => f.visible !== false).map((f) => el("th", { text: f.name })))]),
            el(
              "tbody",
              {},
              typed.rows.slice(0, 20).map((row) =>
                el(
                  "tr",
                  {},
                  fields
                    .filter((f) => f.visible !== false)
                    .map((f) =>
                      row[f.name] === null
                        ? el("td.cell-null", { text: "vazio" })
                        : el("td", { text: fmtByType(row[f.name], f.type) })
                    )
                )
              )
            ),
          ]),
        ]),
      ]),
    ]);

    body.dataset.suggestions = JSON.stringify(suggestions.map((s) => s.step));
  };

  function readOptionsField() {
    const delimiterSelect = el(
      "select.select",
      {
        "on:change": (e) => {
          current = reparse({ delimiter: e.target.value === "auto" ? undefined : e.target.value });
          fields = detectFields(current.rows.slice(0, 800), current.columns);
          rerender();
        },
      },
      [
        el("option", { value: "auto", text: "Detectar automaticamente" }),
        el("option", { value: ";", text: "Ponto e vírgula (;)" }),
        el("option", { value: ",", text: "Vírgula (,)" }),
        el("option", { value: "\t", text: "Tabulação" }),
        el("option", { value: "|", text: "Barra vertical (|)" }),
      ]
    );
    const headerInput = el("input.input", {
      type: "number",
      min: "0",
      value: String(current.meta?.headerRow ?? 0),
      "on:change": (e) => {
        current = reparse({ headerRow: Number(e.target.value) });
        fields = detectFields(current.rows.slice(0, 800), current.columns);
        rerender();
      },
    });
    return el("div.grid-2", {}, [
      el("div.field", {}, [el("label", { text: "Delimitador" }), delimiterSelect]),
      el("div.field", {}, [el("label", { text: "Linha do cabeçalho (0 = primeira)" }), headerInput]),
    ]);
  }

  async function confirmImport() {
    const kept = fields.filter((f) => f.visible !== false);
    if (!kept.length) {
      toast("Selecione pelo menos uma coluna", { level: "warn" });
      return;
    }
    const typed = applyTypes(current.rows, kept);
    const rows = typed.rows;
    const quality = profileDataset(rows, kept);

    const suggestions = JSON.parse(body.dataset.suggestions || "[]");
    const transforms = Array.from(chosenSteps).map((i) => createStep(suggestions[i].type, suggestions[i]));

    const dataset = await addDataset(
      {
        name: name || file.name,
        fields: kept,
        quality,
        transforms,
        source: {
          kind: "arquivo",
          format,
          fileName: file.name,
          size: file.size,
          sheet: sheetName || null,
        },
      },
      rows
    );

    ref.close();
    toast("Importação concluída", {
      level: "success",
      message: `${rows.length.toLocaleString("pt-BR")} linhas em "${dataset.name}".`,
    });
    pushNotification({
      level: "success",
      title: "Nova fonte importada",
      message: `${dataset.name} — ${rows.length.toLocaleString("pt-BR")} linhas`,
    });

    // Primeiro dashboard automático quando ainda não existe nenhum real.
    const state = getState();
    const hasRealDashboard = state.dashboards.some((d) => !d.isDemo);
    if (!hasRealDashboard) {
      const { buildAutoDashboard } = await import("./templates.js");
      const dashboard = buildAutoDashboard(dataset, rows);
      upsertDashboard(dashboard);
      toast("Dashboard inicial criado automaticamente", {
        level: "info",
        message: "Você pode editar, adicionar e reorganizar os componentes.",
        action: { label: "Abrir dashboard", onClick: () => navigate("visao-geral") },
      });
      navigate("visao-geral");
    } else {
      navigate("fontes");
    }
    void createDashboard;
  }

  rerender();
}
