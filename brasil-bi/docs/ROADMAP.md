# O que funciona hoje e o que é roadmap

Mapa honesto entre o que foi pedido no escopo e o que está entregue. Três
estados: ✅ **funcional**, 🟡 **parcial** (funciona com limite declarado),
📋 **roadmap** (projetado, depende de back-end).

---

## Importação de dados

| Item | Estado | Observação |
| --- | :-: | --- |
| CSV / TSV | ✅ | Delimitador detectado e ajustável, aspas, quebras internas, BOM |
| TXT | ✅ | Delimitado ou largura fixa (detecção por alinhamento) |
| JSON | ✅ | Inclui NDJSON; acha a lista de registros e achata objetos aninhados |
| XML | ✅ | Descobre o nó-registro repetido; atributos viram colunas |
| XLSX / XLSM | ✅ | Escolha de aba e linha de cabeçalho; datas pelo formato da célula |
| XLS (97-2003) | 📋 | Formato binário BIFF; hoje a aplicação orienta a converter |
| PDF com texto | ✅ | Texto posicionado, tabelas por página, ToUnicode, confiança por página |
| PDF digitalizado | 🟡 | **Detectado e sinalizado** — OCR exige serviço externo (Tesseract no back-end) |
| Arrastar e soltar | ✅ | Múltiplos arquivos |
| Prévia antes de importar | ✅ | Colunas, tipos editáveis, vazios, duplicidades, amostra |
| Detecção de tipo/data/moeda/percentual | ✅ | Formatos pt-BR e en-US |
| Google Sheets | 📋 | Exige OAuth no servidor; hoje: exporte CSV da planilha |
| Bancos de dados / APIs | 📋 | Exigem credenciais em servidor |

## Tratamento de dados

| Item | Estado |
| --- | :-: |
| Renomear, remover, reordenar colunas | ✅ |
| Alterar tipo com contagem de falhas | ✅ |
| Aparar espaços, padronizar caixa | ✅ |
| Substituir valores (exato ou trecho) | ✅ |
| Preencher vazios (valor, zero, média, mediana, anterior) | ✅ |
| Remover duplicidades (total ou por chave) | ✅ |
| Filtrar linhas (12 operadores) | ✅ |
| Dividir coluna | ✅ |
| Coluna calculada com fórmulas em português | ✅ |
| Coluna condicional por regras | ✅ |
| Agrupar e resumir | ✅ |
| Anexar e mesclar tabelas | ✅ |
| Linha do tempo de etapas: editar, reordenar, desativar, excluir | ✅ |
| Desfazer / refazer | ✅ |
| Prévia em tempo real | ✅ |

## Modelagem

| Item | Estado |
| --- | :-: |
| Diagrama visual arrastável | ✅ |
| Relacionamentos 1:1, 1:N, N:N | ✅ |
| Sugestão automática por nome, tipo e sobreposição de valores | ✅ |
| Validação: relacionamento quebrado, coluna inexistente, caminho ambíguo | ✅ |
| Tabela calendário com hierarquia de datas | ✅ |
| Propagação automática de filtro entre tabelas relacionadas | 📋 Hoje o cruzamento é explícito, via "Mesclar tabela" |

## Visualização

| Item | Estado | Observação |
| --- | :-: | --- |
| 27 tipos de gráfico | ✅ | Lista em `DESIGN-SYSTEM.md` |
| Cross-filter entre todos os componentes | ✅ | Clique filtra o painel inteiro |
| Drill-down por hierarquia de data | ✅ | Granularidade dia→semana→mês→trimestre→ano |
| Drill-through entre páginas | 📋 | Requer múltiplas páginas por dashboard |
| Árvore de decomposição | 📋 | |
| Gantt | 📋 | |
| Boxplot | 📋 | O histograma cobre a análise de distribuição |
| Mapa geográfico com contornos reais | 🟡 | Implementado como **mapa esquemático por UF** (tile grid), sem dependência de GeoJSON |
| Tooltips, zoom por seleção, tela cheia | ✅ | |
| Exportar gráfico em PNG | ✅ | Vetorial → PNG em 2,5× |
| Legenda com ocultar série | ✅ | |

## Dashboard e editor

