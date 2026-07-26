# Design system — Brasil BI

Identidade brasileira aplicada com equilíbrio: as cores da bandeira aparecem em
acentos, gradientes e séries de gráfico — nunca como blocos chapados que fariam
a interface parecer uma bandeira.

---

## 1. Cores

### Paleta de marca (invariante)

| Token | Hex | Uso |
| --- | --- | --- |
| `--br-verde-neon` | `#00FF66` | Acento principal (escuro), logo, gradientes |
| `--br-verde-profundo` | `#003D2D` | Texto sobre acento claro |
| `--br-amarelo` | `#FFD700` | Atenção, meta, terceira série |
| `--br-azul` | `#0066FF` | Ação secundária, segunda série |
| `--br-azul-profundo` | `#071A3D` | Superfícies no tema escuro |
| `--br-branco` | `#FFFFFF` | Superfícies no tema claro |
| `--br-cinza-claro` | `#F4F7FA` | Fundo no tema claro |
| `--br-cinza-escuro` | `#1A1D24` | Texto no tema claro |
| `--br-preto-azulado` | `#060B14` | Fundo no tema escuro |

### Tokens semânticos (mudam com o tema)

| Token | Escuro | Claro |
| --- | --- | --- |
| `--bg-app` | `#060B14` + gradientes radiais | `#F4F7FA` + gradientes radiais |
| `--surface` | `rgba(7,26,61,.62)` (vidro) | `rgba(255,255,255,.86)` |
| `--surface-solid` | `#0A1730` | `#FFFFFF` |
| `--text` / `--text-2` / `--text-3` | `#EAF1FB` / `#9FB2CD` / `#6B7F9C` | `#101828` / `#4A5A72` / `#6D7D93` |
| `--accent` (preenchimentos) | `#00FF66` | `#00B64A` |
| `--accent-text` (texto) | `#35FF87` | `#00733A` |
| `--info` | `#0066FF` | `#0066FF` |
| `--warn` | `#FFD700` | `#B58900` |
| `--danger` | `#FF5470` | `#D92B4B` |

**Regra de contraste.** Verde neon puro sobre branco tem contraste ~1.4:1 —
ilegível. Por isso existem dois tokens: `--accent` para áreas preenchidas e
`--accent-text` para texto, este último calibrado para ≥4.5:1 em cada tema.
Nenhum texto de interface usa `--accent` diretamente.

### Séries de gráfico

Dez cores com **luminâncias distintas**, para continuarem distinguíveis em
escala de cinza e nos tipos comuns de daltonismo:

```
--s1 verde    --s2 azul     --s3 amarelo  --s4 rosa    --s5 ciano
--s6 laranja  --s7 roxo     --s8 verde-claro  --s9 vermelho  --s10 cinza
```

Escalas contínuas: `sequentialColor(t, "verde"|"azul"|"amarelo")` para heatmaps
e mapas; `divergingColor(t)` para variações positivas/negativas.

**Cor nunca é o único sinal.** Status sempre combinam cor + ícone + rótulo
("↑ Acima da meta", "⚠ Situação crítica"). Cada gráfico publica ainda um resumo
textual com os valores.

---

## 2. Tipografia

- **Inter** (400/500/600/700) para interface; **JetBrains Mono** para fórmulas
  e códigos. Ambas com fallback para `system-ui` — a aplicação continua legível
  offline ou sem acesso ao Google Fonts.
- Escala: 11 · 12 · 13 · 14 · 16 · 18 · 22 · 28 · 36 px.
- Números sempre com `font-variant-numeric: tabular-nums` para alinhar colunas.
- Formatação pt-BR em tudo: `R$ 1.234,56`, `31/12/2025`, `12,5%`, `1,23 mi`.

---

## 3. Espaçamento, raio e elevação

- Escala de 4 px: `--sp-1` (4) a `--sp-12` (48).
- Raios: `6 / 10 / 16 / 22 / 999` px — cartões usam 16, botões e campos 10.
- Sombras em três níveis + dois "glows" de acento (verde e azul), usados só em
  botões primários e estados de foco/arraste.
- Glassmorphism moderado: `backdrop-filter: saturate(150%) blur(14px)` apenas em
  sidebar, cabeçalho e cartões — nunca em texto pequeno.

---

## 4. Componentes

