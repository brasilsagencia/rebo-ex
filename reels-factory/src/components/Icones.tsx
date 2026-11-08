// Ícones em SVG desenhados à mão (traço branco), para usar dentro de círculos da marca.
import React from 'react';

type P = {tamanho?: number; cor?: string};
const svg = (tamanho: number, children: React.ReactNode, cor: string) => (
  <svg width={tamanho} height={tamanho} viewBox="0 0 64 64" fill="none" stroke={cor} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const IconeTelefone: React.FC<P> = ({tamanho = 64, cor = '#fff'}) => (
  <svg width={tamanho} height={tamanho} viewBox="0 0 64 64">
    <path
      fill={cor}
      d="M20.6 9.5c1.4-.4 2.9.3 3.6 1.6l4.3 8.3c.6 1.2.4 2.7-.6 3.7l-4 3.8c2.7 5.6 7.4 10.3 13 13l3.8-4c1-1 2.5-1.2 3.7-.6l8.3 4.3c1.3.7 2 2.2 1.6 3.6l-1.7 6.4c-.4 1.5-1.8 2.5-3.3 2.4C27.6 50.9 13.1 36.4 11.5 14.6c-.1-1.5.9-2.9 2.4-3.3z"
    />
  </svg>
);

export const IconeMensagem: React.FC<P> = ({tamanho = 64, cor = '#fff'}) =>
  svg(
    tamanho,
    <>
      <path d="M32 8a24 24 0 0 0-20.6 36.3L8 56l12-3.3A24 24 0 1 0 32 8z" />
      <path d="M24 24c0 9 7 16 16 16l3-4-6-3-2 2c-3-1-5-3-6-6l2-2-3-6z" fill={cor} strokeWidth={2} />
    </>,
    cor,
  );

export const IconeEscudo: React.FC<P> = ({tamanho = 64, cor = '#fff'}) =>
  svg(
    tamanho,
    <>
      <path d="M32 6 10 14v16c0 14 9.5 24 22 28 12.5-4 22-14 22-28V14z" fill={cor} stroke="none" />
      <path d="m22 32 7 7 13-14" stroke="#E3440C" strokeWidth={6} />
    </>,
    cor,
  );

export const IconeBatida: React.FC<P> = ({tamanho = 64, cor = '#fff'}) =>
  svg(
    tamanho,
    <>
      <path d="M6 44v-8l5-10h18l6 10v8z" />
      <circle cx="14" cy="46" r="4" />
      <circle cx="29" cy="46" r="4" />
      <path d="M44 14l3 7 7-3-3 7 7 3-7 3 3 7-7-3-3 7" />
    </>,
    cor,
  );

export const IconeCadeado: React.FC<P> = ({tamanho = 64, cor = '#fff'}) =>
  svg(
    tamanho,
    <>
      <rect x="14" y="28" width="36" height="28" rx="5" />
      <path d="M22 28v-8a10 10 0 0 1 20 0v8" />
      <path d="M32 38v8" />
    </>,
    cor,
  );

export const IconeChave: React.FC<P> = ({tamanho = 64, cor = '#fff'}) =>
  svg(
    tamanho,
    <path d="M40 8a14 14 0 0 0-13.4 18L8 44.6V56h11.4L38 37.4A14 14 0 1 0 40 8zm4 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" />,
    cor,
  );

export const IconeSeta: React.FC<P> = ({tamanho = 64, cor = '#fff'}) => svg(tamanho, <path d="m24 14 18 18-18 18" strokeWidth={7} />, cor);

export const ICONES: Record<string, React.FC<P>> = {
  batida: IconeBatida,
  roubo: IconeCadeado,
  pane: IconeChave,
  escudo: IconeEscudo,
  telefone: IconeTelefone,
  mensagem: IconeMensagem,
};
