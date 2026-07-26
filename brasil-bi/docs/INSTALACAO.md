# Instalação e publicação — Brasil BI

A aplicação é **estática e sem build**: HTML, CSS e módulos ES nativos. Não há
`npm install`, bundler, transpilação ou variável de ambiente para rodar.

---

## 1. Rodar localmente

Módulos ES exigem um servidor HTTP (abrir o arquivo com `file://` não funciona
por causa da política de CORS).

```bash
# na raiz do repositório
npx http-server -p 8099 -s .
# ou
python3 -m http.server 8099
```

Abra: <http://localhost:8099/brasil-bi/>

Sem instalar nada além do que você já tem — qualquer servidor estático serve.

---

## 2. Requisitos do navegador

| Recurso | Necessário para | Mínimo |
| --- | --- | --- |
| Módulos ES | tudo | Chrome 89+, Firefox 89+, Safari 15+, Edge 89+ |
| `DecompressionStream` | ler XLSX e PDF comprimido | Chrome 103+, Firefox 113+, Safari 16.4+ |
| IndexedDB | guardar as linhas | todos os acima |
| `structuredClone` | cópia de estado (com fallback) | opcional |

Navegadores mais antigos continuam abrindo a aplicação e importando CSV, JSON,
XML e TXT; XLSX e PDF exibem mensagem explicando o motivo.

---

## 3. Publicação

### GitHub Pages

O repositório já é servido como site estático. Depois do merge, a aplicação fica
em:

```
https://<usuario>.github.io/<repo>/brasil-bi/
```

Nada a configurar — não há passo de build.

### Netlify / Vercel / Cloudflare Pages

| Campo | Valor |
| --- | --- |
| Build command | *(vazio)* |
| Output directory | `.` (raiz do repositório) |
| Node version | irrelevante |

Recomendado adicionar os cabeçalhos de segurança de `SEGURANCA.md`.
Exemplo para Netlify (`netlify.toml`):

```toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    X-Frame-Options = "DENY"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "geolocation=(), microphone=(), camera=()"
```

### Servidor próprio (Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name bi.suaempresa.com.br;

    root /var/www/brasil-bi;
    index index.html;

    # Módulos ES precisam do MIME correto
    types { application/javascript js; text/css css; }

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Assets versionados podem ter cache longo; o HTML, não
    location ~* \.(js|css)$ { add_header Cache-Control "public, max-age=3600"; }
    location = /index.html   { add_header Cache-Control "no-cache"; }

    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
}
```

---

## 4. Testes

```bash
# Testes de unidade (parsing, tipos, fórmulas, pipeline) — Node 22+
node brasil-bi/tests/unit.mjs

# Leitor de PDF (monta um PDF sintético e valida a extração)
node brasil-bi/tests/formats.mjs

# Ponta a ponta no navegador (precisa do servidor rodando + Playwright)
npx http-server -p 8099 -s . &
node brasil-bi/tests/e2e.mjs
node brasil-bi/tests/interactions.mjs
```

O teste ponta a ponta importa um CSV real pela interface, confere a tipagem
(moeda e data em formato brasileiro), valida os totais agregados, exercita o
cross-filter, faz round-trip de XLSX, verifica persistência após recarregar e
checa acessibilidade e responsividade.

`BASE_URL` permite apontar para outro endereço; `SHOT_DIR` salva capturas.

---

## 5. Estrutura de arquivos

```
brasil-bi/
├── index.html              shell da aplicação
├── css/                    tokens, base, componentes, layout, gráficos
├── js/
│   ├── app.js              bootstrap, rotas, cabeçalho, atalhos
│   ├── core/               store, IndexedDB, tema, utilidades, ícones
│   ├── data/               parsers, XLSX, PDF, tipos, perfil, transformações,
│   │                       fórmulas, motor de consulta
│   ├── charts/             biblioteca SVG (27 visualizações)
│   ├── ai/                 insights e linguagem natural
│   ├── export/             CSV, XLSX, JSON, PNG, PDF, link
│   ├── ui/                 tile, feedback (toast/modal/popover)
│   ├── views/              13 telas
│   └── demo/               gerador de dados fictícios
├── tests/                  unit.mjs, formats.mjs, e2e.mjs, interactions.mjs
└── docs/                   esta documentação
```

---

## 6. Ambientes

Como não há build, a separação por ambiente é feita por caminho ou subdomínio:

| Ambiente | Sugestão |
| --- | --- |
| Desenvolvimento | `localhost:8099/brasil-bi/` |
| Homologação | branch de preview do Netlify/Vercel, ou `/brasil-bi-hml/` |
| Produção | domínio principal |

Quando o back-end existir, o único ponto de configuração será a URL da API —
concentre-a em um `js/core/config.js` lido em runtime (por exemplo, de um
`config.json` publicado junto), evitando reintroduzir um passo de build.

---

## 7. Solução de problemas

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| Tela em branco e erro de CORS no console | Aberto via `file://` | Suba um servidor HTTP |
| "Este navegador não suporta descompactação nativa" | Navegador antigo | Atualize ou converta o XLSX para CSV |
| "Cota de armazenamento do navegador excedida" | Arquivo muito grande para o IndexedDB | Reduza colunas/linhas na importação ou apague fontes antigas |
| PDF importa vazio | PDF digitalizado (imagem) | A tela avisa "requer OCR" — use um OCR antes |
| Fontes não carregam (visual com fonte do sistema) | Sem acesso ao Google Fonts | Funciona normalmente; para offline total, hospede a fonte junto |
| Dados sumiram | Limpeza do navegador ou outro perfil/dispositivo | Restaure de um backup/CSV exportado |
