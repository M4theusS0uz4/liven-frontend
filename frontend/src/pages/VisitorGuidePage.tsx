import { Building2, Compass, Route, Crosshair, DoorOpen, MapPin, Minus, Plus, Rotate3D } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import CondominiumMap, { type AcaoCamera, type AlvoMapa, type UnidadeMapa } from '../components/condominium/CondominiumMap';
import type { Mapa } from '../lib/api';
import { calcularTrajeto } from '../lib/visitorRoute';
import { lerFragmentoGuia, type GuiaVisitante } from '../lib/visitorGuide';

type Trajeto = ReturnType<typeof calcularTrajeto>;

function PlantaSimplificada({ guia, trajeto }: { guia: GuiaVisitante; trajeto: Trajeto }) {
  const { entrada, destino, vias, entorno } = guia;
  const construcoes = [...(entorno?.blocos ?? []), ...(entorno?.areas ?? []), destino];
  const pontos = [entrada, destino, ...vias.flatMap((via) => via.pontos)];
  const largura = Math.max(guia.largura, ...pontos.map(({ x }) => x), ...construcoes.map((item) => item.x + Math.hypot(item.largura, item.altura) / 2));
  const altura = Math.max(guia.altura, ...pontos.map(({ y }) => y), ...construcoes.map((item) => item.y + Math.hypot(item.largura, item.altura) / 2));
  const margem = Math.max(largura, altura) * 0.12;
  const raio = margem * 0.38;
  return (
    <figure className="p-4">
      <svg
        className="h-72 w-full rounded-xl bg-slate-100"
        viewBox={`${-margem} ${-margem} ${largura + 2 * margem} ${altura + 2 * margem}`}
        role="img"
        aria-label={`Planta simplificada. Ponto 1: ${entrada.nome}. Ponto 2: ${destino.nome}.`}
      >
        <rect width={largura} height={altura} rx={raio / 2} fill="#fff" stroke="#a7b6bc" />
        {vias.map(({ pontos, largura }, index) => (
          <polyline key={index} points={pontos.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" stroke="#687c86" strokeWidth={largura} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {construcoes.map((item, index) => (
          <rect key={index}
            x={item.x - item.largura / 2} y={item.y - item.altura / 2} width={item.largura} height={item.altura}
            transform={`rotate(${-item.rotacao} ${item.x} ${item.y})`}
            fill={item === destino ? '#88bdb0' : 'andares' in item ? '#c1d1da' : '#bdd9bd'}
            stroke="#647d80" strokeWidth={0.4}
          />
        ))}
        {trajeto && <polyline points={trajeto.pontos.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" stroke="#00a080" strokeWidth={raio * 0.48} strokeLinejoin="round" strokeLinecap="round" />}
        {[entrada, destino].map(({ x, y }, index) => (
          <g key={index} transform={`translate(${x} ${y})`}>
            <circle r={raio} fill={index ? '#125948' : '#173d70'} />
            <text textAnchor="middle" dominantBaseline="central" fontSize={raio} fontWeight="bold" fill="white">{index + 1}</text>
          </g>
        ))}
      </svg>
      <figcaption className="mt-3 text-sm text-slate-700">1 · Entrada &nbsp; 2 · Destino</figcaption>
    </figure>
  );
}

function Visualizacao({ guia, trajeto }: { guia: GuiaVisitante; trajeto: Trajeto }) {
  const [camera, setCamera] = useState<{ id: number; action: AcaoCamera } | null>(null);
  const [sem3D, setSem3D] = useState(false);
  const [planta, setPlanta] = useState(false);
  const { destino, entrada } = guia;
  const { mapa, unidades, alvo } = useMemo(() => {
    const casa: UnidadeMapa = { id: '1', bloco: '', numero: destino.nome, andar: null, tipoResidencia: 'casa', status: 'vazia' };
    const mapa: Mapa = {
      id: 0,
      nome: 'Guia de visita',
      tipo_condominio: guia.entorno?.tipo ?? (destino.tipo === 'bloco' && destino.andares === 1 ? 'horizontal' : 'vertical'),
      largura: guia.largura,
      altura: guia.altura,
      blocos: [
        ...(destino.tipo === 'bloco' ? [{ ...destino, id: 1 }] : []),
        ...(guia.entorno?.blocos ?? []).map((bloco, index) => ({ ...bloco, id: index + 2 })),
      ],
      unidades: destino.tipo === 'casa'
        ? [{ ...destino, id: 1, unidade_id: 1, bloco: '', numero: destino.nome, tipo_residencia: 'casa', status: 'vazia' }]
        : [],
      areas_comuns: [
        ...(destino.tipo === 'area' ? [{ ...destino, tipo: destino.tipoArea ?? 'lazer', id: 1 }] : []),
        ...(guia.entorno?.areas ?? []).map((area, index) => ({ ...area, id: index + 2 })),
      ],
      portarias: [{ ...entrada, id: 1 }],
      ruas: guia.vias.map((via, id) => ({ ...via, id, nome: '' })),
    };
    const alvo: AlvoMapa = { kind: destino.tipo === 'casa' ? 'unidade' : destino.tipo, id: 1 };
    return { mapa, unidades: destino.tipo === 'casa' ? [casa] : [], alvo };
  }, [guia, destino, entrada]);

  return (
    <section className="min-w-0 overflow-hidden rounded-3xl border border-border bg-white" aria-label="Visualização do guia">
      {!sem3D && (
        <div className="flex gap-2 border-b border-border bg-white p-3" aria-label="Formato do mapa">
          <button type="button" aria-pressed={!planta} onClick={() => setPlanta(false)} className="rounded-lg px-3 py-2 text-sm font-semibold aria-pressed:bg-[#125948] aria-pressed:text-white">Mapa 3D</button>
          <button type="button" aria-pressed={planta} onClick={() => setPlanta(true)} className="rounded-lg px-3 py-2 text-sm font-semibold aria-pressed:bg-[#125948] aria-pressed:text-white">Planta 2D</button>
        </div>
      )}
      {sem3D || planta ? (
        <>
          {sem3D && <p role="status" className="px-4 pt-4 text-sm text-slate-700">O 3D está indisponível. Veja a planta 2D abaixo.</p>}
          <PlantaSimplificada guia={guia} trajeto={trajeto} />
        </>
      ) : (
        <>
          <CondominiumMap mapa={mapa} unidades={unidades} cameraAction={camera} modoVisitante destinoVisitante={alvo} trajetoVisitante={trajeto?.pontos} onRendererUnavailable={() => setSem3D(true)} />
          <div className="flex flex-wrap items-center gap-2 border-t border-border p-3">
            <button type="button" onClick={() => setCamera({ id: Date.now(), action: 'rotate' })} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-surface-hover">
              <Rotate3D size={17} aria-hidden="true" /> Vista 3D
            </button>
            <button type="button" onClick={() => setCamera({ id: Date.now(), action: 'top' })} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-surface-hover">
              <Crosshair size={17} aria-hidden="true" /> Vista superior
            </button>
            <button type="button" onClick={() => setCamera({ id: Date.now(), action: 'zoom-in' })} aria-label="Aproximar" className="grid size-11 place-items-center rounded-xl border border-border hover:bg-surface-hover">
              <Plus size={19} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setCamera({ id: Date.now(), action: 'zoom-out' })} aria-label="Afastar" className="grid size-11 place-items-center rounded-xl border border-border hover:bg-surface-hover">
              <Minus size={19} aria-hidden="true" />
            </button>
            <p className="px-1 text-xs text-slate-700 max-sm:hidden">Arraste para girar o mapa.</p>
          </div>
        </>
      )}
    </section>
  );
}

export default function VisitorGuidePage() {
  const { hash } = useLocation();
  const guia = useMemo(() => lerFragmentoGuia(hash), [hash]);
  const trajeto = useMemo(() => guia ? calcularTrajeto(guia) : null, [guia]);

  return (
    <main className="min-h-dvh bg-[#edf5f3] px-4 py-5 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="operations-hero rounded-3xl px-5 py-6 text-white sm:px-8">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#a8e8da]"><Building2 size={18} aria-hidden="true" /> Liven · Guia do visitante</p>
          <h1 className="mt-2 break-words text-3xl font-bold tracking-tight sm:text-4xl">{guia?.destino.nome ?? 'Guia indisponível'}</h1>
        </header>
        {guia ? (
          <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <section className="min-w-0 rounded-3xl border border-border bg-white p-5" aria-labelledby="guia-referencias">
              <h2 id="guia-referencias" className="flex items-center gap-2 font-bold"><Compass size={18} className="text-teal-800" aria-hidden="true" /> Referências da visita</h2>
              <dl className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-1 lg:gap-4">
                <div className="rounded-xl bg-blue-50 px-3 py-2.5 text-blue-950">
                  <dt className="flex items-center gap-2 text-xs font-semibold"><DoorOpen size={15} aria-hidden="true" /> 1 · Entrada</dt>
                  <dd className="mt-1 break-words font-bold">{guia.entrada.nome}</dd>
                </div>
                <div className="rounded-xl bg-teal-50 px-3 py-2.5 text-teal-950">
                  <dt className="flex items-center gap-2 text-xs font-semibold"><MapPin size={15} aria-hidden="true" /> 2 · Destino</dt>
                  <dd className="mt-1 break-words font-bold">{guia.destino.nome}</dd>
                </div>
              </dl>
              {trajeto ? (
                <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 px-3 py-3 text-teal-950">
                  <p className="flex items-center gap-2 text-sm font-bold"><Route size={17} aria-hidden="true" /> Cerca de {Math.max(1, Math.round(trajeto.metros))} m pelas vias</p>
                  <p className="mt-1 text-xs leading-relaxed">Siga o traçado verde até a referência mais próxima do destino.</p>
                </div>
              ) : <p className="mt-4 text-sm leading-relaxed text-slate-700">O mapa ainda não tem um caminho conectado entre estas referências. Confirme o percurso na portaria.</p>}
              <p className="mt-3 text-xs text-slate-600">A portaria confirma a entrada e a acessibilidade do caminho.</p>
            </section>
            <Visualizacao key={hash} guia={guia} trajeto={trajeto} />
          </div>
        ) : <p role="alert" className="rounded-2xl border border-border bg-white p-5 text-slate-800">O link está incompleto ou inválido. Peça um novo guia à pessoa que enviou a visita.</p>}
      </div>
    </main>
  );
}
