/**
 * Brasil BI — motor de fórmulas (colunas calculadas e medidas).
 *
 * Sintaxe em português, inspirada em planilhas:
 *   [Faturamento] - [Custo]
 *   SE([Vendas] > [Meta]; "Atingiu"; "Abaixo")
 *   ARRED([Lucro] / [Faturamento] * 100; 2)
 *
 * Separador de argumentos: ";" (padrão pt-BR) ou "," — ambos aceitos.
 */

import { parseNumberLoose, toDate, isFiniteNumber } from "../core/utils.js";

/* ------------------------------------------------------------- funções --- */

const asNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  return parseNumberLoose(v);
};
const asText = (v) => (v === null || v === undefined ? "" : String(v));
const asBool = (v) => v === true || v === 1 || (typeof v === "string" && ["sim", "true", "verdadeiro"].includes(v.toLowerCase()));

export const FUNCTIONS = {
  SE: { arity: [2, 3], help: "SE(condição; valor_se_verdadeiro; valor_se_falso)", fn: (c, a, b = null) => (asBool(c) ? a : b) },
  E: { arity: [2, 99], help: "E(cond1; cond2; …) — verdadeiro se todas forem", fn: (...args) => args.every(asBool) },
  OU: { arity: [2, 99], help: "OU(cond1; cond2; …)", fn: (...args) => args.some(asBool) },
  NAO: { arity: [1, 1], help: "NAO(condição)", fn: (a) => !asBool(a) },
  ABS: { arity: [1, 1], help: "ABS(número)", fn: (a) => (asNum(a) === null ? null : Math.abs(asNum(a))) },
  ARRED: { arity: [1, 2], help: "ARRED(número; casas)", fn: (a, d = 0) => {
    const n = asNum(a);
    if (n === null) return null;
    const f = 10 ** (asNum(d) ?? 0);
    return Math.round(n * f) / f;
  } },
  TETO: { arity: [1, 1], help: "TETO(número)", fn: (a) => (asNum(a) === null ? null : Math.ceil(asNum(a))) },
  PISO: { arity: [1, 1], help: "PISO(número)", fn: (a) => (asNum(a) === null ? null : Math.floor(asNum(a))) },
  RAIZ: { arity: [1, 1], help: "RAIZ(número)", fn: (a) => (asNum(a) === null ? null : Math.sqrt(asNum(a))) },
  POT: { arity: [2, 2], help: "POT(base; expoente)", fn: (a, b) => (asNum(a) ?? 0) ** (asNum(b) ?? 0) },
  MIN: { arity: [1, 99], help: "MIN(a; b; …)", fn: (...args) => Math.min(...args.map(asNum).filter(isFiniteNumber)) },
  MAX: { arity: [1, 99], help: "MAX(a; b; …)", fn: (...args) => Math.max(...args.map(asNum).filter(isFiniteNumber)) },
  CONCAT: { arity: [1, 99], help: "CONCAT(texto1; texto2; …)", fn: (...args) => args.map(asText).join("") },
  TEXTO: { arity: [1, 1], help: "TEXTO(valor)", fn: asText },
  NUMERO: { arity: [1, 1], help: "NUMERO(texto) — converte texto em número", fn: asNum },
  MAIUSCULA: { arity: [1, 1], help: "MAIUSCULA(texto)", fn: (a) => asText(a).toUpperCase() },
  MINUSCULA: { arity: [1, 1], help: "MINUSCULA(texto)", fn: (a) => asText(a).toLowerCase() },
  APARAR: { arity: [1, 1], help: "APARAR(texto) — remove espaços extras", fn: (a) => asText(a).replace(/\s+/g, " ").trim() },
  SUBSTITUIR: { arity: [3, 3], help: "SUBSTITUIR(texto; procurar; trocar_por)", fn: (a, b, c) => asText(a).split(asText(b)).join(asText(c)) },
  ESQUERDA: { arity: [2, 2], help: "ESQUERDA(texto; n)", fn: (a, n) => asText(a).slice(0, asNum(n) ?? 0) },
  DIREITA: { arity: [2, 2], help: "DIREITA(texto; n)", fn: (a, n) => asText(a).slice(-(asNum(n) ?? 0)) },
  NUMCARACT: { arity: [1, 1], help: "NUMCARACT(texto)", fn: (a) => asText(a).length },
  CONTEM: { arity: [2, 2], help: "CONTEM(texto; procurar)", fn: (a, b) => asText(a).toLowerCase().includes(asText(b).toLowerCase()) },
  ANO: { arity: [1, 1], help: "ANO(data)", fn: (a) => toDate(a)?.getFullYear() ?? null },
  MES: { arity: [1, 1], help: "MES(data)", fn: (a) => (toDate(a) ? toDate(a).getMonth() + 1 : null) },
  DIA: { arity: [1, 1], help: "DIA(data)", fn: (a) => toDate(a)?.getDate() ?? null },
  TRIMESTRE: { arity: [1, 1], help: "TRIMESTRE(data)", fn: (a) => (toDate(a) ? Math.floor(toDate(a).getMonth() / 3) + 1 : null) },
  HOJE: { arity: [0, 0], help: "HOJE()", fn: () => new Date().toISOString() },
  DIAS: { arity: [2, 2], help: "DIAS(data_final; data_inicial)", fn: (a, b) => {
    const d1 = toDate(a);
    const d2 = toDate(b);
    return d1 && d2 ? Math.round((d1 - d2) / 86400000) : null;
  } },
  VAZIO: { arity: [1, 1], help: "VAZIO(valor) — verdadeiro se estiver em branco", fn: (a) => a === null || a === undefined || a === "" },
  SENAOERRO: { arity: [2, 2], help: "SENAOERRO(valor; alternativa)", fn: (a, b) => (a === null || a === undefined || Number.isNaN(a) ? b : a) },
};

