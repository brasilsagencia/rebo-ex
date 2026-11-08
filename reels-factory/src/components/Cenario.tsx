// Cenário em motion graphics: cidade noturna procedural, rastros de luz e chuva.
import React from 'react';
import {AbsoluteFill, Img, interpolate, random, staticFile, useCurrentFrame} from 'remotion';
import type {Marca} from '../brands';
import {clamp} from './motion';

export const CidadeNoturna: React.FC<{marca: Marca; brilho?: number}> = ({marca, brilho = 1}) => {
  const frame = useCurrentFrame();
  const predios = Array.from({length: 16}, (_, i) => {
    const w = 70 + random(`w${i}`) * 90;
    const h = 380 + random(`h${i}`) * 720;
    return {x: i * 72 - 60 + random(`x${i}`) * 30, w, h, camada: i % 2};
  });
  const deriva = frame * 0.35;
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{background: `linear-gradient(180deg, #030A1C 0%, ${marca.cores.fundoMeio} 55%, #1b2a55 72%, ${marca.cores.fundo} 100%)`}}
      />
      {/* brilho laranja do horizonte */}
      <AbsoluteFill style={{background: `radial-gradient(ellipse 80% 22% at 50% 72%, ${marca.cores.laranja}55, transparent 70%)`, opacity: brilho}} />
      {predios.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: p.x - (p.camada ? deriva * 0.5 : deriva),
            bottom: 520,
            width: p.w,
            height: p.h * (p.camada ? 0.8 : 1),
            background: p.camada ? '#0A1638' : '#071027',
            opacity: p.camada ? 0.8 : 1,
            backgroundImage: `radial-gradient(circle, rgba(255,196,120,${0.55 * brilho}) 1.6px, transparent 2.4px)`,
            backgroundSize: `${16 + (i % 3) * 3}px ${22 + (i % 2) * 4}px`,
          }}
        />
      ))}
      {/* pista molhada com reflexos */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 540,
          background: `linear-gradient(180deg, #0a1330 0%, #050b1c 100%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 540,
          background: `repeating-linear-gradient(90deg, transparent 0 60px, ${marca.cores.laranja}22 60px 64px)`,
          filter: 'blur(6px)',
          opacity: brilho,
        }}
      />
    </AbsoluteFill>
  );
};

/** Rastros de luz de carros (long exposure), atravessando a tela. */
export const RastrosDeLuz: React.FC<{marca: Marca; quantidade?: number; topo?: number; altura?: number}> = ({
  marca,
  quantidade = 9,
  topo = 1300,
  altura = 360,
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      {Array.from({length: quantidade}, (_, i) => {
        const vel = 28 + random(`v${i}`) * 40;
        const len = 300 + random(`l${i}`) * 500;
        const y = topo + random(`y${i}`) * altura;
        const dir = i % 2 ? 1 : -1;
        const x = ((frame * vel + random(`o${i}`) * 3000) % 2600) - 800;
        const cor = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? marca.cores.laranja : '#ff2b2b';
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: y,
              left: dir > 0 ? x : 1080 - x - len,
              width: len,
              height: 4 + random(`h${i}`) * 5,
              borderRadius: 6,
              background: `linear-gradient(${dir > 0 ? 90 : 270}deg, transparent, ${cor})`,
              boxShadow: `0 0 18px ${cor}`,
              opacity: 0.85,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Chuva leve, determinística. */
export const Chuva: React.FC<{gotas?: number; opacidade?: number}> = ({gotas = 70, opacidade = 0.35}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {Array.from({length: gotas}, (_, i) => {
        const x = random(`cx${i}`) * 1180 - 50;
        const vel = 38 + random(`cv${i}`) * 26;
        const y = ((frame * vel + random(`cy${i}`) * 2200) % 2200) - 200;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x - y * 0.12,
              top: y,
              width: 2,
              height: 60 + random(`ch${i}`) * 50,
              background: 'linear-gradient(180deg, transparent, rgba(220,230,255,0.9))',
              transform: 'rotate(7deg)',
              opacity: opacidade,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Foto com Ken Burns (zoom + deriva). */
export const FotoKenBurns: React.FC<{
  src: string;
  de?: number;
  para?: number;
  dur: number;
  origem?: string;
  style?: React.CSSProperties;
  blur?: number;
}> = ({src, de = 1.05, para = 1.18, dur, origem = '50% 40%', style, blur = 0}) => {
  const frame = useCurrentFrame();
  const s = interpolate(frame, [0, dur], [de, para], clamp);
  return (
    <AbsoluteFill style={{overflow: 'hidden', ...style}}>
      <Img
        src={staticFile(src)}
        style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${s})`, transformOrigin: origem, filter: blur ? `blur(${blur}px)` : undefined}}
      />
    </AbsoluteFill>
  );
};

/** Vinheta + grão para dar acabamento "cinema". */
export const Acabamento: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)'}} />
      <AbsoluteFill
        style={{
          opacity: 0.06,
          backgroundImage: `radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)`,
          backgroundSize: '5px 5px',
          backgroundPosition: `${(frame * 7) % 5}px ${(frame * 3) % 5}px`,
        }}
      />
    </AbsoluteFill>
  );
};