| Item | Estado |
| --- | :-: |
| Grade responsiva de 12 colunas | ✅ |
| Arrastar para reordenar, redimensionar | ✅ |
| Duplicar, bloquear, excluir, tela cheia | ✅ |
| Editor no-code com prévia ao vivo | ✅ |
| Escolha de fonte, dimensão, medidas, agregação, limite, ordenação | ✅ |
| Metas, direção desejada, legenda, rótulos | ✅ |
| 14 modelos prontos por segmento | ✅ |
| Dashboard automático na primeira importação | ✅ |
| Múltiplas páginas por dashboard | 📋 |
| Formatação condicional por regra visual | 🟡 Barras de dados na matriz; regras por célula são roadmap |

## Filtros

| Item | Estado |
| --- | :-: |
| Período (11 presets + personalizado) | ✅ |
| Listas com busca e seleção múltipla | ✅ |
| Intervalos numéricos | ✅ |
| Filtros globais persistentes | ✅ |
| Cross-filter efêmero | ✅ |
| Conjuntos de filtros favoritos | ✅ |
| Indicador de filtros ativos + limpar | ✅ |
| Filtro por página / por gráfico | 📋 Hoje: global + cross-filter |

## Análises

| Item | Estado | Observação |
| --- | :-: | --- |
| Perguntas em linguagem natural (pt-BR) | ✅ | Por palavras-chave; responde, ranqueia e sugere gráfico |
| Tendência com regressão linear e R² | ✅ | |
| Detecção de anomalias (2σ) e quedas | ✅ | |
| Concentração / Pareto | ✅ | |
| Correlação entre medidas | ✅ | Rotulada como correlação, não causa |
| Projeção do próximo período | ✅ | Sempre rotulada como estimativa |
| Resumo executivo e recomendações | ✅ | |
| Geração de gráfico a partir da pergunta | ✅ | Com botão "adicionar ao dashboard" |
| LLM externo | 📋 | Exigiria enviar dados para fora — decisão consciente de não fazer |

## Relatórios e exportação

| Item | Estado |
| --- | :-: |
| PDF com cabeçalho, rodapé, logo, data, responsável, observações | ✅ |
| Orientação, margens, A4 | ✅ |
| Filtros aplicados impressos no documento | ✅ |
| Resumo executivo no PDF | ✅ |
| CSV, XLSX, JSON | ✅ |
| PNG de gráfico em alta resolução | ✅ |
| Link compartilhável | 🟡 Carrega a configuração do painel, não os dados |
| Envio agendado por e-mail | 📋 |

## Colaboração, alertas e segurança

| Item | Estado | Observação |
| --- | :-: | --- |
| Perfis e matriz de permissões | 🟡 | Documentados e selecionáveis; aplicação real exige servidor |
| Login, 2FA, recuperação de senha | 📋 | Especificado em `SEGURANCA.md` |
| Link com senha e expiração | 🟡 | Registrados, mas sem enforcement sem back-end — a interface diz isso |
| Comentários e marcações | 📋 | |
| Histórico de atividades | ✅ | Trilha local |
| Alertas por regra | 🟡 | Avaliação e notificação interna funcionam; e-mail/WhatsApp/webhook exigem servidor |
| Atualização agendada | 📋 | |
| Backup / restauração da configuração | ✅ | Exportação JSON |
| Exclusão definitiva (LGPD) | ✅ | |

## Desempenho e qualidade

| Item | Estado |
| --- | :-: |
| Skeleton loading e estados vazios | ✅ |
| Barra de progresso na importação | ✅ |
| Memoização do pipeline | ✅ |
| Paginação e limites nas tabelas | ✅ |
| Virtualização de tabelas muito grandes | 📋 |
| Processamento em Web Worker | 📋 Hoje: lotes com `chunked()` |
| Responsividade (desktop → celular) | ✅ |
| Acessibilidade (teclado, contraste, resumo textual) | ✅ |
| Testes automatizados (unidade, formatos, e2e) | ✅ |

---

## Ordem sugerida para a próxima fase

1. **Back-end mínimo** — NestJS + Postgres + S3: autenticação, organizações,
   upload e persistência de datasets. Destrava multiusuário e permissões reais.
2. **Serviço de ETL em Python** — Pandas/Polars/DuckDB para arquivos grandes,
   Camelot/pdfplumber + Tesseract para PDF e OCR.
3. **Conectores** — Google Sheets, Postgres/MySQL, APIs REST, com credenciais
   guardadas em cofre e sincronização agendada.
4. **Consulta server-side** — o mesmo `QuerySpec` traduzido para SQL do DuckDB
   sobre Parquet; a interface não muda.
5. **Colaboração** — comentários, links públicos reais, envio agendado.
6. **Extras de visualização** — múltiplas páginas, drill-through, mapa com
   contornos, árvore de decomposição, Gantt.
