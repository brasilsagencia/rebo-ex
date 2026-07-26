/**
 * Brasil BI — compartilhamentos, usuários e permissões, configurações e ajuda.
 *
 * Observação honesta de escopo: autenticação real, controle de acesso por
 * usuário e links públicos protegidos por senha exigem servidor. Nesta versão
 * estática, esses recursos existem como configuração local (perfis, permissões
 * e links de visualização) e estão claramente sinalizados.
 */

import { el, render, uid, fmtRelative, fmtBytes, fmtDate, copyToClipboard, downloadBlob } from "../core/utils.js";
import { icon } from "../core/icons.js";
import { modal, toast, confirmDialog, promptDialog } from "../ui/feedback.js";
import { getState, update, activeDashboard, resetState, markNotificationsRead } from "../core/store.js";
import { storageEstimate, wipeAll, storage } from "../core/db.js";
import { buildShareLink } from "../export/exporters.js";
import { setTheme, themePreference } from "../core/theme.js";
import { navigate } from "../app.js";

/* -------------------------------------------------------- compartilhar --- */

export function renderSharesView(root) {
  const state = getState();
  const dashboard = activeDashboard();

  render(root, [
    el("div.view__head", {}, [
      el("div", {}, [
        el("h1", { text: "Compartilhamentos" }),
        el("p", { text: "Gere links de visualização do painel atual e acompanhe o histórico de atividades." }),
      ]),
      dashboard
        ? el("button.btn.btn--primary", { "on:click": () => openShareDialog(dashboard, root) }, [
            icon("share", { size: 15 }),
            el("span", { text: "Novo link" }),
          ])
        : null,
    ]),

    el("div.disclaimer", { style: { marginBottom: "18px" } }, [
      icon("shield", { size: 14 }),
      el("span", {
        text: "O link carrega a configuração do painel (layout, filtros e tema) — não os dados. Quem abrir precisa ter as mesmas fontes importadas no navegador dele. Links públicos com dados, senha e expiração real dependem do back-end descrito em docs/ARQUITETURA.md.",
      }),
    ]),

    el("div.layout-split", {}, [
      el("div.card", {}, [
        el("div.card__head", {}, [el("div.card__title", { text: "Links gerados" })]),
        el("div.card__body", {}, [
          state.shares.length
            ? el("div.stack-2", {}, state.shares.map((share) => shareRow(share, root)))
            : el("p.muted.t-xs", { text: "Nenhum link gerado ainda." }),
        ]),
      ]),

      el("div.side-panel.card", {}, [
        el("div.card__head", {}, [el("div.card__title", { text: "Histórico de atividades" })]),
        el("div.card__body", {}, [
          state.activity.length
            ? el("div.stack-2", {}, state.activity.slice(0, 25).map((entry) =>
                el("div.t-xs.muted", {}, [
                  el("strong", { text: entry.user }),
                  el("span", { text: ` ${entry.action} ` }),
                  el("span", { text: entry.target }),
                  el("span.dim", { text: ` · ${fmtRelative(entry.at)}` }),
                ])
              ))
            : el("p.muted.t-xs", { text: "Sem registros ainda." }),
        ]),
      ]),
    ]),
  ]);
}

function shareRow(share, root) {
  return el("div.list__row", {}, [
    icon("link", { size: 14 }),
    el("div.grow", {}, [
      el("div.t-xs", { text: share.name }),
      el("div.dim", {
        style: { fontSize: "10px" },
        text: `${share.permission} · criado ${fmtRelative(share.createdAt)}${share.expiresAt ? ` · expira em ${fmtDate(share.expiresAt)}` : ""}${share.password ? " · com senha" : ""}`,
      }),
    ]),
    el("button.btn.btn--sm", {
      text: "Copiar",
      "on:click": async () => {
        const ok = await copyToClipboard(share.url);
        toast(ok ? "Link copiado" : "Não foi possível copiar automaticamente", {
          level: ok ? "success" : "warn",
          message: ok ? "" : share.url,
        });
      },
    }),
    el("button.btn.btn--ghost.btn--icon.btn--sm.btn--danger", {
      "aria-label": "Revogar",
      "on:click": () => {
        update((s) => {
          s.shares = s.shares.filter((x) => x.id !== share.id);
        }, { reason: "share" });
        renderSharesView(root);
      },
    }, [icon("trash", { size: 13 })]),
  ]);
}

