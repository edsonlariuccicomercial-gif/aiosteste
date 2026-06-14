import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadNormalizer() {
  const appPath = path.resolve(__dirname, '../squads/caixa-escolar/dashboard/app.js');
  const source = fs.readFileSync(appPath, 'utf8');
  const start = source.indexOf('function _normTextBasic');
  const end = source.indexOf('// Gerar novo pré-orçamento');
  const normalizerSource = source.slice(start, end);
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`${normalizerSource}; this.normalizar = _normalizarItemPreOrcamento;`, sandbox);
  return sandbox.normalizar;
}

const normalizar = loadNormalizer();

describe('normalizacao de pre-orcamento', () => {
  it('gera nome fiscal limpo para caneta de retroprojetor', () => {
    const item = {
      nome: 'Caneta Transparencia Retroprojetor Caneta Retro Projetor Preta',
      descricao: 'Descricao: Caneta Permanente Escrita Transparencias Cds Dvds Plasticos e Superficies Lisas Tinta Resistente A Agua Ponta Media Aproximadamente Mm Cor Preta. 2,0 Mm',
      unidade: 'UN',
    };

    const n = normalizar(item, null);

    expect(n.produtoCanonico).toBe('Caneta Permanente');
    expect(n.descricaoFiscal).toBe('Caneta Permanente para Retroprojetor/transparencia Ponta Media 2,0 Mm Preta');
    expect(n.descricaoFiscal.toLowerCase()).not.toContain('descricao');
    expect(n.descricaoFiscal.toLowerCase()).not.toContain('marca');
  });

  it('nao transforma colher em arroz nem alimento', () => {
    const item = {
      nome: 'Colhere Arroz Colher Media Servir Alimentos',
      descricao: '"colher Media Servir e Manipular Alimentos Confeccionada Material Resistente Facil Higienizacao e Adequada Cozinha Escolar". Marcas Referencia: Mi Lz Acinox. Preco Referencia: R$ 00.',
      unidade: 'UN',
    };

    const n = normalizar(item, null);

    expect(n.produtoCanonico).toBe('Colher');
    expect(n.descricaoFiscal).toBe('Colher Media para Servir Alimentos');
    expect(n.descricaoFiscal.toLowerCase()).not.toContain('arroz');
    expect(n.categoriaCanonica).toBe('Utensilios de Cozinha');
  });

  it('inclui capacidade no nome do copo quando existe', () => {
    const item = {
      nome: 'Copo descartavel plastico transparente',
      descricao: 'Copo descartavel plastico transparente 200 ml pacote',
      unidade: 'PCT',
    };

    const n = normalizar(item, null);

    expect(n.produtoCanonico).toBe('Copo');
    expect(n.descricaoFiscal).toBe('Copo Descartavel Plastico 200 Ml Transparente');
    expect(n.alertasNormalizacao).not.toContain('Capacidade do copo pendente');
  });

  it('alerta quando copo nao informa capacidade', () => {
    const item = {
      nome: 'Copo descartavel plastico',
      descricao: 'Copo descartavel plastico transparente',
      unidade: 'PCT',
    };

    const n = normalizar(item, null);

    expect(n.produtoCanonico).toBe('Copo');
    expect(n.descricaoFiscal).toBe('Copo Descartavel Plastico Transparente');
    expect(n.alertasNormalizacao).toContain('Capacidade do copo pendente');
  });
});
