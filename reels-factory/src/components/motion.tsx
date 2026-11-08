// Primitivas de motion graphics. Tudo é função do frame (regra do Remotion: nada de CSS animation).
import React from 'react';
import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const useSpring = (atraso = 0, config: {damping?: number; mass?: number; stiffness?: number} = {damping: 14}, dur?: number) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return spring({frame: frame - atraso, fps, config, durationInFrames: dur});
};

type Base = {atraso?: number; children: React.ReactNode; style?: React.CSSProperties};

/** Sobe e aparece. */
export const Sobe: React.FC<Base & {distancia?: number}> = ({atraso = 0, distancia = 60, children, style}) => {
  const p = useSpring(atraso, {damping: 200}, 16);
  return <div style={{opacity: p, transform: `translateY(${(1 - p) * distancia}px)`, ...style}}>{children}</div>;
};

/** Entrada "slam": chega grande e borrada e assenta com impacto. */
export const Slam: React.FC<Base & {de?: number}> = ({atraso = 0, de = 1.8, children, style}) => {
  const frame = useCurrentFrame();
  const p = useSpring(atraso, {damping: 11, stiffness: 180});
  const s = interpolate(p, [0, 1], [de, 1]);
  const blur = interpolate(frame - atraso, [0, 6], [14, 0], clamp);
  const op = interpolate(frame - atraso, [0, 3], [0, 1], clamp);
  return <div style={{transform: `scale(${s})`, filter: `blur(${blur}px)`, opacity: op, ...style}}>{children}</div>;
};

/** Revela da esquerda para a direita com máscara (wipe) + leve deslize. */
export const Wipe: React.FC<Base & {dur?: number}> = ({atraso = 0, dur = 12, children, style}) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame - atraso, [0, dur], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  return (
    <div style={{clipPath: `inset(-20% ${(1 - t) * 100}% -20% -5%)`, transform: `translateX(${(1 - t) * -40}px)`, ...style}}>
      {children}
    </div>
  );
};

/** Pop elástico (ícones, botões). */
export const Pop: React.FC<Base> = ({atraso = 0, children, style}) => {
  const p = useSpring(atraso, {damping: 9, stiffness: 160});
  return <div style={{transform: `scale(${p})`, opacity: Math.min(1, p * 2), ...style}}>{children}</div>;
};

/** Texto palavra a palavra. `destaque` = índices de palavras em cor de acento. */
export const PalavraAPalavra: React.FC<{
  texto: string;
  atraso?: number;
  passo?: number;
  corDestaque: string;
  destaque?: number[];
  style?: React.CSSProperties;
}> = ({texto, atraso = 0, passo = 3, corDestaque, destaque = [], style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <div style={{display: 'flex', flexWrap: 'wrap', columnGap: '0.28em', ...style}}>
      {texto.split(' ').map((w, i) => {
        const p = spring({frame: frame - atraso - i * passo, fps, config: {damping: 200}, durationInFrames: 12});
        return (
          <span key={i} style={{display: 'inline-block', opacity: p, transform: `translateY(${(1 - p) * 30}px)`, color: destaque.includes(i) ? corDestaque : undefined}}>
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** Tremida de câmera curta a partir de `em` (impacto). */
export const useShake = (em: number, intensidade = 14, dur = 10) => {
  const frame = useCurrentFrame();
  const t = frame - em;
  if (t < 0 || t > dur) return 'translate(0px,0px)';
  const k = (1 - t / dur) * intensidade;
  return `translate(${Math.sin(t * 2.7) * k}px, ${Math.cos(t * 3.3) * k}px)`;
};

/** Brilho que atravessa um elemento (shine sweep), repetindo a cada `ciclo` frames. */
export const Brilho: React.FC<{atraso?: number; ciclo?: number}> = ({atraso = 0, ciclo = 45}) => {
  const frame = useCurrentFrame();
  const t = frame - atraso;
  if (t < 0) return null;
  const x = interpolate(t % ciclo, [0, 18], [-60, 160], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `linear-gradient(100deg, transparent ${x - 20}%, rgba(255,255,255,0.55) ${x}%, transparent ${x + 20}%)`,
        mixBlendMode: 'overlay',
        pointerEvents: 'none',
      }}
    />
  );
};
