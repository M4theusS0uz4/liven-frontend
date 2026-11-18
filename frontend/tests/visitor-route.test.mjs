import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: ['src/lib/visitorRoute.ts'], bundle: true, write: false, format: 'esm' });
const { calcularTrajeto } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

const ponto = (x, y) => ({ x, y });
const via = (...pontos) => ({ pontos, largura: 3 });
const montar = (vias) => ({
  entrada: ponto(2, 0),
  destino: { x: 10, y: 13, altura: 6, largura: 6, rotacao: 0 },
  vias,
});

test('liga um cruzamento no interior do segmento e termina na referência da via', () => {
  const trajeto = calcularTrajeto(montar([via(ponto(0, 0), ponto(20, 0)), via(ponto(10, 0), ponto(10, 10))]));
  assert.deepEqual(trajeto, { pontos: [ponto(2, 0), ponto(10, 0), ponto(10, 10)], metros: 18 });
});

test('caminhos desconectados ou referências distantes não geram um atalho', () => {
  assert.equal(calcularTrajeto(montar([via(ponto(0, 0), ponto(20, 0)), via(ponto(10, 3), ponto(10, 10))])), null);
  assert.equal(calcularTrajeto(montar([via(ponto(0, 0), ponto(20, 0))])), null);
});

test('trechos colineares sobrepostos compartilham a mesma rede', () => {
  const trajeto = calcularTrajeto(montar([via(ponto(0, 0), ponto(6, 0)), via(ponto(4, 0), ponto(10, 0), ponto(10, 10))]));
  assert.equal(trajeto.metros, 18);
  assert.deepEqual(trajeto.pontos.at(-1), ponto(10, 10));
});
