const LUGARES = [
  {
    nome: 'Pão de Açúcar', img: 'pao-de-acucar',
    resumo: 'O morro de 396 metros na entrada da Baía de Guanabara. Lá de cima dá para ver Copacabana, o Cristo Redentor e a Ponte Rio-Niterói.',
    chegar: 'Estação do bondinho na Praia Vermelha, na Urca. Do metrô Botafogo são cerca de 10 minutos de táxi ou ônibus.',
    quando: 'Logo na abertura, para pegar menos fila, ou uma hora antes do pôr do sol.',
    dica: 'Na volta, desça a pé do Morro da Urca pela trilha curta e termine na Mureta da Urca.'
  },
  {
    nome: 'Praia de Copacabana', img: 'copacabana',
    resumo: 'Quatro quilômetros de areia entre o Leme e o Forte de Copacabana, com o calçadão de ondas pretas e brancas que virou símbolo do Rio.',
    chegar: 'Metrô linha 1: estações Cardeal Arcoverde, Siqueira Campos e Cantagalo.',
    quando: 'Até as 10h, ou a partir das 16h para ver o sol baixar.',
    dica: 'O calçadão é ótimo para pedalar de manhã cedo, antes do movimento.'
  },
  {
    nome: 'Bondinho da Urca', img: 'bondinho',
    resumo: 'Inaugurado em 1912, foi o primeiro teleférico do Brasil. A subida tem duas etapas: até o Morro da Urca e de lá até o Pão de Açúcar.',
    chegar: 'Praça General Tibúrcio, na Praia Vermelha, Urca.',
    quando: 'Dias de céu limpo, de manhã. Depois da chuva de verão a vista fica nítida.',
    dica: 'Compre o ingresso online e chegue 15 minutos antes do horário marcado.'
  },
  {
    nome: 'Lapa', img: 'lapa',
    resumo: 'Os Arcos da Lapa são um aqueduto do século XVIII. Hoje o bonde de Santa Teresa passa por cima e a região é o endereço do samba e da noite carioca.',
    chegar: 'Metrô linhas 1 e 2: estações Cinelândia ou Carioca.',
    quando: 'De dia para a Escadaria Selarón; à noite, de quinta a sábado, para a música ao vivo.',
    dica: 'Suba a Escadaria Selarón cedo, antes dos grupos de turismo, para fotos sem multidão.'
  },
  {
    nome: 'Lagoa Rodrigo de Freitas', img: 'lagoa',
    resumo: 'O espelho d’água entre Ipanema, Leblon e o Jardim Botânico, cercado por uma ciclovia de cerca de 7,5 km e quiosques.',
    chegar: 'Metrô linha 1 até General Osório e uma caminhada curta, ou ônibus pela Epitácio Pessoa.',
    quando: 'No fim da tarde, quando o sol se põe atrás dos morros.',
    dica: 'Alugue uma bike ou um pedalinho e termine com um chope nos quiosques.'
  },
  {
    nome: 'Sambódromo', img: 'sambodromo',
    resumo: 'Projetado por Oscar Niemeyer e inaugurado em 1984, é a avenida dos desfiles das escolas de samba, na Marquês de Sapucaí.',
    chegar: 'Metrô linha 2: estação Praça Onze.',
    quando: 'No Carnaval, para os desfiles. Nas semanas antes, os ensaios técnicos são abertos ao público.',
    dica: 'Para os desfiles, leve capa de chuva leve e água: as noites são longas.'
  },
  {
    nome: 'Jockey Club Brasileiro', img: 'jockey',
    resumo: 'O Hipódromo da Gávea, com corridas de cavalo e uma das vistas mais bonitas do Cristo Redentor por trás da pista.',
    chegar: 'Praça Santos Dumont, na Gávea. Ônibus pela Rua Jardim Botânico ou táxi a partir do metrô Antero de Quental.',
    quando: 'Nos dias de corrida, no fim da tarde.',
    dica: 'Combine com uma visita ao Jardim Botânico, que fica a poucos minutos.'
  },
  {
    nome: 'Estádio do Maracanã', img: 'maracana',
    resumo: 'Inaugurado em 1950 para a Copa do Mundo, é o templo do futebol brasileiro e casa de jogos de Flamengo e Fluminense.',
    chegar: 'Metrô linha 2 ou trem: estação Maracanã.',
    quando: 'Em dia de clássico para sentir a torcida, ou no tour guiado durante a semana.',
    dica: 'O tour passa pelos vestiários e pelo gramado. Reserve online.'
  },
  {
    nome: 'Aterro do Flamengo', img: 'aterro',
    resumo: 'O Parque do Flamengo, com paisagismo de Roberto Burle Marx: ciclovia, quadras, pipas e vista para o Pão de Açúcar.',
    chegar: 'Metrô linha 1: estações Flamengo, Largo do Machado ou Glória.',
    quando: 'Domingos e feriados, quando a pista é fechada para carros.',
    dica: 'Comece no Museu de Arte Moderna e pedale até a Praia do Flamengo.'
  },
  {
    nome: 'Barra da Tijuca', img: 'barra',
    resumo: 'Cerca de 18 km de praia aberta, com mar forte, kitesurf e a Pedra da Gávea no horizonte.',
    chegar: 'Metrô linha 4: estação Jardim Oceânico. Depois, BRT ou ônibus pela orla.',
    quando: 'No meio da semana, para praia vazia, e no fim da tarde para o pôr do sol.',
    dica: 'O Pepê, no início da praia, é o ponto dos esportes de vela e do sanduíche natural.'
  }
];

// Galeria → diálogo com as informações
const dialogo = document.querySelector('.lugar');
document.querySelectorAll('[data-lugar]').forEach(botao => {
  botao.addEventListener('click', () => {
    const l = LUGARES[Number(botao.dataset.lugar)];
    dialogo.querySelector('img').src = `media/${l.img}.jpg`;
    dialogo.querySelector('h3').textContent = l.nome;
    dialogo.querySelector('.lugar-resumo').textContent = l.resumo;
    ['chegar', 'quando', 'dica'].forEach(c => (dialogo.querySelector(`[data-campo="${c}"]`).textContent = l[c]));
    dialogo.showModal();
  });
});
dialogo.addEventListener('click', e => { if (e.target === dialogo) dialogo.close(); });

// Vídeo: botão de pausa e respeito a movimento reduzido
const video = document.querySelector('.hero-video');
const controle = document.querySelector('.video-controle');
function estado(pausado) {
  controle.setAttribute('aria-pressed', String(pausado));
  controle.setAttribute('aria-label', pausado ? 'Reproduzir vídeo' : 'Pausar vídeo');
  controle.querySelector('use').setAttribute('href', pausado ? '#i-play' : '#i-pause');
}
controle.addEventListener('click', () => {
  if (video.paused) { video.play(); estado(false); } else { video.pause(); estado(true); }
});
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  video.removeAttribute('autoplay');
  video.pause();
  estado(true);
}

// Nome do lugar que está no vídeo (cada cena dura 3,4 s)
const legenda = document.querySelector('.video-legenda span');
video.addEventListener('timeupdate', () => {
  const nome = LUGARES[Math.floor(video.currentTime / 3.4) % LUGARES.length].nome;
  if (legenda.textContent !== nome) legenda.textContent = nome;
});

// Topo fica sólido depois do hero
const topo = document.querySelector('.topo');
new IntersectionObserver(([e]) => topo.classList.toggle('solido', !e.isIntersecting), { rootMargin: '-80px 0px 0px' })
  .observe(document.querySelector('.hero'));
