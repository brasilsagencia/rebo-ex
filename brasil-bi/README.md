# Brasil BI

Plataforma de Business Intelligence com identidade brasileira. Importa PDF,
XLSX, CSV, TXT, JSON e XML, trata os dados, monta dashboards interativos,
analisa automaticamente e exporta — **tudo no navegador**, sem servidor e sem
nenhuma dependência externa.

```bash
npx http-server -p 8099 -s .        # na raiz do repositório
# abra http://localhost:8099/brasil-bi/
```

---

## O que ela faz

**Importa de verdade.** Arraste um arquivo: o sistema identifica o formato,
descobre o delimitador, acha a linha de cabeçalho, reconhece datas `dd/mm/aaaa`,
valores `R$ 1.234,56` e percentuais, aponta colunas vazias e duplicadas — e só
grava depois que você confirma na prévia. XLSX é lido descompactando o pacote
OOXML na mão; PDF é interpretado operador a operador, com **confiança calculada
por página** e aviso quando a página é digitalizada e precisaria de OCR.

**Trata como um Power Query enxuto.** Dezoito tipos de etapa (renomear, tipar,
preencher vazios, substituir, dividir, filtrar, agrupar, mesclar, coluna
calculada com fórmulas em português…), todas reversíveis, reordenáveis e
desativáveis, com prévia ao vivo e desfazer/refazer. Os dados originais nunca
são alterados.

**Visualiza com 27 tipos de gráfico** em SVG nativo — colunas, linhas, área,
combinado, pizza, rosca, funil com gargalo, cascata, treemap, heatmap, radar,
dispersão, bolhas, sankey, matriz, calendário, nuvem de palavras e um mapa
esquemático dos 26 estados + DF. Clicar em qualquer elemento filtra o painel
inteiro.

**Analisa e explica.** Tendência com regressão, anomalias, quedas, concentração,
correlação e projeção — cada conclusão rotulada como **fato**, **correlação**,
**projeção** ou **alerta de qualidade**. Perguntas em português são
interpretadas localmente e podem virar gráficos com um clique.

**Entrega.** PDF com cabeçalho, logo, filtros aplicados e resumo executivo;
CSV, XLSX, JSON e PNG em alta resolução.

---

## Princípios que guiaram o código

1. **Nada entra sem revisão.** Toda importação passa por prévia e confirmação.
2. **Origem imutável.** O tratamento é um pipeline reaplicado, não uma edição.
3. **Honestidade sobre incerteza.** Leitura duvidosa de PDF é sinalizada;
   projeção nunca é apresentada como certeza; recurso que depende de servidor
   diz isso na própria tela.
4. **Dado fictício nunca se mistura ao real.** A demonstração é um dataset
   separado, sempre etiquetado, removível com um clique.
5. **Zero dependência.** Sem CDN de biblioteca, sem bundler, sem `eval`.

---

## Documentação

| Documento | Conteúdo |
| --- | --- |
| [ARQUITETURA.md](docs/ARQUITETURA.md) | Camadas, mapa de telas, fluxo do usuário, módulos, back-end projetado |
| [MODELO-DE-DADOS.md](docs/MODELO-DE-DADOS.md) | Entidades, inferência de tipos, esquema SQL, regras de negócio |
| [DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) | Paleta, tipografia, componentes, catálogo de gráficos, acessibilidade |
| [SEGURANCA.md](docs/SEGURANCA.md) | Modelo de ameaça, LGPD, perfis, requisitos do back-end |
| [INSTALACAO.md](docs/INSTALACAO.md) | Rodar, publicar, testar, solucionar problemas |
| [ROADMAP.md](docs/ROADMAP.md) | O que funciona hoje × o que depende de servidor |

## Testes

```bash
node brasil-bi/tests/unit.mjs      # parsing pt-BR, tipos, fórmulas, pipeline
node brasil-bi/tests/formats.mjs   # leitor de PDF (PDF sintético)
node brasil-bi/tests/e2e.mjs       # navegador: importa CSV, valida totais, cross-filter
node brasil-bi/tests/interactions.mjs  # navegador: editor, filtros, tratamento, IA
```