export const FUNCTION_NAMES = Object.keys(FUNCTIONS);

/* ------------------------------------------------------------ tokenizer --- */

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "[") {
      const end = src.indexOf("]", i);
      if (end < 0) throw new Error("Colchete de campo não fechado — use [Nome do campo]");
      tokens.push({ type: "field", value: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = src.indexOf(ch, i + 1);
      if (end < 0) throw new Error("Texto não fechado — falta uma aspa");
      tokens.push({ type: "string", value: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] || ""))) {
      const m = src.slice(i).match(/^\d+(\.\d+)?/);
      tokens.push({ type: "number", value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["<=", ">=", "<>", "!="].includes(two)) {
      tokens.push({ type: "op", value: two === "!=" ? "<>" : two });
      i += 2;
      continue;
    }
    if ("+-*/()<>=;,%".includes(ch)) {
      tokens.push({ type: ch === ";" || ch === "," ? "sep" : "op", value: ch });
      i += 1;
      continue;
    }
    const ident = src.slice(i).match(/^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*/);
    if (ident) {
      tokens.push({ type: "ident", value: ident[0].replace(/\./g, "") });
      i += ident[0].length;
      continue;
    }
    throw new Error(`Caractere inesperado: "${ch}"`);
  }
  return tokens;
}

/* --------------------------------------------------------------- parser --- */

function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = (type, value) => {
    const token = tokens[pos];
    if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
      throw new Error(`Esperado ${value || type} na posição ${pos + 1}`);
    }
    pos += 1;
    return token;
  };

  function parseExpr() {
    return parseOr();
  }
  function parseOr() {
    let left = parseAnd();
    while (peek()?.type === "ident" && peek().value.toUpperCase() === "OU") {
      pos += 1;
      left = { kind: "call", name: "OU", args: [left, parseAnd()] };
    }
    return left;
  }
  function parseAnd() {
    let left = parseCmp();
    while (peek()?.type === "ident" && peek().value.toUpperCase() === "E") {
      pos += 1;
      left = { kind: "call", name: "E", args: [left, parseCmp()] };
    }
    return left;
  }
  function parseCmp() {
    let left = parseAdd();
    while (peek()?.type === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(peek().value)) {
      const op = eat("op").value;
      left = { kind: "binary", op, left, right: parseAdd() };
    }
    return left;
  }
  function parseAdd() {
    let left = parseMul();
    while (peek()?.type === "op" && ["+", "-"].includes(peek().value)) {
      const op = eat("op").value;
      left = { kind: "binary", op, left, right: parseMul() };
    }
    return left;
  }
  function parseMul() {
    let left = parseUnary();
    while (peek()?.type === "op" && ["*", "/", "%"].includes(peek().value)) {
      const op = eat("op").value;
      left = { kind: "binary", op, left, right: parseUnary() };
    }
    return left;
  }
  function parseUnary() {
    if (peek()?.type === "op" && peek().value === "-") {
      pos += 1;
      return { kind: "unary", op: "-", arg: parseUnary() };
    }
    return parsePrimary();
  }
  function parsePrimary() {
    const token = peek();
    if (!token) throw new Error("Fórmula incompleta");
    if (token.type === "number" || token.type === "string") {
      pos += 1;
      return { kind: "literal", value: token.value };
    }
    if (token.type === "field") {
      pos += 1;
      return { kind: "field", name: token.value };
    }
    if (token.type === "op" && token.value === "(") {
      pos += 1;
      const inner = parseExpr();
      eat("op", ")");
      return inner;
    }
    if (token.type === "ident") {
      const name = token.value.toUpperCase();
      pos += 1;
      if (peek()?.type === "op" && peek().value === "(") {
        pos += 1;
        const args = [];
        if (!(peek()?.type === "op" && peek().value === ")")) {
          args.push(parseExpr());
          while (peek()?.type === "sep") {
            pos += 1;
            args.push(parseExpr());
          }
        }
        eat("op", ")");
        if (!FUNCTIONS[name]) throw new Error(`Função desconhecida: ${name}`);
        const [min, max] = FUNCTIONS[name].arity;
        if (args.length < min || args.length > max) {
          throw new Error(`${name} espera entre ${min} e ${max} argumento(s) — recebeu ${args.length}`);
        }
        return { kind: "call", name, args };
      }
      if (["VERDADEIRO", "TRUE"].includes(name)) return { kind: "literal", value: true };
      if (["FALSO", "FALSE"].includes(name)) return { kind: "literal", value: false };
      if (["NULO", "VAZIO"].includes(name)) return { kind: "literal", value: null };
      // Identificador solto = referência de campo sem colchetes.
      return { kind: "field", name: token.value };
    }
    throw new Error(`Token inesperado: ${token.value}`);
  }

  const ast = parseExpr();
  if (pos < tokens.length) throw new Error(`Sobrou conteúdo após a fórmula: "${tokens[pos].value}"`);
  return ast;
}

