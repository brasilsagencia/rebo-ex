// Mixagem: trilha + locução em trechos posicionados por cena, com ducking automático
// (a trilha abaixa enquanto a voz fala). Tudo em segundos no brief.
import React from 'react';
import {Audio, interpolate, Sequence, staticFile, useVideoConfig} from 'remotion';

export type Trecho = {de: number; ate: number; em: number}; // corta [de, ate] da voz e toca a partir de `em`
export type AudioProps = {
  trilha?: string;
  volumeTrilha?: number;
  volumeTrilhaSobVoz?: number;
  voz?: string;
  volumeVoz?: number;
  velocidadeVoz?: number; // 1 = normal; 1.1 = 10% mais rápida (sem mudar o tom)
  trechos?: Trecho[];
};

export const MixAudio: React.FC<{a?: AudioProps}> = ({a}) => {
  const {fps, durationInFrames} = useVideoConfig();
  if (!a) return null;
  const vel = a.velocidadeVoz ?? 1;
  const trechos = a.trechos ?? [];
  // janelas de fala no tempo do vídeo (em frames)
  const falas = trechos.map((t) => [t.em * fps, (t.em + (t.ate - t.de) / vel) * fps] as const);
  const alto = a.volumeTrilha ?? 0.8;
  const baixo = a.volumeTrilhaSobVoz ?? 0.22;
  const rampa = 6;

  const volumeTrilha = (f: number) => {
    let duck = 0;
    for (const [i, o] of falas) {
      duck = Math.max(duck, interpolate(f, [i - rampa, i, o, o + rampa], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
    }
    const fadeOut = interpolate(f, [durationInFrames - 12, durationInFrames], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    return (alto - (alto - baixo) * duck) * fadeOut;
  };

  return (
    <>
      {a.trilha ? <Audio src={staticFile(a.trilha)} volume={volumeTrilha} /> : null}
      {a.voz
        ? trechos.map((t, i) => (
            <Sequence key={i} from={Math.round(t.em * fps)} layout="none">
              <Audio
                src={staticFile(a.voz!)}
                trimBefore={Math.round(t.de * fps)}
                trimAfter={Math.round(t.ate * fps)}
                playbackRate={vel}
                volume={a.volumeVoz ?? 1}
              />
            </Sequence>
          ))
        : null}
    </>
  );
};
