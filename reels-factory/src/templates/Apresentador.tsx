// TEMPLATE "apresentador" — estrutura da referência 2 (pessoa falando para a câmera):
// apresentador em tela cheia + faixa diagonal da marca + bolhas de ícones flutuando + legenda queimada
// palavra a palavra + cartão final de CTA que sobe por cima.
// Mídia: use `midia.video` (MP4 do apresentador, com áudio) quando houver; `midia.imagem` serve de prévia.
import React from 'react';
import {AbsoluteFill, Easing, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {getMarca, type Marca} from '../brands';
import {Acabamento, FotoKenBurns} from '../components/Cenario';
import {ICONES} from '../components/Icones';
import {BotaoCTA, Contatos, Logo, type Contato} from '../components/Marca';
import {clamp, Pop, Sobe, useSpring} from '../components/motion';
import {MixAudio, type AudioProps} from '../components/Audio';

export const FPS = 30;

export type Fala = {de: number; ate: number; texto: string; destaque?: string[]};
export type Bolha = {icone: string; texto: string; em: number; ate: number; x: number; y: number};
export type ApresentadorProps = {
  marca: string;
  segundos: number;
  midia: {imagem?: string; video?: string};
  bolhas: Bolha[];
  falas: Fala[];
  cta: {em: number; chamada: string; texto: string; contatos: Contato[]};
  audio?: AudioProps;
};

export const duracaoApresentador = (p: ApresentadorProps) => Math.round(p.segundos * FPS);

const FaixaDiagonal: React.FC<{m: Marca}> = ({m}) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, 18], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          left: -200,
          right: -200,
          top: 1360,
          height: 900,
          background: m.cores.fundoMeio,
          transform: `translateX(${(1 - t) * -1400}px) rotate(14deg)`,
          transformOrigin: 'left top',
          borderTop: `16px solid ${m.cores.laranja}`,
          opacity: 0.94,
        }}
      />
    </AbsoluteFill>
  );
};

const BolhaIcone: React.FC<{m: Marca; b: Bolha}> = ({m, b}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const Icone = ICONES[b.icone] ?? ICONES.batida;
  const sai = interpolate(frame, [(b.ate - b.em) * fps - 8, (b.ate - b.em) * fps], [1, 0], clamp);
  const flutua = Math.sin(frame / 14) * 10;
  const p = useSpring(6, {damping: 200}, 12);
  return (
    <div style={{position: 'absolute', left: b.x - 95, top: b.y - 95 + flutua, width: 190, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: sai, transform: `scale(${0.6 + 0.4 * sai})`}}>
      <Pop>
        <div
          style={{
            width: 190,
            height: 190,
            borderRadius: '50%',
            background: `radial-gradient(circle at 35% 30%, ${m.cores.fundoMeio}, ${m.cores.fundo})`,
            border: `7px solid ${m.cores.laranja}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 14px 40px rgba(0,0,0,0.45), 0 0 40px ${m.cores.laranja}55`,
          }}
        >
          <Icone tamanho={100} />
        </div>
      </Pop>
      <div
        style={{
          marginTop: 14,
          opacity: p,
          transform: `translateY(${(1 - p) * 20}px)`,
          whiteSpace: 'nowrap',
          background: m.cores.laranja,
          color: '#fff',
          fontFamily: m.fontes.titulo,
          fontStyle: 'italic',
          fontWeight: 800,
          fontSize: 46,
          textTransform: 'uppercase',
          padding: '4px 22px',
          borderRadius: 12,
        }}
      >
        {b.texto}
      </div>
    </div>
  );
};

/** Legenda queimada: a palavra "falada" no momento fica laranja (estilo karaokê). */
const Legenda: React.FC<{m: Marca; f: Fala}> = ({m, f}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const palavras = f.texto.split(' ');
  const dur = (f.ate - f.de) * fps;
  const ativa = Math.min(palavras.length - 1, Math.floor((frame / (dur * 0.85)) * palavras.length));
  const entra = useSpring(0, {damping: 14}, 10);
  return (
    <AbsoluteFill style={{top: 1150, paddingLeft: 70, paddingRight: 70, alignItems: 'center'}}>
      <div
        style={{
          transform: `scale(${0.85 + 0.15 * entra})`,
          opacity: entra,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          columnGap: 18,
          fontFamily: m.fontes.titulo,
          fontStyle: 'italic',
          fontWeight: 900,
          fontSize: 104,
          lineHeight: 1,
          textTransform: 'uppercase',
          textAlign: 'center',
        }}
      >
        {palavras.map((w, i) => {
          const limpa = w.replace(/[.,!?]/g, '').toLowerCase();
          const marcada = f.destaque?.some((d) => d.toLowerCase() === limpa);
          const cor = i === ativa || marcada ? m.cores.laranja : m.cores.branco;
          return (
            <span
              key={i}
              style={{
                color: cor,
                transform: i === ativa ? 'scale(1.08)' : undefined,
                display: 'inline-block',
                WebkitTextStroke: '3px #06112A',
                paintOrder: 'stroke fill',
                textShadow: '0 6px 0 #06112A, 0 10px 30px rgba(0,0,0,0.6)',
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const CartaoCTA: React.FC<{m: Marca; c: ApresentadorProps['cta']}> = ({m, c}) => {
  const p = useSpring(0, {damping: 18}, 20);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{background: `rgba(6,17,42,${0.35 * p})`}} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 1060,
          transform: `translateY(${(1 - p) * 1100}px)`,
          background: `linear-gradient(180deg, ${m.cores.fundoMeio}F5, ${m.cores.fundo})`,
          borderTop: `14px solid ${m.cores.laranja}`,
          borderTopLeftRadius: 60,
          borderTopRightRadius: 60,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 60,
        }}
      >
        <Logo marca={m} largura={600} atraso={8} />
        <Sobe atraso={12}>
          <div style={{fontFamily: m.fontes.texto, fontWeight: 700, fontSize: 38, color: m.cores.branco, marginTop: 10}}>{c.chamada}</div>
        </Sobe>
        <div style={{marginTop: 50}}>
          <Contatos marca={m} contatos={c.contatos} atraso={16} compacto />
        </div>
        <div style={{marginTop: 50}}>
          <BotaoCTA marca={m} texto={c.texto} atraso={26} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Apresentador: React.FC<ApresentadorProps> = (p) => {
  const m = getMarca(p.marca);
  const total = duracaoApresentador(p);
  const s = (x: number) => Math.round(x * FPS);
  return (
    <AbsoluteFill style={{backgroundColor: m.cores.fundo}}>
      {p.midia.video ? (
        <OffthreadVideo src={staticFile(p.midia.video)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
      ) : p.midia.imagem ? (
        <FotoKenBurns src={p.midia.imagem} dur={total} de={1.0} para={1.12} origem="50% 30%" />
      ) : null}
      <FaixaDiagonal m={m} />
      {p.bolhas.map((b, i) => (
        <Sequence key={i} from={s(b.em)} durationInFrames={s(b.ate - b.em)} layout="none">
          <BolhaIcone m={m} b={b} />
        </Sequence>
      ))}
      {p.falas.map((f, i) => (
        <Sequence key={i} from={s(f.de)} durationInFrames={s(f.ate - f.de)} layout="none">
          <Legenda m={m} f={f} />
        </Sequence>
      ))}
      <Sequence from={s(p.cta.em)} layout="none">
        <CartaoCTA m={m} c={p.cta} />
      </Sequence>
      <Acabamento />
      <MixAudio a={p.audio} />
    </AbsoluteFill>
  );
};
