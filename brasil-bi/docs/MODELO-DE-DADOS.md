# Modelo de dados — Brasil BI

Duas visões: **(A)** o modelo em execução hoje, no navegador; **(B)** o esquema
relacional equivalente para quando o back-end entrar.

---

## A. Modelo em execução (cliente)

### Onde cada coisa mora

| Conteúdo | Armazenamento | Chave |
| --- | --- | --- |
| Configuração completa (usuário, preferências, datasets *sem linhas*, dashboards, filtros, alertas, trilha) | `localStorage` | `brasilbi:state` |
| Linhas de cada fonte | `IndexedDB` → store `rows` | `datasetId` |

Separar os dois é intencional: o `localStorage` tem cota pequena (≈5 MB) e é
síncrono; as linhas podem ter dezenas de MB e vão para o IndexedDB, assíncrono.

---

### Entidades

#### `AppState`

```js
{
  version: 1,
  user: { name, email, role },              // role ∈ perfis (ver SEGURANCA.md)
  prefs: { theme, sidebar, compactNumbers, confirmDestructive, demoBannerDismissed },
  onboarding: { done, step },
  datasets:      Dataset[],
  relationships: Relationship[],
  dashboards:    Dashboard[],
  activeDashboardId: string | null,
  filters: { global: Filter[], selection: Filter[], saved: FilterSet[] },
  period:  { preset, from, to, field, datasetId },
  alerts:  Alert[],
  notifications: Notification[],
  activity: ActivityEntry[],
  shares:  Share[],
  lastRefresh: ISOString | null
}
```

#### `Dataset` — metadados de uma tabela

```js
{
  id: "ds_…",
  name: "Vendas 2025",
  fields: Field[],
  rowCount: 1732,
  source: { kind: "arquivo"|"demonstração"|"gerado",
            format: "xlsx"|"csv"|"pdf"|…, fileName, size, sheet },
  quality: QualityReport | null,
  transforms: Step[],          // pipeline reaplicado sobre as linhas originais
  isDemo: false,
  importedAt, updatedAt,
  notes,
  uiPos: { x, y }              // posição no diagrama de modelagem
}
```

#### `Field` — coluna

```js
{
  name: "Faturamento",         // chave real na linha
  label: "Faturamento",        // rótulo exibido
  type: "currency",            // text|integer|number|currency|percent|date|datetime|boolean
  role: "measure",             // dimension|measure|time|id
  confidence: 0.98,            // certeza da inferência (0–1)
  distinct: 1420,
  blanks: 0,
  visible: true,
  computed?: true, expr?: "…"  // quando vem de coluna calculada
}
```

**Regras de inferência** (`data/types.js`), aplicadas em ordem:

1. **Booleano** — ≥98% dos valores reconhecíveis (`sim/não`, `true/false`, `1/0`) e ≤3 distintos.
2. **Data** — ≥90% conversíveis, priorizando `dd/mm/aaaa`; vira `datetime` se ≥40% tiverem hora. O nome ajuda a desempatar contra número (`Ano`, `Competência`…).
3. **Numérico** — ≥90% conversíveis. Depois refina:
   - nome ou valores com `R$`/`BRL` → **moeda**;
   - nome ou valores com `%` → **percentual**;
   - todos inteiros + nome tipo `id/código/cpf/sku` + alta cardinalidade → **identificador** (papel `id`, nunca medida);
   - senão **inteiro** ou **número**.
4. **Texto** — o resto. Cardinalidade = total ⇒ papel `id`.

Parsing tolerante: `"R$ 1.234,56"`, `"1,234.56"`, `"(500)"` (negativo contábil),
`"12,5%"` e seriais do Excel são todos convertidos corretamente.

#### `Step` — etapa de tratamento

```js
{ id, type, enabled: true, ...config }
```

| `type` | Configuração |
| --- | --- |
| `renameColumn` | `{from, to}` |
| `dropColumns` | `{fields: []}` |
| `setType` | `{field, type}` |
| `trim` | `{field?}` (sem campo = todas as colunas de texto) |
| `textCase` | `{field, mode: upper\|lower\|title}` |
| `replaceValues` | `{field, from, to, mode: exact\|contains}` |
| `fillBlanks` | `{field, strategy: value\|zero\|mean\|median\|previous, value?}` |
| `filterRows` | `{field, op, value}` |
| `removeDuplicates` | `{fields: []}` |
| `splitColumn` | `{field, separator, into: [], removeOriginal}` |
| `computedColumn` | `{name, expr, forceType?}` |
| `conditionalColumn` | `{name, rules: [{when, then}], otherwise}` |
| `sortRows` | `{field, dir}` |
| `keepTop` | `{n}` |
| `groupRows` | `{dimensions: [], aggs: [{field, agg, alias}]}` |
| `appendDataset` | `{datasetId, datasetName}` |
| `mergeDataset` | `{datasetId, leftKey, rightKey, fields, prefix}` |

