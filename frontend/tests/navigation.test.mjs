import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

const require = createRequire(import.meta.url);
const result = await build({
  stdin: { contents: "export { Layout } from './src/App';", resolveDir: process.cwd() },
  bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic',
  define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'navigation-fixtures', setup(builder) {
    builder.onResolve({ filter: /^(react|react-dom|react-router-dom)(\/.*)?$/ }, (args) => ({ path: require.resolve(args.path), external: true }));
    builder.onResolve({ filter: /context\/AuthContext$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const useAuth = () => globalThis.__navigationAuth;' }));
    // Exercise real layout/route guards, isolating pages that fetch operational data.
    builder.onLoad({ filter: /pages\/[^/]+\.tsx$/ }, (args) => {
      if (args.path.endsWith('/WelcomePage.tsx')) return;
      return { contents: `export default function Page() { return ${JSON.stringify(args.path.split('/').at(-1))}; }` };
    });
  } }],
});
const compiled = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, compiled, compiled.exports);
const { Layout } = compiled.exports;
after(() => { delete globalThis.__navigationAuth; });

const account = { id: 20, email: 'conta@example.com', ativo: true };
function render(auth, path = '/') {
  globalThis.__navigationAuth = { carregando: false, erroSessao: '', vinculos: [], sair: async () => {}, ...auth };
  return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Layout)));
}

for (const perfil of ['morador', 'portaria', 'sindico']) {
  test(`authorized ${perfil} sees original layout and dashboard even with a global identity`, () => {
    const html = render({ usuario: { id: 7, condominio_id: 42, nome: 'Pessoa autorizada', perfil }, contaGlobal: account });
    assert.match(html, /Navegação principal/);
    assert.doesNotMatch(html, /solicite um vínculo|Boas-vindas ao Liven/);
    if (perfil === 'sindico') { assert.match(html, /SyndicDashboardPage/); assert.match(html, /Porteiros/); }
    else assert.match(html, /Olá,/);
    if (perfil === 'morador') { assert.match(html, /Minhas visitas/); assert.doesNotMatch(html, /Controle de acessos/); }
    else { assert.match(html, /Controle de acessos/); assert.match(html, /Moradores/); assert.match(html, /Entregas/); }
  });
}

test('account without membership keeps application shell and sees a limitation inside it', () => {
  const html = render({ usuario: null, contaGlobal: account });
  assert.match(html, /Navegação principal/);
  assert.match(html, /Visão geral/);
  assert.match(html, /solicite um vínculo autorizado/);
  assert.doesNotMatch(html, /Boas-vindas ao Liven|Controle de acessos|href="\/residents"/);
  assert.equal((html.match(/<main\b/g) ?? []).length, 1);
});

test('membership choices stay inside original shell without an invented role', () => {
  const html = render({ usuario: null, contaGlobal: account,
    vinculos: [{ usuario_id: 7, condominio_id: 42, condominio_nome: 'Condomínio autorizado', perfil: 'morador' }] });
  assert.match(html, /Navegação principal/);
  assert.match(html, /Escolha o condomínio/);
  assert.match(html, /Condomínio autorizado/);
  assert.doesNotMatch(html, /Porteiros|SyndicDashboardPage/);
});

test('global account cannot mount protected operational pages through a direct URL', () => {
  const html = render({ usuario: null, contaGlobal: account }, '/deliveries');
  assert.match(html, /Navegação principal/);
  assert.doesNotMatch(html, /DeliveriesPage.tsx/);
});

test('cleared authentication renders login instead of application navigation', () => {
  const html = render({ usuario: null, contaGlobal: null }, '/login');
  assert.match(html, /LoginPage.tsx/);
  assert.doesNotMatch(html, /Navegação principal|DeliveriesPage.tsx/);
});
