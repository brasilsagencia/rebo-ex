/**
 * Brasil BI — feedback de interface: toasts, modais, confirmação e popovers.
 */

import { el, render, append } from "../core/utils.js";
import { icon } from "../core/icons.js";

/* ------------------------------------------------------------------ toasts */

function toastRoot() {
  let root = document.getElementById("toasts");
  if (!root) {
    root = el("div#toasts.toasts", { role: "status", "aria-live": "polite" });
    document.body.append(root);
  }
  return root;
}

/**
 * @param {string} title
 * @param {{message?:string, level?:"success"|"error"|"warn"|"info", timeout?:number,
 *          action?:{label:string, onClick:Function}}} [opts]
 */
export function toast(title, opts = {}) {
  const { message = "", level = "info", timeout = level === "error" ? 8000 : 4200, action } = opts;
  const node = el(`div.toast.toast--${level}`, {}, [
    el("span.toast__dot"),
    el("div.grow", {}, [
      el("div.toast__title", { text: title }),
      message ? el("div.toast__msg", { text: message }) : null,
      action
        ? el(
            "button.btn.btn--sm",
            {
              style: { marginTop: "8px" },
              "on:click": () => {
                action.onClick();
                close();
              },
            },
            action.label
          )
        : null,
    ]),
    el("button.toast__close", { "aria-label": "Fechar aviso", "on:click": () => close() }, [
      icon("close", { size: 14 }),
    ]),
  ]);

  let timer = null;
  function close() {
    clearTimeout(timer);
    node.style.opacity = "0";
    node.style.transform = "translateY(6px)";
    setTimeout(() => node.remove(), 180);
  }
  toastRoot().append(node);
  if (timeout) timer = setTimeout(close, timeout);
  return close;
}

/* ------------------------------------------------------------------ modais */

let openModals = 0;

/**
 * Abre um modal. Retorna { close, body, footer, root }.
 * @param {{title:string, subtitle?:string, wide?:boolean, body:Node|Node[],
 *          actions?:Node[], onClose?:Function, dismissible?:boolean}} config
 */
export function modal(config) {
  const {
    title,
    subtitle = "",
    wide = false,
    body,
    actions = [],
    onClose,
    dismissible = true,
  } = config;

  const bodyEl = el("div.modal__body");
  append(bodyEl, body);
  const footEl = actions.length ? el("div.modal__foot", {}, actions) : null;

  const modalEl = el(`div.modal${wide ? ".modal--wide" : ""}`, {
    role: "dialog",
    "aria-modal": "true",
    "aria-label": title,
  }, [
    el("div.modal__head", {}, [
      el("div", {}, [
        el("h3", { text: title }),
        subtitle ? el("div.card__sub", { text: subtitle }) : null,
      ]),
      dismissible
        ? el("button.btn.btn--ghost.btn--icon", {
            "aria-label": "Fechar",
            "on:click": () => close(),
          }, [icon("close", { size: 17 })])
        : null,
    ]),
    bodyEl,
    footEl,
  ]);

  const backdrop = el("div.modal-backdrop", {
    "on:mousedown": (e) => {
      if (dismissible && e.target === backdrop) close();
    },
  }, [modalEl]);

  const previousFocus = document.activeElement;
  function onKey(e) {
    if (e.key === "Escape" && dismissible) {
      e.stopPropagation();
      close();
    }
    if (e.key === "Tab") trapFocus(e, modalEl);
  }

  function close() {
    document.removeEventListener("keydown", onKey, true);
    backdrop.remove();
    openModals -= 1;
    if (openModals === 0) document.body.style.overflow = "";
    if (previousFocus?.focus) previousFocus.focus();
    onClose?.();
  }

  document.addEventListener("keydown", onKey, true);
  document.body.append(backdrop);
  openModals += 1;
  document.body.style.overflow = "hidden";
  setTimeout(() => {
    const target = modalEl.querySelector("[autofocus], input, select, textarea, button");
    target?.focus();
  }, 30);

  return { close, root: modalEl, body: bodyEl, footer: footEl, setBody: (n) => render(bodyEl, n) };
}