function openShareDialog(dashboard, root) {
  const state = getState();
  const name = el("input.input", { value: `${dashboard.name} — link` });
  const permission = el("select.select", {}, [
    el("option", { value: "visualizar", text: "Somente visualizar" }),
    el("option", { value: "visualizar+exportar", text: "Visualizar e exportar" }),
    el("option", { value: "editar", text: "Editar" }),
  ]);
  const password = el("input.input", { type: "text", placeholder: "opcional" });
  const expires = el("input.input", { type: "date" });

  const ref = modal({
    title: "Gerar link de compartilhamento",
    body: el("div.stack-3", {}, [
      el("div.field", {}, [el("label", { text: "Nome do link" }), name]),
      el("div.field", {}, [el("label", { text: "Permissão" }), permission]),
      el("div.grid-2", {}, [
        el("div.field", {}, [el("label", { text: "Senha" }), password]),
        el("div.field", {}, [el("label", { text: "Expira em" }), expires]),
      ]),
      el("div.disclaimer", {}, [
        icon("alert", { size: 13 }),
        el("span", { text: "Senha e expiração são registradas na configuração, mas só passam a ser aplicadas de fato quando o back-end estiver conectado. Não trate este link como uma barreira de segurança." }),
      ]),
    ]),
    actions: [
      el("button.btn", { text: "Cancelar", "on:click": () => ref.close() }),
      el("button.btn.btn--primary", {
        text: "Gerar",
        "on:click": () => {
          const url = buildShareLink({
            dashboardId: dashboard.id,
            filters: state.filters.global,
            period: state.period,
            theme: themePreference(),
          });
          update((s) => {
            s.shares.push({
              id: uid("shr"),
              name: name.value,
              permission: permission.value,
              password: password.value || null,
              expiresAt: expires.value || null,
              url,
              createdAt: new Date().toISOString(),
            });
          }, { reason: "share" });
          copyToClipboard(url).then((ok) =>
            toast(ok ? "Link gerado e copiado" : "Link gerado", {
              level: "success",
              message: ok ? "" : "Copie manualmente na lista de links.",
            })
          );
          ref.close();
          renderSharesView(root);
        },
      }),
    ],
  });
}

/* ------------------------------------------------------------- usuários -- */

const ROLES = [
  { id: "administrador", label: "Administrador", perms: ["Tudo, incluindo usuários e configurações"] },
  { id: "gestor", label: "Gestor", perms: ["Criar e editar dashboards", "Importar dados", "Exportar", "Compartilhar"] },
  { id: "analista", label: "Analista", perms: ["Criar e editar dashboards", "Importar dados", "Tratar dados"] },
  { id: "editor", label: "Editor", perms: ["Editar dashboards existentes", "Exportar"] },
  { id: "visualizador", label: "Visualizador", perms: ["Visualizar dashboards", "Aplicar filtros"] },
  { id: "cliente", label: "Cliente", perms: ["Visualizar apenas os painéis compartilhados"] },
];

export function renderUsersView(root) {
  const state = getState();

  render(root, [
    el("div.view__head", {}, [
      el("div", {}, [
        el("h1", { text: "Usuários e permissões" }),
        el("p", { text: "Perfis de acesso previstos no sistema e identificação do usuário local." }),
      ]),
    ]),

    el("div.disclaimer", { style: { marginBottom: "18px" } }, [
      icon("shield", { size: 14 }),
      el("span", {
        text: "Esta versão roda inteiramente no seu navegador: não há login, servidor de autenticação nem separação real entre usuários. Os perfis abaixo definem a matriz de permissões que o back-end aplicará (login seguro, 2FA, logs de acesso e RBAC estão especificados em docs/ARQUITETURA.md e docs/SEGURANCA.md).",
      }),
    ]),

    el("div.layout-split", {}, [
      el("div.card", {}, [
        el("div.card__head", {}, [el("div.card__title", { text: "Matriz de perfis" })]),
        el("div.table-wrap", { style: { border: "0" } }, [
          el("table.data", {}, [
            el("thead", {}, [el("tr", {}, [el("th", { text: "Perfil" }), el("th", { text: "Pode" })])]),
            el("tbody", {}, ROLES.map((role) =>
              el("tr", {}, [
                el("td", {}, [
                  el("strong", { text: role.label }),
                  state.user.role === role.id ? el("span.badge.badge--ok", { style: { marginLeft: "8px" }, text: "você" }) : null,
                ]),
                el("td", { style: { whiteSpace: "normal" }, text: role.perms.join(" · ") }),
              ])
            )),
          ]),
        ]),
      ]),

      el("div.side-panel.card.card--pad.stack-3", {}, [
        el("div.section-title", { text: "Seu perfil local" }),
        el("div.field", {}, [
          el("label", { text: "Nome" }),
          el("input.input", {
            value: state.user.name,
            "on:change": (e) => update((s) => {
              s.user.name = e.target.value;
            }, { reason: "user" }),
          }),
        ]),
        el("div.field", {}, [
          el("label", { text: "E-mail" }),
          el("input.input", {
            type: "email",
            value: state.user.email,
            "on:change": (e) => update((s) => {
              s.user.email = e.target.value;
            }, { reason: "user" }),
          }),
        ]),
        el("div.field", {}, [
          el("label", { text: "Perfil" }),
          el(
            "select.select",
            {
              "on:change": (e) => update((s) => {
                s.user.role = e.target.value;
              }, { reason: "user" }),
            },
            ROLES.map((r) => el("option", { value: r.id, selected: state.user.role === r.id ? "selected" : null, text: r.label }))
          ),
        ]),
      ]),
    ]),
  ]);
}

