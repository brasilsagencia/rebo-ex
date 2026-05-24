const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');
const actions = document.querySelector('.header-actions');

if (toggle && nav && actions) {
  toggle.addEventListener('click', () => {
    const isOpen = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!isOpen));
    nav.classList.toggle('open');
    actions.classList.toggle('open');
  });
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

const form = document.querySelector('#leadForm');
if (form) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const lines = [
      'Olá, Brasils Agência Digital. Quero um diagnóstico gratuito.',
      `Nome: ${data.get('nome') || ''}`,
      `WhatsApp: ${data.get('whatsapp') || ''}`,
      `Empresa: ${data.get('empresa') || ''}`,
      `Cidade/Bairro: ${data.get('bairro') || ''}`,
      `Serviço: ${data.get('servico') || ''}`,
      `Google Meu Negócio: ${data.get('gmb') || 'Não informado'}`,
      `Mensagem: ${data.get('mensagem') || ''}`
    ];
    const url = `https://wa.me/5521990029982?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(url, '_blank', 'noopener');
  });
}

const scrollTopButton = document.querySelector('.scroll-top');
if (scrollTopButton) {
  scrollTopButton.addEventListener('click', (event) => {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
