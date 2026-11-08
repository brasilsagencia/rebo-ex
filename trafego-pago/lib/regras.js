/*
 * Regras de tráfego pago — Brasils Agência Digital
 * -------------------------------------------------
 * Motor único de decisão usado por:
 *   - trafego-pago/dashboard.html  (navegador, via <script>)
 *   - trafego-pago/scripts/orcamento.mjs (Node, agente financeiro)
 *
 * Ele lê as métricas de cada conjunto de anúncios (ou anúncio), calcula os
 * indicadores, diagnostica o que está certo/errado e redistribui o orçamento
 * diário: desliga o pior, mantém quem está aprendendo e aumenta a mão no melhor.
 *
 * Nada aqui mexe em conta de anúncio. É só cálculo. A execução real
 * (ligar/desligar/alterar orçamento) é feita pelo agente financeiro, sempre
 * depois da sua confirmação.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.RegrasTrafego = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Configuração padrão — todos os valores podem ser sobrescritos.
  var PADRAO = {
    orcamentoDiarioTotal: 10,      // R$ por dia para TODAS as campanhas juntas
    cpaAlvo: 15,                   // R$ que você aceita pagar por resultado (lead, mensagem, venda)
    roasMinimo: 0,                 // 0 = ignorar ROAS (campanhas de mensagem/lead)
    minimoPorConjunto: 5,          // R$/dia mínimo para um conjunto rodar com sentido
    passoEscala: 0.2,              // aumento máximo por ciclo (20% evita resetar o aprendizado)
    gastoMinimoParaJulgar: null,   // padrão = 1x CPA alvo
    multiplicadorCorteSemResultado: 2, // desliga se gastou 2x o CPA alvo sem nenhum resultado
    multiplicadorCorteCpa: 1.5,    // desliga se CPA > 1,5x o alvo (com dados suficientes)
    multiplicadorEscalaCpa: 0.8,   // escala se CPA <= 0,8x o alvo
    // Referências de mercado (Meta Ads Brasil, negócio local). Ajuste ao seu nicho.
    benchmarks: {
      ctrRuim: 0.8,     // % CTR de link abaixo disso = criativo/copy fraco
      ctrBom: 1.5,
      cpmAlto: 40,      // R$ por mil impressões
      cpcAlto: 2.5,     // R$ por clique no link
      frequenciaFadiga: 3,
      taxaConversaoRuim: 5 // % de cliques que viram resultado (página/WhatsApp)
    }
  };

  function mesclar(cfg) {
    var c = {};
    var k;
    for (k in PADRAO) c[k] = PADRAO[k];
    cfg = cfg || {};
    for (k in cfg) if (cfg[k] !== undefined && cfg[k] !== null && cfg[k] !== '') c[k] = cfg[k];
    c.benchmarks = {};
    for (k in PADRAO.benchmarks) c.benchmarks[k] = PADRAO.benchmarks[k];
    if (cfg.benchmarks) for (k in cfg.benchmarks) c.benchmarks[k] = cfg.benchmarks[k];
    ['orcamentoDiarioTotal', 'cpaAlvo', 'roasMinimo', 'minimoPorConjunto', 'passoEscala'].forEach(function (n) {
      c[n] = Number(c[n]) || 0;
    });
    if (!c.gastoMinimoParaJulgar) c.gastoMinimoParaJulgar = c.cpaAlvo;
    return c;
  }

  function num(v) {
    if (v === undefined || v === null || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v).replace(/R\$|\s|%/g, '');
    // 1.234,56 -> 1234.56 ; 1234.56 -> 1234.56
    if (s.indexOf(',') > -1) s = s.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  function div(a, b) { return b > 0 ? a / b : null; }

  // ---------------------------------------------------------------- métricas
  function calcularMetricas(l) {
    var m = {
      nome: String(l.nome || 'Sem nome'),
      campanha: l.campanha || '',
      status: (l.status || 'ativo').toLowerCase(),
      gasto: num(l.gasto),
      impressoes: num(l.impressoes),
      alcance: num(l.alcance),
      cliques: num(l.cliques),
      resultados: num(l.resultados),
      receita: num(l.receita),
      orcamentoDiario: num(l.orcamentoDiario),
      dias: num(l.dias) || 0
    };
    m.ctr = div(m.cliques, m.impressoes);           if (m.ctr !== null) m.ctr *= 100;
    m.cpc = div(m.gasto, m.cliques);
    m.cpm = div(m.gasto, m.impressoes);             if (m.cpm !== null) m.cpm *= 1000;
    m.cpa = div(m.gasto, m.resultados);
    m.roas = div(m.receita, m.gasto);
    m.frequencia = num(l.frequencia) || div(m.impressoes, m.alcance);
    m.taxaConversao = div(m.resultados, m.cliques); if (m.taxaConversao !== null) m.taxaConversao *= 100;
    return m;
  }

  // ------------------------------------------------------------- diagnóstico
  function diagnosticar(m, c) {
    var b = c.benchmarks;
    var d = [];
    function add(nivel, area, texto, acao) { d.push({ nivel: nivel, area: area, texto: texto, acao: acao }); }

    if (m.impressoes === 0) {
      add('critico', 'Entrega', 'Sem impressões.', 'Verifique se o anúncio foi aprovado, se o público não é pequeno demais e se há saldo/forma de pagamento.');
      return d;
    }
    if (m.ctr !== null) {
      if (m.ctr < b.ctrRuim) add('critico', 'Criativo/Copy', 'CTR de ' + m.ctr.toFixed(2) + '% — as pessoas veem e não clicam.', 'Troque o gancho (3 primeiros segundos / título) e a imagem. Peça novas variações ao agente de criativos e de copy.');
      else if (m.ctr >= b.ctrBom) add('ok', 'Criativo/Copy', 'CTR de ' + m.ctr.toFixed(2) + '% — criativo chamando atenção.', 'Mantenha. Use este ângulo como base para novas variações.');
      else add('atencao', 'Criativo/Copy', 'CTR de ' + m.ctr.toFixed(2) + '% — razoável, dá para melhorar.', 'Teste uma variação de gancho mantendo a mesma oferta.');
    }
    if (m.cpm !== null && m.cpm > b.cpmAlto) add('atencao', 'Público', 'CPM de R$ ' + m.cpm.toFixed(2) + ' — leilão caro.', 'Amplie o público (raio, idade, interesses) ou use público aberto (Advantage+).');
    if (m.cpc !== null && m.cpc > b.cpcAlto) add('atencao', 'Custo', 'CPC de R$ ' + m.cpc.toFixed(2) + ' — clique caro.', 'Normalmente resolvido subindo o CTR (criativo) ou baixando o CPM (público).');
    if (m.frequencia && m.frequencia > b.frequenciaFadiga) add('atencao', 'Fadiga', 'Frequência ' + m.frequencia.toFixed(1) + ' — o mesmo público já viu muitas vezes.', 'Renove o criativo ou amplie o público.');
    if (m.cliques >= 20 && m.taxaConversao !== null && m.taxaConversao < b.taxaConversaoRuim) add('critico', 'Página/Atendimento', 'Só ' + m.taxaConversao.toFixed(1) + '% dos cliques viram resultado.', 'O problema está depois do clique: página lenta, oferta confusa ou demora no WhatsApp. Revise destino e atendimento.');
    if (m.cpa !== null) {
      if (m.cpa <= c.cpaAlvo) add('ok', 'Resultado', 'Custo por resultado R$ ' + m.cpa.toFixed(2) + ' — dentro do alvo (R$ ' + c.cpaAlvo.toFixed(2) + ').', 'Candidato a escalar.');
      else add('critico', 'Resultado', 'Custo por resultado R$ ' + m.cpa.toFixed(2) + ' — acima do alvo (R$ ' + c.cpaAlvo.toFixed(2) + ').', 'Corrigir criativo/público ou desligar.');
    } else if (m.gasto > 0) {
      add('atencao', 'Resultado', 'R$ ' + m.gasto.toFixed(2) + ' gastos sem nenhum resultado ainda.', m.gasto >= c.gastoMinimoParaJulgar ? 'Já gastou o suficiente para julgar — avalie desligar.' : 'Ainda em teste, aguarde.');
    }
    if (c.roasMinimo > 0 && m.roas !== null && m.receita > 0) {
      if (m.roas < c.roasMinimo) add('critico', 'Retorno', 'ROAS ' + m.roas.toFixed(2) + 'x — abaixo do mínimo de ' + c.roasMinimo + 'x.', 'Está pagando para vender. Revise oferta/ticket ou desligue.');
      else add('ok', 'Retorno', 'ROAS ' + m.roas.toFixed(2) + 'x.', 'Retorno saudável.');
    }
    return d;
  }

  // --------------------------------------------------------------- decisão
  // Retorna: 'desligar' | 'escalar' | 'manter' | 'aprendendo'
  function decidir(m, c) {
    if (m.status === 'pausado' || m.status === 'desligado') {
      // Conjuntos pausados só voltam se já provaram resultado.
      if (m.cpa !== null && m.cpa <= c.cpaAlvo * c.multiplicadorEscalaCpa) return { acao: 'escalar', motivo: 'Estava pausado mas tem CPA excelente — vale religar.' };
      return { acao: 'desligar', motivo: 'Já está pausado.' };
    }
    if (m.gasto < c.gastoMinimoParaJulgar && m.resultados < 2) {
      return { acao: 'aprendendo', motivo: 'Gastou R$ ' + m.gasto.toFixed(2) + ' de R$ ' + c.gastoMinimoParaJulgar.toFixed(2) + ' necessários para julgar. Não mexer.' };
    }
    if (m.resultados === 0 && m.gasto >= c.cpaAlvo * c.multiplicadorCorteSemResultado) {
      return { acao: 'desligar', motivo: 'Gastou ' + c.multiplicadorCorteSemResultado + 'x o CPA alvo sem nenhum resultado.' };
    }
    if (m.cpa !== null && m.cpa > c.cpaAlvo * c.multiplicadorCorteCpa) {
      return { acao: 'desligar', motivo: 'CPA de R$ ' + m.cpa.toFixed(2) + ' passou de ' + c.multiplicadorCorteCpa + 'x o alvo.' };
    }
    if (c.roasMinimo > 0 && m.receita > 0 && m.roas !== null && m.roas < c.roasMinimo * 0.7) {
      return { acao: 'desligar', motivo: 'ROAS muito abaixo do mínimo.' };
    }
    var cpaBom = m.cpa !== null && m.cpa <= c.cpaAlvo * c.multiplicadorEscalaCpa;
    var roasBom = c.roasMinimo > 0 && m.roas !== null && m.roas >= c.roasMinimo * 1.2;
    if (cpaBom || roasBom) return { acao: 'escalar', motivo: 'Resultado melhor que o alvo — aumentar a mão.' };
    if (m.resultados === 0) return { acao: 'manter', motivo: 'Sem resultado ainda, mas dentro da margem de teste.' };
    return { acao: 'manter', motivo: 'Dentro do alvo. Manter e observar.' };
  }

  // Nota de 0 a 100 para ranquear (quanto maior, melhor).
  function pontuar(m, c) {
    var p;
    if (m.cpa !== null) p = Math.min(100, (c.cpaAlvo / m.cpa) * 50);
    else if (m.ctr !== null) p = Math.min(25, (m.ctr / c.benchmarks.ctrBom) * 15); // sem resultado: só o CTR conta, e pouco
    else p = 0;
    if (c.roasMinimo > 0 && m.roas !== null) p = (p + Math.min(100, (m.roas / c.roasMinimo) * 50)) / 2;
    return Math.round(p);
  }

  // ------------------------------------------------- distribuição do orçamento
  function arred(v) { return Math.round(v * 100) / 100; }

  function distribuir(itens, c) {
    var B = c.orcamentoDiarioTotal;
    var ativos = itens.filter(function (i) { return i.decisao.acao !== 'desligar'; });
    ativos.sort(function (a, b) { return b.pontuacao - a.pontuacao; });

    // 1) Se não cabe todo mundo no mínimo, corta os piores.
    while (ativos.length > 0 && ativos.length * c.minimoPorConjunto > B) {
      var cortado = ativos.pop();
      cortado.decisao = { acao: 'desligar', motivo: 'Orçamento de R$ ' + B.toFixed(2) + '/dia não comporta este conjunto (mínimo R$ ' + c.minimoPorConjunto.toFixed(2) + ' cada). Foi o de pior nota.' };
    }
    itens.forEach(function (i) { i.orcamentoNovo = 0; });
    if (!ativos.length) return { alocado: 0, reserva: B };

    // 2) Peso por decisão.
    var peso = function (i) {
      var base = Math.max(i.pontuacao, 10);
      if (i.decisao.acao === 'escalar') return base * 1.5;
      if (i.decisao.acao === 'aprendendo') return 30; // neutro: nem premia nem pune
      return base;
    };
    // Teto por ciclo: não subir mais que passoEscala (exceto conjunto novo/sem orçamento).
    var teto = function (i) {
      if (!i.orcamentoDiario) return Infinity;
      if (i.decisao.acao === 'aprendendo') return Math.max(i.orcamentoDiario, c.minimoPorConjunto);
      return Math.max(i.orcamentoDiario * (1 + c.passoEscala), c.minimoPorConjunto);
    };

    ativos.forEach(function (i) { i.orcamentoNovo = c.minimoPorConjunto; });
    var sobra = B - ativos.length * c.minimoPorConjunto;
    for (var volta = 0; volta < 8 && sobra > 0.009; volta++) {
      var livres = ativos.filter(function (i) { return i.orcamentoNovo < teto(i) - 0.009; });
      if (!livres.length) break;
      var somaPesos = livres.reduce(function (s, i) { return s + peso(i); }, 0);
      var distribuido = 0;
      livres.forEach(function (i) {
        var parte = sobra * peso(i) / somaPesos;
        var novo = Math.min(i.orcamentoNovo + parte, teto(i));
        distribuido += novo - i.orcamentoNovo;
        i.orcamentoNovo = novo;
      });
      sobra -= distribuido;
    }
    var alocado = 0;
    ativos.forEach(function (i) { i.orcamentoNovo = arred(i.orcamentoNovo); alocado += i.orcamentoNovo; });
    alocado = arred(alocado);
    return { alocado: alocado, reserva: arred(Math.max(0, B - alocado)) };
  }

  // -------------------------------------------------------------- principal
  function analisar(linhas, configuracao) {
    var c = mesclar(configuracao);
    var itens = (linhas || []).map(function (l) {
      var m = calcularMetricas(l);
      m.diagnostico = diagnosticar(m, c);
      m.decisao = decidir(m, c);
      m.pontuacao = pontuar(m, c);
      return m;
    });
    var dist = distribuir(itens, c);
    itens.forEach(function (i) {
      i.variacao = i.orcamentoDiario ? (i.orcamentoNovo - i.orcamentoDiario) / i.orcamentoDiario : null;
      if (i.decisao.acao === 'escalar' && i.orcamentoDiario && i.orcamentoNovo <= i.orcamentoDiario) {
        i.decisao.motivo += ' Escala travada: o orçamento total já está todo usado. Aumente a verba diária ou desligue um teste para liberar.';
      }
    });

    var t = itens.reduce(function (s, i) {
      s.gasto += i.gasto; s.impressoes += i.impressoes; s.cliques += i.cliques;
      s.resultados += i.resultados; s.receita += i.receita; s.alcance += i.alcance;
      return s;
    }, { gasto: 0, impressoes: 0, cliques: 0, resultados: 0, receita: 0, alcance: 0 });
    t.ctr = t.impressoes ? t.cliques / t.impressoes * 100 : null;
    t.cpc = div(t.gasto, t.cliques);
    t.cpm = t.impressoes ? t.gasto / t.impressoes * 1000 : null;
    t.cpa = div(t.gasto, t.resultados);
    t.roas = div(t.receita, t.gasto);

    var melhor = itens.filter(function (i) { return i.cpa !== null; }).sort(function (a, b) { return a.cpa - b.cpa; })[0] || null;

    var alertas = [];
    if (dist.reserva > 0.5) alertas.push('Sobraram R$ ' + dist.reserva.toFixed(2) + '/dia sem destino (limite de +' + Math.round(c.passoEscala * 100) + '% por ciclo). Sugestão: abrir um novo conjunto de teste com o melhor criativo.');
    if (itens.length && itens.every(function (i) { return i.decisao.acao === 'desligar'; })) alertas.push('Todos os conjuntos foram reprovados. Não aumente verba: volte para copy, criativo e oferta antes de investir de novo.');
    if (c.orcamentoDiarioTotal < c.minimoPorConjunto * 2) alertas.push('Com R$ ' + c.orcamentoDiarioTotal.toFixed(2) + '/dia só cabe 1 conjunto rodando. Teste criativos dentro do mesmo conjunto (2 a 3 anúncios).');

    return { config: c, itens: itens, totais: t, distribuicao: dist, melhor: melhor, alertas: alertas };
  }

  // ---------------------------------------------------------- leitura de CSV
  // Aceita exportação do Gerenciador de Anúncios da Meta (PT-BR ou EN) ou o
  // modelo simples de trafego-pago/dados/exemplo-metricas.csv.
  var MAPA = {
    nome: ['nome', 'nome do conjunto de anúncios', 'nome do anúncio', 'nome da campanha', 'ad set name', 'ad name', 'campaign name'],
    campanha: ['campanha', 'nome da campanha', 'campaign name'],
    status: ['status', 'veiculação', 'veiculação do conjunto de anúncios', 'delivery', 'ad set delivery'],
    gasto: ['gasto', 'valor usado (brl)', 'valor usado', 'amount spent (brl)', 'amount spent'],
    impressoes: ['impressoes', 'impressões', 'impressions'],
    alcance: ['alcance', 'reach'],
    cliques: ['cliques', 'cliques no link', 'link clicks'],
    resultados: ['resultados', 'results', 'conversas por mensagem iniciadas', 'leads', 'compras', 'purchases'],
    receita: ['receita', 'valor de conversão de compras', 'purchases conversion value', 'valor de conversão'],
    orcamentoDiario: ['orcamentodiario', 'orçamento', 'orçamento do conjunto de anúncios', 'ad set budget', 'budget'],
    frequencia: ['frequencia', 'frequência', 'frequency'],
    dias: ['dias', 'days']
  };

  function separarLinhaCsv(linha, sep) {
    var out = [], atual = '', aspas = false;
    for (var i = 0; i < linha.length; i++) {
      var ch = linha[i];
      if (ch === '"') { if (aspas && linha[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas; }
      else if (ch === sep && !aspas) { out.push(atual); atual = ''; }
      else atual += ch;
    }
    out.push(atual);
    return out.map(function (s) { return s.trim(); });
  }

  function lerCsv(texto) {
    var linhas = String(texto).replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!linhas.length) return [];
    var cab = linhas[0];
    var sep = (cab.split(';').length > cab.split(',').length) ? ';' : (cab.indexOf('\t') > -1 ? '\t' : ',');
    var titulos = separarLinhaCsv(cab, sep).map(function (t) { return t.toLowerCase().replace(/"/g, ''); });
    var idx = {};
    Object.keys(MAPA).forEach(function (campo) {
      for (var j = 0; j < MAPA[campo].length; j++) {
        var pos = titulos.indexOf(MAPA[campo][j]);
        if (pos > -1) { idx[campo] = pos; break; }
      }
    });
    return linhas.slice(1).map(function (l) {
      var cols = separarLinhaCsv(l, sep), o = {};
      Object.keys(idx).forEach(function (campo) { o[campo] = cols[idx[campo]]; });
      if (o.status) {
        var s = o.status.toLowerCase();
        o.status = /inativ|pausad|paused|inactive|desativ|off/.test(s) ? 'pausado' : 'ativo';
      }
      return o;
    }).filter(function (o) { return o.nome && !/^total/i.test(o.nome); });
  }

  return { PADRAO: PADRAO, analisar: analisar, lerCsv: lerCsv, calcularMetricas: calcularMetricas };
});