/* -------------------------------------------------------- configurações -- */

export async function renderSettingsView(root) {
  const state = getState();
  const estimate = await storageEstimate();

  render(root, [
    el("div.view__head", {}, [
      el("div", {}, [el("h1", { text: "Configurações" }), el("p", { text: "Aparência, dados locais e privacidade." })]),
    ]),

    el("div.grid-2", {}, [
      el("div.card.card--pad.stack-3", {}, [
        el("div.section-title", {}, [icon("sun", { size: 13 }), el("span", { text: "Aparência" })]),
        el("div.field", {}, [
          el("label", { text: "Tema" }),
          el(
            "select.select",
            { "on:change": (e) => setTheme(e.target.value) },
            [
              ["auto", "Automático (segue o sistema)"],
              ["dark", "Escuro"],
              ["light", "Claro"],
            ].map(([value, label]) => el("option", { value, selected: themePreference() === value ? "selected" : null, text: label }))
          ),
        ]),
        el("label.check", {}, [
          el("input", {
            type: "checkbox",
            checked: state.prefs.compactNumbers ? "checked" : null,
            "on:change": (e) => update((s) => {
              s.prefs.compactNumbers = e.target.checked;
            }, { reason: "prefs" }),
          }),
          el("span", { text: "Abreviar números grandes nos cartões (1,2 mi)" }),
        ]),
        el("label.check", {}, [
          el("input", {
            type: "checkbox",
            checked: state.prefs.confirmDestructive ? "checked" : null,
            "on:change": (e) => update((s) => {
              s.prefs.confirmDestructive = e.target.checked;
            }, { reason: "prefs" }),
          }),
          el("span", { text: "Pedir confirmação em ações destrutivas" }),
        ]),
      ]),

      el("div.card.card--pad.stack-3", {}, [
        el("div.section-title", {}, [icon("sources", { size: 13 }), el("span", { text: "Armazenamento local" })]),
        el("ul.stack-2.t-xs.muted", {}, [
          el("li", { text: `• ${state.datasets.length} fonte(s) e ${state.dashboards.length} dashboard(s) salvos` }),
          el("li", { text: `• Uso estimado: ${estimate.usage ? fmtBytes(estimate.usage) : "indisponível"}${estimate.quota ? ` de ${fmtBytes(estimate.quota)}` : ""}` }),
          el("li", { text: `• Persistência: ${storage.durable ? "IndexedDB (durável)" : `limitada — ${storage.reason}`}` }),
        ]),
        el("div.row.wrap", {}, [
          el("button.btn.btn--sm", {
            "on:click": () => {
              const backup = { version: 1, exportedAt: new Date().toISOString(), state: getState() };
              downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }), "brasil-bi-configuracao.json");
              toast("Backup da configuração gerado", { level: "success", message: "Contém painéis e preferências (não inclui as linhas dos dados)." });
            },
          }, [icon("download", { size: 13 }), el("span", { text: "Exportar configuração" })]),
          el("button.btn.btn--sm.btn--danger", {
            "on:click": async () => {
              const ok = await confirmDialog({
                title: "Apagar todos os dados locais",
                message: "Fontes, dashboards, filtros e preferências serão removidos deste navegador. Não há como desfazer.",
                confirmLabel: "Apagar tudo",
                danger: true,
              });
              if (!ok) return;
              await wipeAll();
              resetState();
              toast("Dados locais apagados", { level: "success" });
              navigate("visao-geral");
            },
          }, [icon("trash", { size: 13 }), el("span", { text: "Apagar tudo" })]),
        ]),
      ]),

      el("div.card.card--pad.stack-3", {}, [
        el("div.section-title", {}, [icon("shield", { size: 13 }), el("span", { text: "Privacidade e LGPD" })]),
        el("ul.stack-2.t-xs.muted", {}, [
          el("li", { text: "• Os arquivos são lidos no navegador; nenhum byte é enviado a servidores." }),
          el("li", { text: "• Os dados ficam no IndexedDB deste dispositivo/perfil de navegador." }),
          el("li", { text: "• “Apagar tudo” executa a exclusão definitiva (direito de eliminação)." }),
          el("li", { text: "• Ao conectar o back-end, aplique retenção, consentimento e logs conforme docs/SEGURANCA.md." }),
        ]),
      ]),

      el("div.card.card--pad.stack-3", {}, [
        el("div.section-title", {}, [icon("bell", { size: 13 }), el("span", { text: "Notificações" })]),
        state.notifications.length
          ? el("div.stack-2", {}, state.notifications.slice(0, 8).map((n) =>
              el("div.t-xs", {}, [
                el("strong", { text: n.title }),
                el("div.muted", { text: n.message || "" }),
                el("div.dim", { text: fmtRelative(n.at) }),
              ])
            ))
          : el("p.muted.t-xs", { text: "Nenhuma notificação." }),
        state.notifications.length
          ? el("button.btn.btn--sm", { text: "Marcar todas como lidas", "on:click": () => {
              markNotificationsRead();
              renderSettingsView(root);
            } })
          : null,
      ]),
    ]),
  ]);
}

