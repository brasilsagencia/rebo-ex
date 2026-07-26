# rebo-ex

Site institucional da Brasils Agência Digital + aplicações estáticas.

## Conteúdo

| Caminho | O que é |
| --- | --- |
| `index.html`, `styles.css`, `script.js`, `blog-*.html`, `modelo-*.html` | Site da agência |
| [`brasil-bi/`](brasil-bi/) | **Brasil BI** — plataforma de Business Intelligence que roda inteiramente no navegador: importa PDF/XLSX/CSV/JSON/XML, trata os dados, monta dashboards interativos, analisa e exporta |

## Rodar localmente

```bash
npx http-server -p 8099 -s .
```

- Site: <http://localhost:8099/>
- Brasil BI: <http://localhost:8099/brasil-bi/>

Nenhum passo de build: tudo é HTML, CSS e módulos ES nativos.
