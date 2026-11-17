# Skills de Design & Animação (verificadas em 17/11/2026)

Skills instaladas neste projeto. O Claude Code as carrega sozinho em qualquer sessão aberta neste repositório.
As mesmas skills estão em `../../skills-zip/` como `.zip` prontos para subir no Claude.ai
(Settings → Capabilities → Skills → Upload skill), um por arquivo.

## Combo instalado (site HTML/CSS/JS estático, sem React)

| Skill | Origem | Para quê |
|---|---|---|
| `frontend-design` | anthropics/skills | Direção estética e tipografia; evita o visual genérico de IA |
| `emil-design-eng` | emilkowalski/skills | Acabamento de UI: hover/press, easing, transições |
| `review-animations` | emilkowalski/skills | Revisão das animações contra um padrão (STANDARDS.md) |
| `gsap-core` | greensock/gsap-skills (oficial) | Tweens, easing, timelines do GSAP |
| `gsap-scrolltrigger` | greensock/gsap-skills (oficial) | Scroll, pin, scrub e parallax |
| `gsap-performance` | greensock/gsap-skills (oficial) | GSAP a 60fps |
| `60fps-animation` | iart-ai/web-animation-skills | Animações CSS sem travar (transform/opacity, FLIP) |
| `accessible-animation` | iart-ai/web-animation-skills | `prefers-reduced-motion` e acessibilidade |
| `micro-interaction` | iart-ai/web-animation-skills | Botões, toggles e feedback visual |

Todas usam licença MIT ou Apache-2.0; cada pasta traz o próprio `LICENSE.txt`.

## O que ficou de fora e por quê

- **VoltAgent/awesome-claude-design**: o repositório só tem um README com links para getdesign.md, sem nenhum arquivo `DESIGN.md`. Os arquivos ficam no site getdesign.md.
- **dammyjay93/interface-design**: a própria skill diz que não serve para landing pages nem sites de marketing; é feita para dashboards e apps.
- **shadcn/ui** (`skills/shadcn`): só se aplica a projetos React com `components.json`.
- **freshtechbro/claudedesignskills**: tem mais de 20 skills de 3D/WebGL (Three.js, R3F, Spline, Rive, Lottie, Barba). Vale para projetos 3D; para este site seria peso a mais.
- **iart-ai `gsap-web`**: no lugar dela entrou a skill oficial da GreenSock (`greensock/gsap-skills`), que não estava na lista original.
- **remotion-dev/skills**: a skill oficial de vídeo em React (Remotion). Instale só quando for gerar vídeo: `npx skills add remotion-dev/skills`.

## Para instalar em outro projeto

```bash
npx skills add anthropics/skills       # escolha frontend-design
npx skills add emilkowalski/skills
npx skills add greensock/gsap-skills
npx skills add iart-ai/web-animation-skills
```