/* ----------------------------------------------------------------- ajuda */

export function renderHelpView(root) {
  const faq = [
    ["Onde meus dados ficam guardados?", "No próprio navegador: metadados e painéis no localStorage, linhas no IndexedDB. Nada é enviado para servidores. Trocar de navegador ou limpar os dados do site apaga tudo."],
    ["Por que meu PDF digitalizado não importou?", "PDFs de imagem precisam de OCR para virar texto. O sistema detecta e avisa, em vez de importar dados incertos. Converta com um OCR (ou exporte a planilha original) e importe de novo."],
    ["Como cruzar duas tabelas?", "Vá em Modelagem, crie o relacionamento e depois use “Mesclar tabela” no tratamento da tabela principal, escolhendo as mesmas chaves."],
    ["Como funciona o cross-filter?", "Clicar em qualquer elemento de um gráfico filtra todos os outros componentes. Clique de novo no mesmo elemento (ou em “Limpar filtros”) para desfazer."],
    ["Os números da IA são confiáveis?", "Os valores vêm de cálculos diretos sobre os seus dados. Interpretações vêm rotuladas como fato, correlação ou projeção — projeções são estimativas e nunca garantia."],
    ["Posso usar em celular?", "Sim. O layout reorganiza os cartões em coluna única, simplifica os filtros e mantém os botões principais acessíveis."],
  ];

  const shortcuts = [
    ["/", "Focar a busca"],
    ["g depois v", "Ir para a visão geral"],
    ["g depois i", "Ir para importar"],
    ["g depois a", "Ir para análises com IA"],
    ["t", "Alternar tema"],
    ["f", "Abrir filtros"],
    ["Esc", "Fechar janelas"],
  ];

  render(root, [
    el("div.view__head", {}, [
      el("div", {}, [el("h1", { text: "Central de ajuda" }), el("p", { text: "Perguntas frequentes, atalhos e documentação técnica." })]),
    ]),

    el("div.grid-2", {}, [
      el("div.card.card--pad.stack-3", {}, [
        el("div.section-title", { text: "Perguntas frequentes" }),
        ...faq.map(([q, a]) =>
          el("details", {}, [
            el("summary", { style: { cursor: "pointer", fontWeight: "600", fontSize: "13px", padding: "6px 0" }, text: q }),
            el("p.muted.t-xs", { text: a }),
          ])
        ),
      ]),

      el("div.stack-4", {}, [
        el("div.card.card--pad.stack-3", {}, [
          el("div.section-title", { text: "Atalhos de teclado" }),
          el("div.stack-2", {}, shortcuts.map(([key, desc]) =>
            el("div.row-between.t-xs", {}, [el("kbd.chip", { text: key }), el("span.muted", { text: desc })])
          )),
        ]),
        el("div.card.card--pad.stack-3", {}, [
          el("div.section-title", { text: "Documentação" }),
          el("ul.stack-2.t-xs", {}, [
            el("li", {}, [el("a", { href: "../docs/ARQUITETURA.md", target: "_blank", text: "Arquitetura do sistema" })]),
            el("li", {}, [el("a", { href: "../docs/MODELO-DE-DADOS.md", target: "_blank", text: "Modelo de dados" })]),
            el("li", {}, [el("a", { href: "../docs/DESIGN-SYSTEM.md", target: "_blank", text: "Design system" })]),
            el("li", {}, [el("a", { href: "../docs/SEGURANCA.md", target: "_blank", text: "Segurança e LGPD" })]),
            el("li", {}, [el("a", { href: "../docs/INSTALACAO.md", target: "_blank", text: "Instalação e publicação" })]),
            el("li", {}, [el("a", { href: "../docs/ROADMAP.md", target: "_blank", text: "O que já funciona e o que é roadmap" })]),
          ]),
        ]),
      ]),
    ]),
  ]);
}

export { promptDialog };
