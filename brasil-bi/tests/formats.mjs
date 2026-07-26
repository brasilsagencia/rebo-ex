/**
 * Teste do leitor de PDF (Node 22+).
 *
 * Monta um PDF mínimo à mão — com stream de conteúdo não comprimido e
 * operadores de texto posicionados — e verifica se o extrator reconstrói as
 * linhas e as colunas da tabela.
 *
 *   node tests/formats.mjs
 */

import { readPdf, pdfPagesToTable } from "../js/data/pdf.js";

let fails = 0;
const eq = (label, got, exp) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (!ok) fails += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label} → ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(exp)})`}`);
};

/** Gera um PDF de uma página com uma tabela de 3 colunas. */
function buildPdf(rows) {
  const lines = [];
  let y = 720;
  for (const row of rows) {
    lines.push(
      `BT /F1 11 Tf 72 ${y} Td (${row[0]}) Tj ET`,
      `BT /F1 11 Tf 240 ${y} Td (${row[1]}) Tj ET`,
      `BT /F1 11 Tf 400 ${y} Td (${row[2]}) Tj ET`
    );
    y -= 22;
  }
  const content = lines.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];

  let pdf = "%PDF-1.4\n";
  objects.forEach((body, i) => {
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  pdf += "trailer\n<< /Size 6 /Root 1 0 R >>\n%%EOF";
  return new TextEncoder().encode(pdf).buffer;
}

const table = [
  ["Produto", "Quantidade", "Valor"],
  ["Cafe", "12", "10,50"],
  ["Cha", "8", "7,20"],
  ["Bolo", "5", "3,00"],
];

const pdf = await readPdf(buildPdf(table));

console.log("--- leitura de PDF ---");
eq("páginas encontradas", pdf.pages.length, 1);
eq("não exige OCR", pdf.pages[0].needsOcr, false);
eq("colunas detectadas", pdf.pages[0].columns, 3);
eq("linhas detectadas", pdf.pages[0].matrix.length, 4);
eq("cabeçalho", pdf.pages[0].matrix[0], ["Produto", "Quantidade", "Valor"]);
eq("primeira linha de dados", pdf.pages[0].matrix[1], ["Cafe", "12", "10,50"]);
console.log(`     confiança: ${Math.round(pdf.pages[0].confidence * 100)}%`);

const converted = pdfPagesToTable(pdf.pages, [1]);
eq("colunas da tabela", converted.columns, ["__pagina", "Produto", "Quantidade", "Valor"]);
eq("registros", converted.rows.length, 3);
eq("valor convertido", converted.rows[0].Valor, "10,50");

console.log("\n--- PDF sem texto (digitalizado) ---");
const scanned = new TextEncoder().encode(
  "%PDF-1.4\n" +
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n" +
    "4 0 obj\n<< /Subtype /Image /Width 10 /Height 10 >>\nendobj\n" +
    "5 0 obj\n<< /Length 12 >>\nstream\nq 1 0 0 1 0 0 cm Q\nendstream\nendobj\n" +
    "trailer\n<< /Root 1 0 R >>\n%%EOF"
).buffer;
const scannedResult = await readPdf(scanned);
eq("marcado como requer OCR", scannedResult.pages[0]?.needsOcr, true);
eq("avisa o usuário", scannedResult.warnings.some((w) => /OCR/.test(w)), true);

console.log("\n--- PDF criptografado ---");
const encrypted = new TextEncoder().encode(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R /Encrypt 9 0 R >>\n%%EOF"
).buffer;
const encryptedResult = await readPdf(encrypted);
eq("detecta criptografia", encryptedResult.encrypted, true);

console.log(`\n${fails ? `❌ ${fails} falha(s)` : "✅ todos os testes passaram"}`);
process.exit(fails ? 1 : 0);
