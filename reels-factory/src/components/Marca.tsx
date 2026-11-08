// Peças de marca reutilizadas entre templates: logo, contatos e botão de CTA.
import React from 'react';
import {Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import type {Marca} from '../brands';
import {IconeEscudo, IconeMensagem, IconeSeta, IconeTelefone} from './Icones';
import {Brilho, clamp, Pop, Sobe, useSpring} from './motion';

export type Contato = {nome: string; whatsapp: string};

export const Logo: React.FC<{marca: Marca; largura?: number; atraso?: number}> = ({marca, largura = 720, atraso = 0}) => {
  const p = useSpring(atraso, {damping: 16});
  return (
    <div style={{opacity: p, transform: `translateY(${(1 - p) * -60}px)`, display: 'flex', justifyContent: 'center'}}>
      {/* logo recortado do material do cliente; usa "screen" para sumir o fundo escuro do recorte */}
      <Img src={staticFile(marca.arquivos.logo)} style={{width: largura, mixBlendMode: 'screen', WebkitMaskImage: 'radial-gradient(ellipse 60% 70% at 50% 50%, #000 70%, transparent 100%)'}} />
    </div>
  );
};

/** Faixa com os contatos (1 ou 2 pessoas), como no rodapé do cartaz de referência. */
export const Contatos: React.FC<{marca: Marca; contatos: Contato[]; atraso?: number; compacto?: boolean}> = ({
  marca,
  contatos,
  atraso = 0,
  compacto = false,
}) => {
  const frame = useCurrentFrame();
  const linha = interpolate(frame - atraso, [4, 22], [0, 1], clamp);
  return (
    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: compacto ? 26 : 34}}>
      {contatos.map((c, i) => (
        <React.Fragment key={c.nome}>
          {i > 0 ? <div style={{width: 3, height: 120 * linha, background: marca.cores.laranja, borderRadius: 2}} /> : null}
          <Sobe atraso={atraso + i * 6} distancia={40}>
            <div style={{display: 'flex', alignItems: 'center', gap: 18}}>
              <Pop atraso={atraso + i * 6 + 2}>
                <div
                  style={{
                    width: compacto ? 86 : 100,
                    height: compacto ? 86 : 100,
                    borderRadius: '50%',
                    background: `linear-gradient(160deg, ${marca.cores.laranja}, ${marca.cores.laranjaEscuro})`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: `0 0 30px ${marca.cores.laranja}88`,
                  }}
                >
                  <IconeTelefone tamanho={compacto ? 46 : 54} />
                </div>
              </Pop>
              <div>
                <div style={{fontFamily: marca.fontes.texto, fontWeight: 700, fontSize: compacto ? 40 : 46, color: marca.cores.branco, lineHeight: 1.1}}>
                  {c.nome}
                </div>
                <div style={{display: 'flex', alignItems: 'center', gap: 10, marginTop: 4}}>
                  <IconeMensagem tamanho={compacto ? 36 : 40} cor="#25D366" />
                  <span style={{fontFamily: marca.fontes.texto, fontWeight: 700, fontSize: compacto ? 40 : 46, color: marca.cores.branco, letterSpacing: -0.5}}>
                    {c.whatsapp}
                  </span>
                </div>
              </div>
            </div>
          </Sobe>
        </React.Fragment>
      ))}
    </div>
  );
};

/** Botão laranja "FAÇA SUA COTAÇÃO >" com pulso e brilho. */
export const BotaoCTA: React.FC<{marca: Marca; texto: string; atraso?: number}> = ({marca, texto, atraso = 0}) => {
  const frame = useCurrentFrame();
  const t = Math.max(0, frame - atraso - 15);
  const pulso = 1 + Math.sin(t / 5) * 0.025 * Math.min(1, t / 10);
  return (
    <Pop atraso={atraso}>
      <div style={{transform: `scale(${pulso})`, display: 'flex', justifyContent: 'center'}}>
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            gap: 26,
            padding: '30px 54px',
            borderRadius: 34,
            background: `linear-gradient(180deg, ${marca.cores.laranja}, ${marca.cores.laranjaEscuro})`,
            border: '3px solid rgba(255,255,255,0.35)',
            boxShadow: `0 0 0 8px ${marca.cores.laranja}33, 0 18px 60px ${marca.cores.laranja}99`,
          }}
        >
          <IconeEscudo tamanho={78} />
          <span style={{fontFamily: marca.fontes.titulo, fontStyle: 'italic', fontWeight: 900, fontSize: 76, color: '#fff', letterSpacing: 1, textTransform: 'uppercase'}}>
            {texto}
          </span>
          <IconeSeta tamanho={56} />
          <Brilho atraso={atraso + 12} ciclo={40} />
        </div>
      </div>
    </Pop>
  );
};