| Componente | Classe | Variações |
| --- | --- | --- |
| Botão | `.btn` | `--primary`, `--info`, `--ghost`, `--danger`, `--sm`, `--lg`, `--icon`, `--block` |
| Cartão | `.card` | `--pad`, `--flat`, com `__head`/`__body` |
| Campo | `.input`, `.select`, `.field` | `--invalid`, com `<label>` e mensagem de erro |
| Chip | `.chip` | `--active`, removível |
| Selo | `.badge` | `--ok`, `--info`, `--warn`, `--danger`, `--neutral`, `--demo` |
| Abas | `.tabs` / `.tab` | `aria-selected` |
| Tabela | `table.data` | cabeçalho fixo, coluna numérica, célula vazia destacada |
| Dropzone | `.dropzone` | `.is-dragging` |
| Progresso | `.progress` | barra controlável |
| Skeleton | `.skeleton` | shimmer |
| Estado vazio | `.empty` | ícone + texto + ação |
| Modal | `.modal` | `--wide`, foco preso, Esc fecha |
| Popover | `.popover` / `.menu-item` | fecha por clique fora ou Esc |
| Toast | `.toast` | `--success`, `--error`, `--warn`, `--info`, com ação |
| Tooltip | `[data-tip]` | posição `right` opcional |
| Tile | `.tile` | arrastável, redimensionável, `data-locked`, `data-h` |
| Linha do tempo | `.tl` | etapas com ativar/desativar/reordenar |
| Cartão de KPI | `.kpi` | valor, delta, meta, status, sparkline |

Microinterações: transições de 120 ms (feedback) e 220 ms (layout), entrada dos
tiles com `fade-up`, hover com elevação sutil. Tudo desligado sob
`prefers-reduced-motion`.

---

## 5. Layout

- **Grade de 12 colunas** para o dashboard (`--col` por tile, 2–12) e alturas em
  unidades de 92 px (`data-h` 1–5).
- Sidebar 254 px → 66 px quando recolhida (só ícones + tooltip).
- Cabeçalho fixo de 62 px com título editável, período, busca, ações e perfil.
- Pontos de quebra: 1180 px (painel lateral vira bloco), 980 px (tiles limitam
  a largura), 760 px (menu vira gaveta, grade vira coluna única, rótulos dos
  botões somem e ficam só os ícones).

---

## 6. Catálogo de visualizações (27 tipos)

| Grupo | Tipos |
| --- | --- |
| Indicadores | KPI, velocímetro |
| Comparação | colunas, barras, colunas empilhadas, barras empilhadas, 100% empilhado |
| Evolução | linhas, área, área empilhada, combinado (coluna + linha), calendário de atividades |
| Composição | pizza, rosca, treemap, funil, cascata, sankey |
| Distribuição | dispersão, bolhas, histograma, radar, mapa de calor |
| Geográfico | mapa esquemático por UF (tile grid dos 26 estados + DF) |
| Detalhe | tabela de registros, matriz, nuvem de palavras |

Cada tipo declara seus requisitos (`requires`): precisa de dimensão? quantas
medidas aceita? exige "dividir por"? O editor usa isso para habilitar campos e
completar automaticamente ao trocar de tipo.

**Comportamentos padrão pensados para leitura:**

- pizza/rosca agrupam o excedente em "Outros" e mostram percentual + total no
  centro;
- rótulos do eixo X giram automaticamente quando não cabem;
- séries podem ser ocultadas clicando na legenda;
- todo elemento é clicável (cross-filter), focável e tem tooltip;
- valores nos elementos só aparecem quando há espaço (≤40 marcas).

---

## 7. Acessibilidade

- Contraste AA para texto em ambos os temas.
- Foco visível de 2 px com deslocamento, consistente em toda a aplicação.
- Navegação completa por teclado, incluindo os elementos dos gráficos.
- `skip link` para o conteúdo, `aria-label` em ícones, `aria-live` nos toasts.
- Resumo textual por gráfico (`.viz__summary`) como alternativa ao visual.
- Alvos de toque ≥28 px; no celular, ≥34 px nos botões principais.

---

## 8. Temas

Três modos: **escuro**, **claro** e **automático** (segue o sistema). A
preferência fica salva por usuário; o botão no cabeçalho alterna entre os três e
o atalho `t` faz o mesmo. As cores dos gráficos são resolvidas do CSS no momento
da renderização, então **trocar o tema recolore todos os gráficos** sem recarregar.
