import { Pencil, Plus, Shield, UserRoundCheck, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import RecordPhoto, { PhotoPicker } from '../components/RecordPhoto';
import { lerEquipeDemo, salvarEquipeDemo } from '../lib/demo';
import { useAuth } from '../context/AuthContext';
import { atualizarPorteiro, atualizarStatusPorteiro, criarPorteiro, listarPorteiros, type Porteiro } from '../lib/api';
import { dadosAlteracaoFoto, type AlteracaoFoto } from '../lib/photos';

type PorteiroTela = Porteiro & { fotoDemo?: string };
const turnos = ['Manhã', 'Tarde', 'Noite', '12x36'];

export default function StaffPage() {
  const { modoDemonstracao } = useAuth();
  const [porteiros, setPorteiros] = useState<PorteiroTela[]>(() => modoDemonstracao ? lerEquipeDemo() : []);
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<PorteiroTela | null>(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [turno, setTurno] = useState('Manhã');
  const [foto, setFoto] = useState<AlteracaoFoto>();
  const [carregando, setCarregando] = useState(!modoDemonstracao);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (modoDemonstracao) salvarEquipeDemo(porteiros);
  }, [modoDemonstracao, porteiros]);

  useEffect(() => {
    if (modoDemonstracao) return;
    const controller = new AbortController();
    listarPorteiros(controller.signal)
      .then((dados) => { if (!controller.signal.aborted) setPorteiros(dados); })
      .catch((error: Error) => { if (!controller.signal.aborted) setErro(error.message); })
      .finally(() => { if (!controller.signal.aborted) setCarregando(false); });
    return () => controller.abort();
  }, [modoDemonstracao]);

  const abrir = (porteiro?: PorteiroTela) => {
    setEditando(porteiro ?? null);
    setNome(porteiro?.nome ?? '');
    setTelefone(porteiro?.telefone ?? '');
    setTurno(porteiro?.turno ?? 'Manhã');
    setFoto(undefined);
    setErro('');
    setAberto(true);
  };

  const salvar = async (event: FormEvent) => {
    event.preventDefault();
    if (ocupado) return;
    setOcupado(true);
    setErro('');
    try {
      const alteracao = await dadosAlteracaoFoto(foto);
      const dados = { nome: nome.trim(), telefone, turno };
      const salvo: PorteiroTela = modoDemonstracao
        ? { ...dados, id: editando?.id ?? Date.now(), ativo: editando?.ativo ?? true, fotoDemo: alteracao.foto === undefined ? editando?.fotoDemo : alteracao.foto ?? undefined }
        : editando ? await atualizarPorteiro(editando.id, { ...dados, ...alteracao }) : await criarPorteiro({ ...dados, ...alteracao });
      setPorteiros((lista) => editando ? lista.map((item) => item.id === salvo.id ? salvo : item) : [salvo, ...lista]);
      setAberto(false);
    } catch (error) {
      setErro((error as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const alternarStatus = async (porteiro: PorteiroTela) => {
    setOcupado(true);
    setErro('');
    try {
      const atualizado = modoDemonstracao
        ? { ...porteiro, ativo: !porteiro.ativo }
        : await atualizarStatusPorteiro(porteiro.id, !porteiro.ativo);
      setPorteiros((lista) => lista.map((item) => item.id === atualizado.id ? atualizado : item));
    } catch (error) {
      setErro((error as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Porteiros</h1><p className="mt-2 text-sm text-slate-600">Gerencie a equipe responsável pela portaria.</p></div>
        <button disabled={carregando || ocupado} onClick={() => abrir()} className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white disabled:opacity-60"><Plus size={18} /> Adicionar porteiro</button>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="glass flex items-center gap-4 rounded-2xl p-4"><Shield className="text-brand" aria-hidden="true" /><div><strong className="block text-xl">{porteiros.filter((item) => item.ativo).length}</strong><span className="text-sm text-slate-600">Porteiros ativos</span></div></div>
        <div className="glass flex items-center gap-4 rounded-2xl p-4"><UserRoundCheck className="text-teal-800" aria-hidden="true" /><div><strong className="block text-xl">{porteiros.length}</strong><span className="text-sm text-slate-600">Cadastros totais</span></div></div>
      </div>
      {erro && !aberto && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</p>}
      {carregando && <p role="status" className="text-sm text-slate-600">Carregando equipe…</p>}
      {!carregando && !erro && !porteiros.length && <p className="glass rounded-2xl p-6 text-center text-sm text-slate-600">Nenhum porteiro cadastrado.</p>}
      <div className="grid gap-3 xl:grid-cols-2">
        {porteiros.map((porteiro) => (
          <article key={porteiro.id} className="glass flex flex-wrap items-center gap-3 rounded-2xl p-4">
            <RecordPhoto origem={{ colecao: 'porteiros', registro: porteiro }} fotoLocal={porteiro.fotoDemo} />
            <div className="min-w-0 flex-1">
              <h2 className="break-words font-bold">{porteiro.nome}</h2>
              <p className="mt-1 text-sm text-slate-600">{porteiro.telefone} · {porteiro.turno}</p>
              <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-bold ${porteiro.ativo ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{porteiro.ativo ? 'Ativo' : 'Inativo'}</span>
            </div>
            <button disabled={ocupado} onClick={() => abrir(porteiro)} aria-label={`Editar ${porteiro.nome}`} className="rounded-lg p-3 text-slate-700 hover:bg-surface-hover"><Pencil size={17} /></button>
            <button disabled={ocupado} onClick={() => void alternarStatus(porteiro)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-surface-hover">{porteiro.ativo ? 'Desativar' : 'Ativar'}</button>
          </article>
        ))}
      </div>
      {aberto && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-slate-900/55 p-4">
          <form onSubmit={salvar} aria-labelledby="porteiro-form-titulo" className="glass max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2"><h2 id="porteiro-form-titulo" className="text-xl font-bold">{editando ? 'Editar porteiro' : 'Adicionar porteiro'}</h2><button type="button" disabled={ocupado} onClick={() => setAberto(false)} aria-label="Fechar" className="rounded-lg p-2 hover:bg-surface-hover"><X size={18} /></button></div>
            {erro && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
            <fieldset disabled={ocupado} className="min-w-0 space-y-4">
              <label className="block text-sm font-semibold">Nome<input required minLength={2} maxLength={150} value={nome} onChange={(event) => setNome(event.target.value)} className="mt-1 w-full rounded-xl border border-border px-3 py-2.5" /></label>
              <label className="block text-sm font-semibold">Telefone<input required type="tel" minLength={8} maxLength={25} value={telefone} onChange={(event) => setTelefone(event.target.value)} className="mt-1 w-full rounded-xl border border-border px-3 py-2.5" /></label>
              <label className="block text-sm font-semibold">Turno<select value={turno} onChange={(event) => setTurno(event.target.value)} className="mt-1 w-full rounded-xl border border-border px-3 py-2.5">{[...new Set([...turnos, turno])].map((opcao) => <option key={opcao}>{opcao}</option>)}</select></label>
              <PhotoPicker origem={editando && !modoDemonstracao ? { colecao: 'porteiros', registro: editando } : undefined} fotoLocal={editando?.fotoDemo} foto={foto} onChange={setFoto} />
              <button className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{ocupado ? 'Salvando…' : 'Salvar porteiro'}</button>
            </fieldset>
          </form>
        </div>
      )}
    </section>
  );
}
