(() => {
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  // Index: filter by area and by the search in the nav
  const rows = [...document.querySelectorAll('[data-cases] li')];
  const empty = document.querySelector('[data-empty]');
  const search = document.querySelector('[data-search] input');
  const state = { area: '', q: '' };
  const apply = () => {
    let shown = 0;
    rows.forEach((li) => {
      const ok = (!state.area || li.dataset.area === state.area) && (!state.q || norm(li.textContent).includes(state.q));
      li.hidden = !ok;
      if (ok) shown += 1;
    });
    empty.hidden = shown > 0;
  };
  document.querySelectorAll('[data-filter] input').forEach((r) => r.addEventListener('change', () => { state.area = r.value; apply(); }));
  search.addEventListener('input', () => { state.q = norm(search.value); apply(); });
  search.form.addEventListener('submit', (e) => {
    e.preventDefault();
    document.getElementById('assuntos').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t.closest('input, select, textarea, [contenteditable]')) return;
    e.preventDefault();
    search.focus();
  });

  // A row's link preselects its subject in the form
  const select = document.getElementById('assunto');
  document.querySelectorAll('[data-assunto]').forEach((a) => a.addEventListener('click', () => { select.value = a.dataset.assunto; }));

  // What to bring: tabs
  const tabs = [...document.querySelectorAll('[data-switch] [role="tab"]')];
  const show = (tab, focus) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).classList.toggle('is-on', on);
    });
    if (focus) tab.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); show(tabs[(i + d + tabs.length) % tabs.length], true); }
    });
  });
  if (tabs.length) show(tabs[0]);

  // Booking: opens WhatsApp with the request once the firm's number is set in data-whatsapp
  const form = document.querySelector('form[data-whatsapp]');
  const help = form.querySelector('[aria-live]');
  const nome = form.querySelector('#nome');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = nome.value.trim().length > 1;
    nome.toggleAttribute('aria-invalid', !ok);
    if (!ok) { nome.setAttribute('aria-describedby', help.id); help.textContent = 'Escreva seu nome para o escritório saber com quem fala.'; nome.focus(); return; }
    const num = form.dataset.whatsapp.replace(/\D/g, '');
    if (!num) { help.textContent = 'Nada foi enviado: o WhatsApp do escritório ainda não foi conectado.'; return; }
    const periodo = form.querySelector('input[name="periodo"]:checked').value;
    const msg = `Olá, sou ${nome.value.trim()}. Quero marcar uma consulta sobre ${select.value.toLowerCase()}, de preferência pela ${periodo}.`;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    help.textContent = 'O WhatsApp abriu em outra aba com a mensagem pronta.';
  });
})();
