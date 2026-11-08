// TEMPLATE "cartaz" — estrutura da referência 1 (cartaz estático animado):
// logo + gancho em caixa alta → riscos → promessa → foto dos consultores + contatos + botão de cotação.
import React from 'react';
import {AbsoluteFill, interpolate, Series, useCurrentFrame} from 'remotion';
import {getMarca, type Marca} from '../brands';
import {Acabamento, Chuva, CidadeNoturna, FotoKenBurns, RastrosDeLuz} from '../components/Cenario';
import {ICONES} from '../components/Icones';
import {BotaoCTA, Contatos, Logo, type Contato} from '../components/Marca';
import {clamp, PalavraAPalavra, Pop, Slam, Sobe, useShake, Wipe} from '../components/motion';
import {Transicoes} from '../components/Transicao';

export const FPS = 30;

export type CartazProps = {
  marca: string;
  gancho: {segundos: number; linha1: string; linha2: string; slogan?: string};
  riscos: {segundos: number; kicker: string; itens: {icone: string; texto: string}[]};
  promessa: {segundos: number; destaque: string; texto: string};
  fechamento: {segundos: number; chamada: string; cta: string; contatos: Contato[]};
};

const f = (s: number) => Math.round(s * FPS);
export const duracaoCartaz = (p: CartazProps) => f(p.gancho.segundos) + f(p.riscos.segundos) + f(p.promessa.segundos) + f(p.fechamento.segundos);

const SEGURO = {paddingLeft: 80, paddingRight: 80};

const titulo = (m: Marca, tam: number, cor: string): React.CSSProperties => ({
  fontFamily: m.fontes.titulo,
  fontStyle: 'italic',
  fontWeight: 900,
  fontSize: tam,
  lineHeight: 0.92,
  color: cor,
  textTransform: 'uppercase',
  letterSpacing: -1,
  textShadow: '0 10px 40px rgba(0,0,0,0.55)',
});

const Gancho: React.FC<{m: Marca; p: CartazProps['gancho']}> = ({m, p}) => {
  const frame = useCurrentFrame();
  const shake = useShake(8, 18);
  const linha = interpolate(frame, [24, 40], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <CidadeNoturna marca={m} />
      <RastrosDeLuz marca={m} />
      <Chuva />
      <AbsoluteFill style={{...SEGURO, paddingTop: 190, alignItems: 'center', transform: shake}}>
        <Logo marca={m} largura={760} />
        {p.slogan ? (
          <Sobe atraso={8}>
            <div style={{fontFamily: m.fontes.texto, fontWeight: 700, fontSize: 38, color: m.cores.branco, marginTop: 12, letterSpacing: 1}}>{p.slogan}</div>
          </Sobe>
        ) : null}
        <div style={{marginTop: 320, textAlign: 'center'}}>
          <Slam atraso={6}>
            <div style={titulo(m, 200, m.cores.branco)}>{p.linha1}</div>
          </Slam>
          <Wipe atraso={16}>
            <div style={{...titulo(m, 200, m.cores.laranja), marginTop: 8}}>{p.linha2}</div>
          </Wipe>
          <div style={{margin: '40px auto 0', height: 6, width: 760 * linha, borderRadius: 3, background: `linear-gradient(90deg, transparent, ${m.cores.laranja}, transparent)`}} />
        </div>
      </AbsoluteFill>
      <Acabamento />
    </AbsoluteFill>
  );
};

