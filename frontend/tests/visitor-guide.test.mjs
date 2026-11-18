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
  blocos: [{ id: 1, nome: 'Torre Ipê', x: 30, y: 40, largura: 18, altura: 20, andares: 6 }],
  unidades: [{ unidade_id: 1, numero: 'A', tipo_residencia: 'casa', oculta: true }],
  areas_comuns: [],
  ruas: [{ id: 1, nome: 'Nome interno da via', largura: 4, pontos: [{ x: 10, y: 20 }, { x: 25, y: 40 }] }],
};

test('o link inclui apenas as referências selecionadas e a geometria das vias', () => {
  const [destino, ...outras] = destinosVisitante(mapa);
  assert.equal(outras.length, 0);
  const fragmento = gerarFragmentoGuia(mapa, mapa.portarias[0], destino);
  const guia = lerFragmentoGuia(fragmento);
  assert.deepEqual(guia.entrada, { nome: 'Recepção', x: 10, y: 20 });
  assert.deepEqual(guia.destino, { nome: 'Torre Ipê', tipo: 'bloco', x: 30, y: 40, largura: 18, altura: 20, andares: 6, rotacao: 0 });
  assert.deepEqual(guia.vias, [{ largura: 4, pontos: [{ x: 10, y: 20 }, { x: 25, y: 40 }] }]);
});

test('o guia rejeita fragmentos inválidos e valores fora dos limites', () => {
  assert.equal(lerFragmentoGuia('#%GG'), null);
  assert.equal(lerFragmentoGuia('#' + 'x'.repeat(8001)), null);
  const [destino] = destinosVisitante(mapa);
  assert.equal(gerarFragmentoGuia(mapa, mapa.portarias[0], { ...destino, andares: 999 }), null);
});
