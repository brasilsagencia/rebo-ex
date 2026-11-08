# Fábrica de Reels (Remotion + motion graphics)

Cada **referência de reels** vira um **template**. Cada **pedido** vira um **brief** (`briefs/*.json`) que escolhe um template e só troca o conteúdo. A marca do cliente (cores, fontes, logo, fotos) fica num kit em `src/brands/index.ts` + `public/marcas/<cliente>/`.

| Template | Referência | Estrutura (15 s, 1080x1920, 30 fps) |
|---|---|---|
| `cartaz` | cartaz "Imprevistos não avisam" | Gancho (logo + título slam) → Riscos (ícones) → Promessa (palavra a palavra) → Fechamento (foto dos consultores + contatos + botão "Faça sua cotação") |
| `apresentador` | apresentadora com ícones flutuando | Pessoa em tela cheia + faixa diagonal da marca + bolhas de ícones + legenda queimada estilo karaokê + cartão de CTA que sobe |

Exemplos prontos (proteção veicular, Premium): `exemplos/premium-cartaz-imprevistos.mp4` e `exemplos/premium-apresentador-tranquilo.mp4`.

## Uso

```bash
npm install
npm run studio                                   # pré-visualizar e ajustar
npm run render                                   # renderiza todos os briefs → out/
npm run render -- briefs/meu-pedido.json         # só um pedido
```

## Fazer um novo pedido

1. Copie um brief de `briefs/` com o template desejado (`"template": "cartaz"` ou `"apresentador"`).
2. Troque textos, contatos, tempos (`segundos`) e ícones (`batida`, `roubo`, `pane`, `escudo`, `telefone`, `mensagem`).
3. Cliente novo: adicione um kit em `src/brands/index.ts` e os arquivos em `public/marcas/<id>/` (logo real do cliente, nunca redesenhado).
4. `npm run render -- briefs/<pedido>.json`. O MP4 sai em `out/` (H.264 yuv420p + AAC, pronto para Meta Ads/Instagram/WhatsApp).

No template `apresentador`, grave o vídeo da pessoa falando o roteiro de `falas` e informe `"midia": {"video": "marcas/<id>/arquivo.mp4"}`; a foto é só prévia.

## Regras de anúncio (Meta Ads)

- Gancho nos 3 primeiros segundos; funciona sem som (texto/legenda na tela).
- Elementos essenciais fora dos ~250 px do topo e ~400 px da base (interface do Reels).
- Não inventar números, coberturas ou depoimentos: os riscos ("batida, roubo, pane") são situações, não promessa de cobertura. Confirme com o cliente antes de citar coberturas específicas.
- Os vídeos saem sem trilha. Adicione música licenciada (ou a da biblioteca do Meta) ao publicar.
- Remotion é gratuito para indivíduos e empresas pequenas; confira https://www.remotion.dev/docs/license antes de uso comercial em escala.
