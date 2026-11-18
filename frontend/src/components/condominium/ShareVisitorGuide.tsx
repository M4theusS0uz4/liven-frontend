import { Clipboard, ExternalLink, MapPin } from 'lucide-react';
import { useState } from 'react';
import type { Mapa } from '../../lib/api';
import { destinosVisitante, gerarFragmentoGuia } from '../../lib/visitorGuide';

export default function ShareVisitorGuide({ mapa }: { mapa: Mapa }) {
  const [entradaId, setEntradaId] = useState('');
  const [destinoChave, setDestinoChave] = useState('');
  const [copiado, setCopiado] = useState('');
  const destinos = destinosVisitante(mapa);
  const entrada = mapa.portarias.find(({ id }) => String(id) === entradaId);
  const destino = destinos.find(({ chave }) => chave === destinoChave);
  const fragmento = entrada && destino ? gerarFragmentoGuia(mapa, entrada, destino) : null;
  const link = fragmento ? new URL(`/guia${fragmento}`, window.location.origin).href : null;
  const temReferencias = mapa.portarias.length > 0 && destinos.length > 0;

  return (
    <section className="rounded-2xl border border-border bg-white p-5 sm:p-6" aria-labelledby="compartilhar-guia">
      <h2 id="compartilhar-guia" className="flex items-center gap-2 text-lg font-bold"><MapPin size={19} className="text-teal-800" aria-hidden="true" /> Guia 3D do visitante</h2>
      {temReferencias ? (
        <>
          <p className="mt-2 text-sm text-slate-700">Escolha a portaria e o destino. Quem receber o link poderá ver essas referências e as vias da planta sem entrar no Liven.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">Portaria de entrada
              <select value={entradaId} onChange={(event) => { setEntradaId(event.target.value); setCopiado(''); }} className="mt-1 block min-h-11 w-full rounded-xl border border-border bg-white px-3">
                <option value="">Escolha a portaria</option>
                {mapa.portarias.map(({ id, nome }) => <option key={id} value={id}>{nome}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold">Destino da visita
              <select value={destinoChave} onChange={(event) => { setDestinoChave(event.target.value); setCopiado(''); }} className="mt-1 block min-h-11 w-full rounded-xl border border-border bg-white px-3">
                <option value="">Escolha o destino</option>
                {destinos.map(({ chave, nome, tipo }) => <option key={chave} value={chave}>{tipo === 'bloco' ? 'Edifício ou setor' : tipo === 'casa' ? 'Residência' : 'Área comum'} · {nome}</option>)}
              </select>
            </label>
          </div>
          {entrada && destino && !link && <p role="alert" className="mt-3 text-sm text-amber-900">A planta excede os limites do guia ou contém referências inválidas.</p>}
          {link && (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={link} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#125948] px-4 text-sm font-bold text-white hover:bg-teal-950">
                  <ExternalLink size={16} aria-hidden="true" /> Abrir guia
                </a>
                <button type="button" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    setCopiado('Link copiado.');
                  } catch {
                    setCopiado('Abra o guia e copie o endereço pela barra do navegador.');
                  }
                }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold hover:bg-surface-hover">
                  <Clipboard size={16} aria-hidden="true" /> Copiar link
                </button>
              </div>
              <p role="status" className="mt-2 text-sm text-slate-700">{copiado}</p>
            </>
          )}
        </>
      ) : <p className="mt-2 text-sm text-slate-700">Adicione uma portaria e um edifício, área comum ou casa posicionada na planta para gerar o guia.</p>}
    </section>
  );
}
