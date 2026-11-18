import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: ['src/lib/visitorGuide.ts'],
  bundle: true,
  write: false,
  format: 'esm',
});
const { destinosVisitante, gerarFragmentoGuia, lerFragmentoGuia } =
  await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

const mapa = {
  largura: 120,
  altura: 90,
  portarias: [{ id: 1, nome: 'Recepção', x: 10, y: 20 }, { id: 2, nome: 'Entrada restrita', x: 60, y: 20 }],
  blocos: [
    { id: 1, nome: 'Torre Ipê', x: 30, y: 40, largura: 18, altura: 20, andares: 6 },
    { id: 2, nome: 'Torre Araucária', x: 78, y: 60, largura: 24, altura: 22, andares: 8, rotacao: 15 },
  ],
  unidades: [{ unidade_id: 1, numero: 'A', tipo_residencia: 'casa', oculta: true }],
  areas_comuns: [{ id: 1, nome: 'Praça', tipo: 'jardim', x: 45, y: 22, largura: 14, altura: 10 }],
  ruas: [{ id: 1, nome: 'Nome interno da via', largura: 4, pontos: [{ x: 10, y: 20 }, { x: 25, y: 40 }, { x: 70, y: 40 }, { x: 70, y: 65 }, { x: 10, y: 20 }] }],
};

test('preserva o traçado e o entorno sem expor outras portarias ou unidades', () => {
  const [destino, ...outras] = destinosVisitante(mapa);
  assert.equal(outras.length, 2);
  const fragmento = gerarFragmentoGuia(mapa, mapa.portarias[0], destino);
  const guia = lerFragmentoGuia(fragmento);
  assert.deepEqual(guia.entrada, { nome: 'Recepção', x: 10, y: 20 });
  assert.deepEqual(guia.destino, { nome: 'Torre Ipê', tipo: 'bloco', x: 30, y: 40, largura: 18, altura: 20, andares: 6, rotacao: 0 });
  assert.deepEqual(guia.vias, [{ largura: 4, pontos: mapa.ruas[0].pontos }]);
  assert.deepEqual(guia.entorno, {
    tipo: 'vertical',
    blocos: [{ nome: 'Torre Araucária', x: 78, y: 60, largura: 24, altura: 22, andares: 8, rotacao: 15 }],
    areas: [{ nome: 'Praça', tipo: 'jardim', x: 45, y: 22, largura: 14, altura: 10, rotacao: 0 }],
  });
  assert.ok(!JSON.stringify(guia).includes('Entrada restrita'));
  assert.equal('unidades' in guia, false);
});

test('o guia rejeita fragmentos inválidos e valores fora dos limites', () => {
  assert.equal(lerFragmentoGuia('#%GG'), null);
  assert.equal(lerFragmentoGuia('#' + 'x'.repeat(16001)), null);
  const [destino] = destinosVisitante(mapa);
  assert.equal(gerarFragmentoGuia(mapa, mapa.portarias[0], { ...destino, andares: 999 }), null);
});


test('links antigos continuam abrindo com os dados que carregavam', () => {
  const guia = {
    largura: 120,
    altura: 90,
    entrada: { nome: 'Portaria', x: 0, y: 5 },
    destino: { nome: 'Torre Ipê', tipo: 'bloco', x: 30, y: 40, largura: 18, altura: 20, andares: 6, rotacao: 0 },
    vias: [],
  };
  assert.deepEqual(lerFragmentoGuia('#' + encodeURIComponent(JSON.stringify(guia))), guia);
});