Operadores de filtro: `eq, neq, gt, gte, lt, lte, contains, notContains,
startsWith, isBlank, notBlank, in, between, dateRange`.

Agregações: `sum, avg, median, min, max, count, countDistinct, first, last`.

#### `Dashboard` e `Tile`

```js
Dashboard {
  id, name, description, template, datasetId,
  tiles: Tile[], createdAt, updatedAt, isDemo
}

Tile {
  id, type,                      // 27 tipos (ver DESIGN-SYSTEM.md)
  datasetId,
  title, subtitle,
  dimension,                     // campo do eixo/categoria
  grain,                         // day|week|month|quarter|year (dimensão de data)
  breakdown,                     // campo que divide em séries
  measures: [{field, agg, label}],
  limit, sort: {by, dir},
  options: { showLegend, showValues, groupOthers, goal, higherIsBetter,
             colors[], centerLabel, rowLimit, lineSeries[], smooth, … },
  layout: { col: 1..12, h: 1..5 },
  locked
}
```

#### `Relationship`, `Filter`, `Alert`, `Share`

```js
Relationship { id, fromDataset, fromField, toDataset, toField,
               cardinality: "1-1"|"1-n"|"n-n", active }

Filter { id, field, op, value, datasetId, label, sourceTile? }

Alert  { id, name, datasetId, field, agg, op: lt|lte|gt|gte, value,
         channels: ["interna","email","whatsapp","webhook"], enabled }

Share  { id, name, permission, password, expiresAt, url, createdAt }
```

---

### `QuerySpec` — contrato do motor de consulta

```js
runQuery({rows, fields, datasetId}, {
  dimension?, grain?, breakdown?,
  measures: [{field, agg, label?}],
  limit?, sort?: {by: "m0"|"dimension", dir},
  groupOthers?, tileId?, crossFilterSelf?, ignoreContext?
})
```

Retorno agregado:

```js
{
  kind: "grouped",
  dimension: {name, label, type, grain},
  breakdown: {name, label} | null,
  categories: [{key, label, sort, raw, rows, values: [...]}],
  series:     [{key, name, measure, type, values: [...]}],
  measures, rowCount, rows, totalCategories, hasOthers
}
```

Esse mesmo objeto vira SQL no back-end sem mudar a assinatura.

---

## B. Esquema relacional (back-end previsto)

