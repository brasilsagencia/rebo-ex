import React from 'react';
import {Composition} from 'remotion';
import {Apresentador, duracaoApresentador, type ApresentadorProps} from './templates/Apresentador';
import {Cartaz, duracaoCartaz, FPS, type CartazProps} from './templates/Cartaz';
import cartaz from '../briefs/premium-cartaz-imprevistos.json';
import apresentador from '../briefs/premium-apresentador-tranquilo.json';

// Um template = uma estrutura de referência. Os briefs (briefs/*.json) só trocam o conteúdo.
export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="cartaz"
      component={Cartaz}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={450}
      defaultProps={cartaz.props as CartazProps}
      calculateMetadata={({props}) => ({durationInFrames: duracaoCartaz(props)})}
    />
    <Composition
      id="apresentador"
      component={Apresentador}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={450}
      defaultProps={apresentador.props as ApresentadorProps}
      calculateMetadata={({props}) => ({durationInFrames: duracaoApresentador(props)})}
    />
  </>
);