const Riscos: React.FC<{m: Marca; p: CartazProps['riscos']}> = ({m, p}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <CidadeNoturna marca={m} brilho={0.5} />
      <RastrosDeLuz marca={m} quantidade={5} />
      <AbsoluteFill style={{background: 'rgba(4,10,28,0.55)'}} />
      <AbsoluteFill style={{...SEGURO, paddingTop: 300, alignItems: 'center'}}>
        <Sobe>
          <div style={{fontFamily: m.fontes.texto, fontWeight: 600, fontSize: 50, color: m.cores.textoSuave, textAlign: 'center'}}>{p.kicker}</div>
        </Sobe>
        <div style={{marginTop: 70, display: 'flex', flexDirection: 'column', gap: 46, width: '100%'}}>
          {p.itens.map((it, i) => {
            const Icone = ICONES[it.icone] ?? ICONES.batida;
            const atraso = 10 + i * 16;
            const risco = interpolate(frame - atraso, [8, 20], [0, 1], clamp);
            return (
              <div key={it.texto} style={{display: 'flex', alignItems: 'center', gap: 44, paddingLeft: 60}}>
                <Pop atraso={atraso}>
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
                      boxShadow: `0 0 50px ${m.cores.laranja}66`,
                    }}
                  >
                    <Icone tamanho={104} />
                  </div>
                </Pop>
                <div style={{position: 'relative'}}>
                  <Wipe atraso={atraso + 4}>
                    <div style={titulo(m, 150, m.cores.branco)}>{it.texto}</div>
                  </Wipe>
                  <div style={{position: 'absolute', left: 0, bottom: -10, height: 10, width: `${risco * 100}%`, background: m.cores.laranja, borderRadius: 5}} />
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <Acabamento />
    </AbsoluteFill>
  );
};

const Promessa: React.FC<{m: Marca; p: CartazProps['promessa']; dur: number}> = ({m, p, dur}) => (
  <AbsoluteFill>
    {m.arquivos.carro ? <FotoKenBurns src={m.arquivos.carro} dur={dur} de={1.15} para={1.3} blur={5} origem="40% 50%" /> : <CidadeNoturna marca={m} />}
    <AbsoluteFill style={{background: `linear-gradient(180deg, ${m.cores.fundo}EE 0%, ${m.cores.fundo}88 45%, ${m.cores.fundo}F2 100%)`}} />
    <Chuva gotas={40} opacidade={0.25} />
    <AbsoluteFill style={{...SEGURO, justifyContent: 'center', paddingBottom: 200}}>
      <Slam atraso={4} de={1.4} style={{transformOrigin: 'left center'}}>
        <div style={titulo(m, 190, m.cores.laranja)}>{p.destaque}</div>
      </Slam>
      <PalavraAPalavra
        texto={p.texto}
        atraso={14}
        passo={3}
        corDestaque={m.cores.laranja}
        style={{marginTop: 34, fontFamily: m.fontes.texto, fontWeight: 700, fontSize: 88, lineHeight: 1.18, color: m.cores.branco}}
      />
    </AbsoluteFill>
    <Acabamento />
  </AbsoluteFill>
);

const Fechamento: React.FC<{m: Marca; p: CartazProps['fechamento']; dur: number}> = ({m, p, dur}) => {
  const frame = useCurrentFrame();
  const mascara = interpolate(frame, [0, 14], [100, 0], clamp);
  return (
    <AbsoluteFill style={{background: `linear-gradient(180deg, ${m.cores.fundoMeio}, ${m.cores.fundo} 60%)`}}>
      <RastrosDeLuz marca={m} topo={1500} altura={380} quantidade={7} />
      {m.arquivos.dupla ? (
        <div style={{position: 'absolute', top: 400, left: 0, right: 0, height: 720, clipPath: `inset(${mascara}% 0 0 0)`}}>
          <FotoKenBurns src={m.arquivos.dupla} dur={dur} de={1.02} para={1.12} origem="45% 30%" />
          <div style={{position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${m.cores.fundoMeio} 0%, transparent 14%, transparent 70%, ${m.cores.fundo} 100%)`}} />
        </div>
      ) : null}
      <AbsoluteFill style={{paddingTop: 150, alignItems: 'center'}}>
        <Logo marca={m} largura={640} />
        <Sobe atraso={6}>
          <div style={{fontFamily: m.fontes.texto, fontWeight: 700, fontSize: 36, color: m.cores.branco, marginTop: 6}}>{p.chamada}</div>
        </Sobe>
      </AbsoluteFill>
      <AbsoluteFill style={{top: 1090, alignItems: 'center'}}>
        <Contatos marca={m} contatos={p.contatos} atraso={14} compacto />
        <div style={{marginTop: 54}}>
          <BotaoCTA marca={m} texto={p.cta} atraso={30} />
        </div>
      </AbsoluteFill>
      <Acabamento />
    </AbsoluteFill>
  );
};

export const Cartaz: React.FC<CartazProps> = (p) => {
  const m = getMarca(p.marca);
  const d = [p.gancho, p.riscos, p.promessa, p.fechamento].map((c) => f(c.segundos));
  const cortes = [d[0], d[0] + d[1], d[0] + d[1] + d[2]];
  return (
    <AbsoluteFill style={{backgroundColor: m.cores.fundo}}>
      <Series>
        <Series.Sequence durationInFrames={d[0]}>
          <Gancho m={m} p={p.gancho} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={d[1]}>
          <Riscos m={m} p={p.riscos} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={d[2]}>
          <Promessa m={m} p={p.promessa} dur={d[2]} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={d[3]}>
          <Fechamento m={m} p={p.fechamento} dur={d[3]} />
        </Series.Sequence>
      </Series>
      <Transicoes marca={m} cortes={cortes} />
    </AbsoluteFill>
  );
};