```sql
-- Identidade e organização -------------------------------------------------
CREATE TABLE organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email         citext NOT NULL,
  name          text NOT NULL,
  password_hash text,                         -- argon2id
  totp_secret   text,                         -- 2FA
  role          text NOT NULL DEFAULT 'visualizador',
  status        text NOT NULL DEFAULT 'ativo',
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, email)
);

CREATE TABLE teams (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name    text NOT NULL
);
CREATE TABLE team_members (
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, user_id)
);

-- Ingestão -----------------------------------------------------------------
CREATE TABLE files (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES users(id),
  file_name   text NOT NULL,
  mime        text,
  size_bytes  bigint,
  storage_key text NOT NULL,                  -- objeto no S3
  checksum    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE datasets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_id      uuid REFERENCES files(id) ON DELETE SET NULL,
  name         text NOT NULL,
  source_kind  text NOT NULL,                 -- arquivo|conector|gerado
  source_meta  jsonb NOT NULL DEFAULT '{}',   -- aba, delimitador, páginas do PDF…
  row_count    bigint NOT NULL DEFAULT 0,
  storage_ref  text,                          -- parquet no S3 / tabela particionada
  quality      jsonb,
  is_demo      boolean NOT NULL DEFAULT false,
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE dataset_fields (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  position   int  NOT NULL,
  name       text NOT NULL,
  label      text,
  type       text NOT NULL,
  role       text NOT NULL,
  confidence numeric(4,3),
  stats      jsonb,
  UNIQUE (dataset_id, name)
);

CREATE TABLE transform_steps (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  position   int  NOT NULL,
  type       text NOT NULL,
  config     jsonb NOT NULL,
  enabled    boolean NOT NULL DEFAULT true
);

CREATE TABLE relationships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_dataset  uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  from_field    text NOT NULL,
  to_dataset    uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  to_field      text NOT NULL,
  cardinality   text NOT NULL,
  active        boolean NOT NULL DEFAULT true
);

-- Apresentação -------------------------------------------------------------
CREATE TABLE dashboards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  template    text,
  dataset_id  uuid REFERENCES datasets(id) ON DELETE SET NULL,
  layout      jsonb NOT NULL DEFAULT '{}',
  owner_id    uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tiles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  position     int NOT NULL,
  type         text NOT NULL,
  dataset_id   uuid REFERENCES datasets(id) ON DELETE SET NULL,
  spec         jsonb NOT NULL          -- dimension, grain, breakdown, measures…
);

CREATE TABLE measures (          -- medidas reutilizáveis do modelo
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  name       text NOT NULL,
  expression text NOT NULL,
  format     text,
  UNIQUE (dataset_id, name)
);

-- Colaboração e operação ---------------------------------------------------
CREATE TABLE shares (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id  uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  token         text NOT NULL UNIQUE,
  permission    text NOT NULL,               -- ver|ver+exportar|editar
  password_hash text,
  expires_at    timestamptz,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz
);

CREATE TABLE comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  tile_id      uuid REFERENCES tiles(id) ON DELETE CASCADE,
  author_id    uuid REFERENCES users(id),
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name         text NOT NULL,
  dataset_id   uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  spec         jsonb NOT NULL,               -- campo, agregação, operador, valor
  channels     text[] NOT NULL DEFAULT '{interna}',
  schedule     text,                         -- cron
  enabled      boolean NOT NULL DEFAULT true,
  last_run_at  timestamptz,
  last_fired_at timestamptz
);

CREATE TABLE jobs (              -- importações, recálculos, agendamentos
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  status      text NOT NULL DEFAULT 'na_fila',
  progress    numeric(5,2) NOT NULL DEFAULT 0,
  rows_done   bigint DEFAULT 0,
  errors      int DEFAULT 0,
  payload     jsonb,
  error_text  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  org_id     uuid NOT NULL,
  user_id    uuid,
  action     text NOT NULL,
  target     text,
  ip         inet,
  user_agent text,
  at         timestamptz NOT NULL DEFAULT now()
);

-- Índices que importam ------------------------------------------------------
CREATE INDEX ON datasets (org_id, updated_at DESC);
CREATE INDEX ON dataset_fields (dataset_id, position);
CREATE INDEX ON tiles (dashboard_id, position);
CREATE INDEX ON audit_log (org_id, at DESC);
CREATE INDEX ON jobs (org_id, status, created_at DESC);
```

### Armazenamento das linhas

Não em tabela relacional genérica (EAV mata a performance). O previsto:

- **Parquet no S3**, uma pasta por dataset, particionado por data quando existir
  campo temporal;
- **DuckDB** no serviço de consulta lendo o Parquet — agregações colunares em
  milissegundos sobre milhões de linhas;
- Postgres guarda somente **metadados** (as tabelas acima) e resultados
  materializados de consultas frequentes.

### Isolamento multiempresa

Toda tabela carrega `org_id`; ativar **Row Level Security** no Postgres com
política `org_id = current_setting('app.org_id')::uuid` garante que uma consulta
nunca cruze organizações, mesmo com bug na aplicação.

---

## Regras de negócio consolidadas

1. Nenhuma importação é confirmada sem prévia revisada pelo usuário.
2. Dados originais são imutáveis; tratamento é pipeline reaplicável.
3. Dado de demonstração é dataset separado (`is_demo`), sempre etiquetado, e
   nunca é misturado a dado real na mesma tabela.
4. Colunas identificadoras não viram medida automaticamente.
5. Cartão de indicador sem meta exibe "sem meta", não zero.
6. Categoria vazia aparece como `(vazio)` — nunca é descartada silenciosamente.
7. Excesso de categorias vira "Outros", com o número de itens agrupados visível.
8. Projeção da IA é sempre rotulada como estimativa.
9. Excluir uma fonte remove os componentes que dependiam dela (com confirmação).
10. Filtros e período sobrevivem ao recarregamento da página; a seleção de
    cross-filter, não (é contexto de exploração).
