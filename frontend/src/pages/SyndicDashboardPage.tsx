import { AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, Building2, CalendarDays, DoorOpen, Package, RefreshCw, Shield, Users } from 'lucide-react';
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
        <p className="flex items-center gap-2 text-sm font-medium capitalize text-slate-600">
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

      <header className="operations-hero grid items-center gap-8 rounded-3xl px-6 py-8 text-white sm:px-9 sm:py-10 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative">
          <p className="mb-3 text-xs font-bold tracking-[.16em] text-sky-200 uppercase">Painel do síndico</p>
          <h1 id="painel-titulo" className="max-w-xl text-3xl font-bold tracking-tight sm:text-5xl">Olá{nome ? `, ${nome}` : ''}.</h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-200 sm:text-base">
            Acompanhe a operação do condomínio e veja o que precisa da sua atenção.
          </p>
          <Link to="/accesses" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-sky-100">
            Controle de acessos <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="relative flex items-center gap-4 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 sm:gap-5 sm:px-6">
          <div
            aria-hidden="true"
            className="grid size-[88px] shrink-0 place-items-center rounded-full"
            style={{ background: `conic-gradient(#7dd3fc ${Math.min(ocupacao ?? 0, 1) * 360}deg, #39546c 0deg)` }}
          >
            <span className="grid size-[74px] place-items-center rounded-full bg-[#18334c] text-xl font-bold tabular-nums">
              {ocupacao === null ? '—' : percentuais.format(ocupacao)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-semibold">Ocupação das unidades</p>
            <p className="mt-1 text-sm text-sky-100">
              {dados ? `${numeros.format(dados.unidades_ocupadas)} de ${numeros.format(dados.total_unidades)} unidades` : carregando ? 'Carregando indicadores…' : 'Dados indisponíveis'}
            </p>
            {ocupacao !== null && <span className="sr-only">{percentuais.format(ocupacao)} de ocupação</span>}
          </div>
        </div>
      </header>

      {erro && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">Não foi possível carregar os indicadores. Use “Atualizar dados” para tentar novamente.</p>}

      <section aria-label="Indicadores do condomínio" aria-busy={carregando} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricas.map(({ label, valor, icon: Icon, to, cor }) => (
          <Link key={to} to={to} className="group rounded-2xl border border-border bg-white p-5 shadow-xs transition hover:border-brand/50">
            <div className="flex items-center justify-between">
              <span className={`grid size-10 place-items-center rounded-xl ${cor}`}><Icon size={20} aria-hidden="true" /></span>
              <ArrowUpRight size={18} className="text-slate-400 transition group-hover:text-brand" aria-hidden="true" />
            </div>
            <p className="mt-4 text-sm font-medium text-slate-600">{label}</p>
            <p className="mt-0.5 text-3xl font-bold tracking-tight text-slate-950 tabular-nums">{valor === undefined ? '—' : numeros.format(valor)}</p>
          </Link>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-xs" aria-labelledby="central-titulo">
        <div className="flex items-center gap-3 border-b border-border px-4 py-4 sm:px-6">
          <ArrowDownRight size={19} className="text-brand" aria-hidden="true" />
          <h2 id="central-titulo" className="text-lg font-bold">Central de acompanhamento</h2>
        </div>
        <ul className="divide-y divide-border">
          {pendencias.map(({ titulo, detalhe, total, icon: Icon, to, cor }) => (
            <li key={to}>
              <Link to={to} className="group flex items-center gap-3 px-4 py-4 transition hover:bg-surface-hover sm:px-6">
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
