import React from 'react';
import {AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame} from 'remotion';
import type {Marca} from '../brands';
import {clamp} from './motion';

const DUR = 12;

/** Faixas diagonais (laranja + azul) que varrem a tela cobrindo o corte. */
const Varredura: React.FC<{marca: Marca}> = ({marca}) => {
  const frame = useCurrentFrame();
  const x = (atraso: number) =>
    interpolate(frame - atraso, [0, DUR], [-2600, 2100], {...clamp, easing: Easing.inOut(Easing.cubic)});
  return (
    <AbsoluteFill style={{pointerEvents: 'none', overflow: 'hidden'}}>
      <div style={{position: 'absolute', top: -400, left: x(0), width: 1600, height: 2800, background: marca.cores.laranja, transform: 'skewX(-18deg)'}} />
      <div style={{position: 'absolute', top: -400, left: x(2) - 420, width: 420, height: 2800, background: marca.cores.fundoMeio, transform: 'skewX(-18deg)'}} />
    </AbsoluteFill>
  );
};

/** Coloca uma varredura centrada em cada corte (em frames absolutos). */
export const Transicoes: React.FC<{marca: Marca; cortes: number[]}> = ({marca, cortes}) => (
  <>
    {cortes.map((c) => (
      <Sequence key={c} from={c - DUR / 2} durationInFrames={DUR} layout="none">
        <Varredura marca={marca} />
      </Sequence>
    ))}
  </>
);
