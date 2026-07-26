import {
  parseNumberLoose, fmtByType, fmtDate, fmtCurrency, fmtCompact, toDate,
} from "../js/core/utils.js";
import { inferType, detectFields, coerce } from "../js/data/types.js";
import { compileFormula, explainFormula } from "../js/data/formula.js";
import { parseDelimitedText, parseJSONText, sniffDelimiter } from "../js/data/parsers.js";
import { applySteps, createStep, aggregate } from "../js/data/transform.js";

let fails = 0;
const eq = (label, got, exp) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (!ok) fails += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label} → ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(exp)})`}`);
};

console.log("--- números ---");
eq("R$ 1.234,56", parseNumberLoose("R$ 1.234,56"), 1234.56);
eq("1,234.56 (en-US)", parseNumberLoose("1,234.56"), 1234.56);
eq("(500) contábil", parseNumberLoose("(500)"), -500);
eq("12,5%", parseNumberLoose("12,5%"), 12.5);
eq("CLI-1001 não é número", parseNumberLoose("CLI-1001"), null);
eq("SKU9 não é número", parseNumberLoose("SKU9"), null);
eq("1.234 milhar pt-BR", parseNumberLoose("1.234"), 1234);
eq("texto puro", parseNumberLoose("abc"), null);
eq("zero", parseNumberLoose("0"), 0);

console.log("\n--- datas ---");
eq("31/12/2024", fmtDate("31/12/2024"), "31/12/2024");
eq("ISO", fmtDate("2024-03-05"), "05/03/2024");
eq("mês", fmtDate("05/03/2024", "month"), "mar/24");
eq("data inválida", toDate("35/13/2024"), null);
eq("12 de março de 2024", fmtDate("12 de março de 2024"), "12/03/2024");

console.log("\n--- formatação ---");
eq("booleano Sim", fmtByType("Sim", "boolean"), "Sim");
eq("booleano Não", fmtByType("Não", "boolean"), "Não");
eq("moeda", fmtCurrency(1234.5).replace(/ /g, " "), "R$ 1.234,50");
eq("compacto", fmtCompact(1234567), "1,23 mi");

console.log("\n--- inferência de tipo ---");
eq("Faturamento → currency", inferType("Faturamento", ["1200,50", "980", "3400,10"]).type, "currency");
eq("Data → date", inferType("Data", ["01/02/2025", "15/03/2025"]).type, "date");
eq("Taxa → percent", inferType("Taxa de conversão", ["12,5", "8,3"]).type, "percent");
eq("Cliente código → text", inferType("Cliente", ["CLI-1", "CLI-2", "CLI-3"]).type, "text");
eq("Novo cliente → boolean", inferType("Novo cliente", ["Sim", "Não", "Sim"]).type, "boolean");
eq("coerce moeda", coerce("R$ 2.500,00", "currency"), 2500);

console.log("\n--- CSV ---");
const csv = 'Nome;Valor;Data\n"Silva; Ltda";R$ 1.500,00;01/02/2025\nOutra;2.000,50;15/03/2025';
eq("delimitador", sniffDelimiter(csv), ";");
const table = parseDelimitedText(csv);
eq("colunas", table.columns, ["Nome", "Valor", "Data"]);
eq("aspas com delimitador interno", table.rows[0].Nome, "Silva; Ltda");
eq("linhas", table.rows.length, 2);

console.log("\n--- JSON aninhado ---");
const json = parseJSONText('{"resultado":{"itens":[{"id":1,"cliente":{"nome":"Ana"}},{"id":2,"cliente":{"nome":"Beto"}}]}}');
eq("achatamento", json.columns, ["id", "cliente.nome"]);
eq("registros", json.rows.length, 2);

console.log("\n--- fórmulas ---");
const f1 = compileFormula("([Faturamento] - [Custo]) / [Faturamento] * 100", ["Faturamento", "Custo"]);
eq("compila", f1.ok, true);
eq("avalia margem", Math.round(f1.evaluate({ Faturamento: 1000, Custo: 600 })), 40);
const f2 = compileFormula('SE([Vendas] > 100; "Alto"; "Baixo")', ["Vendas"]);
eq("SE verdadeiro", f2.evaluate({ Vendas: 150 }), "Alto");
eq("SE falso", f2.evaluate({ Vendas: 50 }), "Baixo");
eq("campo inexistente", compileFormula("[NaoExiste] + 1", ["A"]).ok, false);
eq("sintaxe inválida", compileFormula("SOMA(", ["A"]).ok, false);
eq("divisão por zero → null", compileFormula("[A] / [B]", ["A", "B"]).evaluate({ A: 5, B: 0 }), null);
console.log("     explicação:", explainFormula("[A] * 2"));

console.log("\n--- pipeline de transformação ---");
const rows = [
  { Produto: " café ", Valor: "10,50", Status: "ativo" },
  { Produto: "chá", Valor: "", Status: "ativo" },
  { Produto: "chá", Valor: "", Status: "ativo" },
  { Produto: "bolo", Valor: "3,00", Status: "inativo" },
];
const fields = detectFields(rows);
const steps = [
  createStep("trim", { field: "Produto" }),
  createStep("setType", { field: "Valor", toType: "currency" }),
  createStep("fillBlanks", { field: "Valor", strategy: "zero" }),
  createStep("removeDuplicates", { fields: ["Produto", "Valor"] }),
  createStep("filterRows", { field: "Status", op: "eq", value: "ativo" }),
  createStep("computedColumn", { name: "Dobro", expr: "[Valor] * 2" }),
];
const out = applySteps(rows, fields, steps);
eq("erros no pipeline", out.log.filter((l) => l.error).map((l) => l.error), []);
eq("linhas finais", out.rows.length, 2);
eq("trim aplicado", out.rows[0].Produto, "café");
eq("vazio → 0", out.rows[1].Valor, 0);
eq("coluna calculada", out.rows[0].Dobro, 21);
eq("soma", aggregate([1, 2, 3], "sum"), 6);
eq("contagem distinta", aggregate(["a", "a", "b", null], "countDistinct"), 2);
eq("mediana", aggregate([1, 3, 100], "median"), 3);

console.log(`\n${fails ? `❌ ${fails} falha(s)` : "✅ todos os testes passaram"}`);
process.exit(fails ? 1 : 0);