function trapFocus(event, container) {
  const focusables = container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Confirmação (usada antes de ações destrutivas).
 * @returns {Promise<boolean>}
 */
export function confirmDialog({
  title = "Confirmar ação",
  message = "",
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      ref.close();
    };
    const ref = modal({
      title,
      body: el("p", { text: message, class: "muted" }),
      actions: [
        el("button.btn", { text: cancelLabel, "on:click": () => done(false) }),
        el(`button.btn.${danger ? "btn--danger" : "btn--primary"}`, {
          text: confirmLabel,
          "on:click": () => done(true),
        }),
      ],
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
    });
  });
}

/**
 * Solicita um texto ao usuário.
 * @returns {Promise<string|null>}
 */
export function promptDialog({ title, label = "", value = "", placeholder = "", confirmLabel = "Salvar" }) {
  return new Promise((resolve) => {
    const input = el("input.input", { value, placeholder, autofocus: true });
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
      ref.close();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") done(input.value.trim() || null);
    });
    const ref = modal({
      title,
      body: el("div.field", {}, [label ? el("label", { text: label }) : null, input]),
      actions: [
        el("button.btn", { text: "Cancelar", "on:click": () => done(null) }),
        el("button.btn.btn--primary", {
          text: confirmLabel,
          "on:click": () => done(input.value.trim() || null),
        }),
      ],
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      },
    });
  });
}

/* ---------------------------------------------------------------- popover */

let activePopover = null;

/** Abre um menu ancorado a um elemento. */
export function popover(anchor, items, { align = "right" } = {}) {
  closePopover();
  const node = el("div.popover", { role: "menu" });
  for (const item of items) {
    if (item === "-") {
      node.append(el("div.menu-sep"));
      continue;
    }
    if (item.node) {
      node.append(item.node);
      continue;
    }
    node.append(
      el("button.menu-item", {
        role: "menuitem",
        disabled: item.disabled || false,
        "on:click": () => {
          closePopover();
          item.onClick?.();
        },
      }, [item.icon ? icon(item.icon, { size: 15 }) : null, el("span", { text: item.label })])
    );
  }

  document.body.append(node);
  const rect = anchor.getBoundingClientRect();
  const width = node.offsetWidth;
  const top = Math.min(rect.bottom + 6, window.innerHeight - node.offsetHeight - 10);
  const left =
    align === "right"
      ? Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
      : Math.max(8, rect.left);
  node.style.top = `${Math.max(8, top) + window.scrollY}px`;
  node.style.left = `${left + window.scrollX}px`;

  const onDocClick = (e) => {
    if (!node.contains(e.target) && !anchor.contains(e.target)) closePopover();
  };
  const onKey = (e) => {
    if (e.key === "Escape") closePopover();
  };
  setTimeout(() => {
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
  }, 0);

  activePopover = {
    node,
    dispose: () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      node.remove();
    },
  };
  return activePopover;
}

export function closePopover() {
  activePopover?.dispose();
  activePopover = null;
}

/* --------------------------------------------------------- estados vazios */

export function emptyState({ title, message, iconName = "info", action }) {
  return el("div.empty", {}, [
    el("div.empty__icon", {}, [icon(iconName, { size: 24 })]),
    el("h3", { text: title }),
    message ? el("p", { text: message }) : null,
    action || null,
  ]);
}

export function skeletonBlock(height = 120) {
  return el("div.skeleton", { style: { height: `${height}px` } });
}

/** Barra de progresso controlável. */
export function progressBar() {
  const bar = el("div.progress__bar");
  const root = el("div.progress", { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100" }, [bar]);
  return {
    root,
    set(pct) {
      const value = Math.round(Math.max(0, Math.min(1, pct)) * 100);
      bar.style.width = `${value}%`;
      root.setAttribute("aria-valuenow", String(value));
    },
  };
}