/* ------------------------------------------------------------ avaliação --- */

function evalNode(node, row) {
  switch (node.kind) {
    case "literal":
      return node.value;
    case "field": {
      if (!(node.name in row)) {
        const key = Object.keys(row).find((k) => k.toLowerCase() === node.name.toLowerCase());
        return key ? row[key] : null;
      }
      return row[node.name];
    }
    case "unary": {
      const v = asNum(evalNode(node.arg, row));
      return v === null ? null : -v;
    }
    case "binary": {
      const l = evalNode(node.left, row);
      const r = evalNode(node.right, row);
      switch (node.op) {
        case "+": {
          if (typeof l === "string" || typeof r === "string") {
            const ln = asNum(l);
            const rn = asNum(r);
            if (ln === null || rn === null) return asText(l) + asText(r);
            return ln + rn;
          }
          return (asNum(l) ?? 0) + (asNum(r) ?? 0);
        }
        case "-":
          return (asNum(l) ?? 0) - (asNum(r) ?? 0);
        case "*":
          return (asNum(l) ?? 0) * (asNum(r) ?? 0);
        case "/": {
          const d = asNum(r);
          return d ? (asNum(l) ?? 0) / d : null;
        }
        case "%": {
          const d = asNum(r);
          return d ? (asNum(l) ?? 0) % d : null;
        }
        case "=":
          return String(l) === String(r);
        case "<>":
          return String(l) !== String(r);
        default: {
          const ln = asNum(l);
          const rn = asNum(r);
          if (ln === null || rn === null) {
            const cmp = String(l).localeCompare(String(r), "pt-BR");
            return node.op === "<" ? cmp < 0 : node.op === ">" ? cmp > 0 : node.op === "<=" ? cmp <= 0 : cmp >= 0;
          }
          return node.op === "<" ? ln < rn : node.op === ">" ? ln > rn : node.op === "<=" ? ln <= rn : ln >= rn;
        }
      }
    }
    case "call": {
      const def = FUNCTIONS[node.name];
      if (node.name === "SE") {
        return asBool(evalNode(node.args[0], row))
          ? evalNode(node.args[1], row)
          : node.args[2] !== undefined
          ? evalNode(node.args[2], row)
          : null;
      }
      const args = node.args.map((a) => evalNode(a, row));
      try {
        const result = def.fn(...args);
        return Number.isNaN(result) ? null : result;
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}

export function collectFields(node, out = new Set()) {
  if (!node) return out;
  if (node.kind === "field") out.add(node.name);
  if (node.args) node.args.forEach((a) => collectFields(a, out));
  if (node.left) collectFields(node.left, out);
  if (node.right) collectFields(node.right, out);
  if (node.arg) collectFields(node.arg, out);
  return out;
}

/**
 * Compila uma fórmula.
 * @param {string} source
 * @param {string[]} [availableFields] para validar referências
 * @returns {{ok:boolean, error?:string, evaluate?:Function, fields?:string[], ast?:Object}}
 */
export function compileFormula(source, availableFields) {
  if (!source || !source.trim()) return { ok: false, error: "Fórmula vazia" };
  try {
    const ast = parse(tokenize(source));
    const fields = Array.from(collectFields(ast));
    if (availableFields?.length) {
      const lower = new Set(availableFields.map((f) => f.toLowerCase()));
      const missing = fields.filter((f) => !lower.has(f.toLowerCase()));
      if (missing.length) {
        return { ok: false, error: `Campo não encontrado: ${missing.join(", ")}` };
      }
    }
    return {
      ok: true,
      ast,
      fields,
      evaluate: (row) => evalNode(ast, row),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Explica a fórmula em linguagem natural (aproximação didática). */
export function explainFormula(source) {
  const result = compileFormula(source);
  if (!result.ok) return result.error;
  const describe = (node) => {
    switch (node.kind) {
      case "literal":
        return typeof node.value === "string" ? `o texto "${node.value}"` : String(node.value);
      case "field":
        return `o campo ${node.name}`;
      case "unary":
        return `o oposto de ${describe(node.arg)}`;
      case "binary": {
        const ops = {
          "+": "somado a",
          "-": "menos",
          "*": "multiplicado por",
          "/": "dividido por",
          "%": "resto da divisão por",
          "=": "igual a",
          "<>": "diferente de",
          "<": "menor que",
          ">": "maior que",
          "<=": "menor ou igual a",
          ">=": "maior ou igual a",
        };
        return `${describe(node.left)} ${ops[node.op]} ${describe(node.right)}`;
      }
      case "call":
        if (node.name === "SE") {
          return `se ${describe(node.args[0])}, então ${describe(node.args[1])}${
            node.args[2] ? `, senão ${describe(node.args[2])}` : ""
          }`;
        }
        return `${node.name}(${node.args.map(describe).join("; ")})`;
      default:
        return "";
    }
  };
  return `Calcula ${describe(result.ast)}.`;
}
