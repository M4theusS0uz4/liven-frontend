import { AlertCircle, ArrowRight, ArrowUpRight, Bell, Building2, CalendarDays, DoorOpen, Map, Package, RefreshCw, Shield, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { obterPainelSindico, type PainelSindico } from '../lib/api';

const painelDemo: PainelSindico = {
  total_unidades: 48,
  unidades_ocupadas: 46,
  moradores_ativos: 112,
  porteiros_ativos: 6,
  entregas_pendentes: 14,
  ocorrencias_abertas: 3,
  ocorrencias_em_analise: 2,
  ocorrencias_resolvidas: 8,
  comunicados_ativos: 2,
  acessos_hoje: 37,
};

const numeros = new Intl.NumberFormat('pt-BR');
const percentuais = new Intl.NumberFormat('pt-BR', { style: 'percent' });
const dataLonga = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' });

export default function SyndicDashboardPage() {
  const { usuario, modoDemonstracao } = useAuth();
  const contexto = usuario ? `${usuario.condominio_id}:${usuario.id}` : null;
  const [atualizacao, setAtualizacao] = useState(0);
  const [resultado, setResultado] = useState<{
    contexto: string;
    atualizacao: number;
    dados: PainelSindico | null;
  } | null>(null);

  useEffect(() => {
    if (!contexto || modoDemonstracao) return;
    const controller = new AbortController();
    obterPainelSindico(controller.signal).then(
      (dados) => {
        if (!controller.signal.aborted) setResultado({ contexto, atualizacao, dados });
      },
      () => {
        if (!controller.signal.aborted) setResultado({ contexto, atualizacao, dados: null });
      },
    );
    return () => controller.abort();
  }, [contexto, modoDemonstracao, atualizacao]);

  const respostaAtual = resultado?.contexto === contexto && resultado.atualizacao === atualizacao;
  const dados = modoDemonstracao ? painelDemo : respostaAtual ? resultado.dados : null;
  const carregando = !modoDemonstracao && !respostaAtual;
  const erro = !carregando && !dados;
  const ocupacao = dados?.total_unidades ? dados.unidades_ocupadas / dados.total_unidades : null;
  const nome = usuario?.nome.trim().split(/\s+/)[0];
  const percentual = ocupacao === null ? null : percentuais.format(ocupacao);
  const metricas = [
    { label: 'Unidades cadastradas', valor: dados?.total_unidades, icon: Building2, to: '/units', cor: 'bg-blue-50 text-blue-700' },
    { label: 'Moradores ativos', valor: dados?.moradores_ativos, icon: Users, to: '/residents', cor: 'bg-teal-50 text-teal-700' },
    { label: 'Porteiros ativos', valor: dados?.porteiros_ativos, icon: Shield, to: '/staff', cor: 'bg-violet-50 text-violet-700' },
    { label: 'Acessos hoje (UTC)', valor: dados?.acessos_hoje, icon: DoorOpen, to: '/accesses', cor: 'bg-amber-50 text-amber-800' },
  ];
  const pendencias = [
    { titulo: 'Ocorrências abertas ou em análise', detalhe: 'Acompanhe o atendimento', total: dados && dados.ocorrencias_abertas + dados.ocorrencias_em_analise, icon: AlertCircle, to: '/occurrences', cor: 'bg-amber-50 text-amber-800' },
    { titulo: 'Entregas aguardando retirada', detalhe: 'Consulte as encomendas na portaria', total: dados?.entregas_pendentes, icon: Package, to: '/deliveries', cor: 'bg-blue-50 text-blue-700' },
    { titulo: 'Comunicados ativos', detalhe: 'Gerencie avisos aos moradores', total: dados?.comunicados_ativos, icon: Bell, to: '/announcements', cor: 'bg-violet-50 text-violet-700' },
  ];

  return (
    <section className="space-y-6" aria-labelledby="painel-titulo">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <CalendarDays size={17} aria-hidden="true" />
          <time>{dataLonga.format(new Date())}</time>
        </p>
        {!modoDemonstracao && (
          <button
            type="button"
            disabled={carregando}
            onClick={() => setAtualizacao((anterior) => anterior + 1)}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-surface-hover disabled:opacity-60"
          >
            <RefreshCw size={15} aria-hidden="true" />
            {carregando ? 'Atualizando…' : 'Atualizar dados'}
          </button>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <header className="operations-hero flex flex-col justify-between rounded-3xl px-5 py-7 text-white sm:px-8 sm:py-8">
          <div>
            <p className="mb-3 text-sm font-semibold text-[#a8e8da]">Painel do síndico</p>
            <h1 id="painel-titulo" className="break-words text-4xl font-bold tracking-tight sm:text-5xl">
              Olá{nome ? `, ${nome}` : ''}.
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-200 sm:text-base">
              Veja o que precisa de atenção no condomínio e acesse as ferramentas da operação.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/map" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#a8e8da] px-4 py-2 text-sm font-bold text-[#10263d] motion-safe:transition-colors hover:bg-[#c5f4e8]">
              <Map size={17} aria-hidden="true" /> Explorar mapa 3D
            </Link>
            <Link to="/accesses" className="operations-secondary inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white motion-safe:transition-colors">
              Controle de acessos <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </header>

        <section className="flex flex-col justify-between rounded-3xl border border-border bg-white p-5 sm:p-7" aria-labelledby="ocupacao-titulo" aria-busy={carregando}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="ocupacao-titulo" className="text-lg font-bold tracking-tight text-slate-950">Ocupação das unidades</h2>
              <p className="mt-1 text-sm text-slate-600">
                {dados ? `${numeros.format(dados.unidades_ocupadas)} de ${numeros.format(dados.total_unidades)} unidades` : carregando ? 'Carregando indicadores…' : 'Dados indisponíveis'}
              </p>
            </div>
            <Building2 size={19} className="shrink-0 text-teal-800" aria-hidden="true" />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="occupation-ring grid size-[100px] shrink-0 place-items-center rounded-full"
              style={{ background: `conic-gradient(#087763 ${Math.min(ocupacao ?? 0, 1) * 360}deg, #dceae7 0deg)` }}>
              <span className="grid size-[82px] place-items-center rounded-full bg-white text-2xl font-bold tracking-tight text-slate-950 tabular-nums">
                {percentual ?? '—'}
              </span>
            </div>
            <Link to="/units" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-bold text-teal-800 underline decoration-teal-700/40 underline-offset-4 hover:decoration-current">
              Ver unidades <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>

      {erro && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">Não foi possível carregar os indicadores. Use “Atualizar dados” para tentar novamente.</p>}

      <section aria-label="Indicadores do condomínio" aria-busy={carregando} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricas.map(({ label, valor, icon: Icon, to, cor }) => (
          <Link key={to} to={to} className="group rounded-2xl border border-border bg-white p-4 motion-safe:transition-colors hover:border-brand hover:bg-surface-hover sm:p-5">
            <div className="flex items-center justify-between">
              <span className={`grid size-10 place-items-center rounded-xl ${cor}`}><Icon size={20} aria-hidden="true" /></span>
              <ArrowUpRight size={18} className="text-slate-600 motion-safe:transition-colors group-hover:text-brand" aria-hidden="true" />
            </div>
            <p className="mt-4 text-sm font-medium text-slate-600">{label}</p>
            <p className="mt-0.5 text-3xl font-bold tracking-tight text-slate-950 tabular-nums">{valor === undefined ? '—' : numeros.format(valor)}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-white" aria-labelledby="central-titulo">
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <h2 id="central-titulo" className="text-lg font-bold">Central de acompanhamento</h2>
        </div>
        <ul className="divide-y divide-border">
          {pendencias.map(({ titulo, detalhe, total, icon: Icon, to, cor }) => (
            <li key={to} className="last:[&_a]:rounded-b-2xl">
              <Link to={to} className="group flex items-center gap-3 px-4 py-4 motion-safe:transition-colors hover:bg-surface-hover sm:px-6">
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${cor}`}><Icon size={19} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm font-semibold text-slate-900">{titulo}</strong>
                  <span className="block text-xs text-slate-600">{detalhe}</span>
                </span>
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-semibold tabular-nums">{total == null ? '—' : numeros.format(total)}</span>
                <ArrowRight size={17} className="shrink-0 text-slate-500 transition group-hover:text-brand" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
