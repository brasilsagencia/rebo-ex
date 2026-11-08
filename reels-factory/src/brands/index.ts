// Cada marca/cliente da fábrica é um "kit": cores, fontes e arquivos em public/marcas/<id>/.
// Para um novo cliente, copie o bloco "premium", troque os valores e os arquivos.
import '@fontsource/barlow-condensed/700-italic.css';
import '@fontsource/barlow-condensed/800-italic.css';
import '@fontsource/barlow-condensed/900-italic.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';

export type Marca = {
  nome: string;
  cores: {
    fundo: string; // azul-noite do cartaz
    fundoMeio: string;
    laranja: string;
    laranjaEscuro: string;
    azul: string; // azul royal da camiseta
    branco: string;
    textoSuave: string;
  };
  fontes: {titulo: string; texto: string};
  arquivos: {logo: string; dupla?: string; carro?: string; apresentador?: string};
};

export const MARCAS: Record<string, Marca> = {
  premium: {
    nome: 'Premium Proteção Veicular',
    cores: {
      fundo: '#06112A',
      fundoMeio: '#0C1F4D',
      laranja: '#FF6A13',
      laranjaEscuro: '#E3440C',
      azul: '#1D4ED8',
      branco: '#FFFFFF',
      textoSuave: '#C9D4EE',
    },
    fontes: {
      // Títulos: sans condensada, pesada e itálica, como "IMPREVISTOS NÃO AVISAM."
      titulo: '"Barlow Condensed", sans-serif',
      texto: 'Poppins, sans-serif',
    },
    arquivos: {
      logo: 'marcas/premium/logo.png',
      dupla: 'marcas/premium/dupla.jpg',
      carro: 'marcas/premium/carro.jpg',
      apresentador: 'marcas/premium/apresentadora.jpg',
    },
  },
};

export const getMarca = (id: string): Marca => {
  const m = MARCAS[id];
  if (!m) throw new Error(`Marca "${id}" não cadastrada em src/brands/index.ts`);
  return m;
};
