import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowRight, Car, Check, Clock3, DoorOpen, QrCode, ScanFace, Search, ShieldCheck, UserRound, UserRoundCheck, X } from 'lucide-react';
import FacialCapture from '../components/FacialCapture';
import QrScanner from '../components/QrScanner';
import { atualizarMorador, listarMoradores, listarUnidades, listarVeiculos, type Morador, type Unidade, type Veiculo } from '../lib/api';
import { carregarVisitas, salvarVisitas, type VisitAccess, type VisitAccessStatus } from '../lib/visits';

type Aba = 'visitas' | 'moradores' | 'veiculos';
const statusLabel: Record<VisitAccessStatus, string> = { authorized: 'Autorizada', inside: 'No condomínio', exited: 'Saiu', denied: 'Recusada' };
const statusStyle: Record<VisitAccessStatus, string> = { authorized: 'bg-emerald-50 text-emerald-700', inside: 'bg-blue-50 text-blue-700', exited: 'bg-slate-100 text-slate-600', denied: 'bg-red-50 text-red-700' };

export default function AccessPage() {
  const [aba, setAba] = useState<Aba>('visitas');
  const [visitas, setVisitas] = useState<VisitAccess[]>(() => carregarVisitas() ?? []);
  const [moradores, setMoradores] = useState<Morador[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [qrAberto, setQrAberto] = useState(false);
  const [modoLeitura, setModoLeitura] = useState<'qr' | 'facial'>('qr');
  const [codigoLido, setCodigoLido] = useState('');
  const [modalManual, setModalManual] = useState(false);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [unidade, setUnidade] = useState('');
  const [autorizador, setAutorizador] = useState('');
  const [placa, setPlaca] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [salvandoMorador, setSalvandoMorador] = useState<number | null>(null);
  const [visitaFacial, setVisitaFacial] = useState<VisitAccess | null>(null);
  const [fotoConferenciaPronta, setFotoConferenciaPronta] = useState(false);

  useEffect(() => {
    salvarVisitas(visitas);
  }, [visitas]);

  useEffect(() => {
    Promise.allSettled([listarMoradores(), listarUnidades(), listarVeiculos()]).then(([moradoresResult, unidadesResult, veiculosResult]) => {
      if (moradoresResult.status === 'fulfilled') setMoradores(moradoresResult.value);
      if (unidadesResult.status === 'fulfilled') setUnidades(unidadesResult.value);
      if (veiculosResult.status === 'fulfilled') setVeiculos(veiculosResult.value);
      const failed = [moradoresResult, unidadesResult, veiculosResult].find((result) => result.status === 'rejected');
      if (failed?.status === 'rejected') setErro((failed.reason as Error).message);
    }).finally(() => setCarregando(false));
  }, []);

  const visitantesFiltrados = useMemo(() => visitas.filter((visita) => `${visita.nome} ${visita.telefone} ${visita.codigo} ${visita.placa ?? ''} ${visita.unidade}`.toLowerCase().includes(busca.toLowerCase())), [busca, visitas]);
  const moradoresFiltrados = useMemo(() => moradores.filter((morador) => `${morador.nome} ${morador.telefone ?? ''} ${morador.cpf ?? ''}`.toLowerCase().includes(busca.toLowerCase())), [busca, moradores]);
  const veiculosFiltrados = useMemo(() => veiculos.filter((veiculo) => `${veiculo.placa} ${veiculo.modelo} ${veiculo.marca ?? ''} ${moradores.find((morador) => morador.id === veiculo.morador_id)?.nome ?? ''}`.toLowerCase().includes(busca.toLowerCase())), [busca, moradores, veiculos]);
  const encontrados = visitas.find((visita) => visita.codigo === codigoLido);
  const unidadeDoMorador = (morador: Morador) => {
    const vinculada = unidades.find((item) => item.id === morador.unidade_id);
    return vinculada ? `${vinculada.bloco} · ${vinculada.numero}` : `Residência ${morador.unidade_id}`;
  };

  const mudarStatus = (id: number, status: VisitAccessStatus) => {
    const visita = visitas.find((item) => item.id === id);
    if (status === 'inside' && visita?.tipo === 'facial') {
      setVisitaFacial(visita);
      setFotoConferenciaPronta(false);
      return;
    }
    setVisitas((lista) => lista.map((visita) => visita.id === id ? { ...visita, status, ativa: status === 'authorized' || status === 'inside' } : visita));
  };

  const concluirConferenciaFacial = (status: 'inside' | 'denied') => {
    if (!visitaFacial || !fotoConferenciaPronta) return;
    setVisitas((lista) => lista.map((visita) => visita.id === visitaFacial.id ? { ...visita, status, ativa: status === 'inside' } : visita));
    setVisitaFacial(null);
    setFotoConferenciaPronta(false);
  };

  const registrarManual = (event: FormEvent) => {
    event.preventDefault();
    if (!confirmado) return;
    const id = Date.now();
    setVisitas((lista) => [{ id, nome: nome.trim(), telefone: telefone.trim(), tipo: 'manual', codigo: `manual-${id}`, ativa: true, status: 'inside', unidade: unidade.trim(), autorizadoPor: autorizador.trim(), placa: placa.trim().toUpperCase() || undefined, createdAt: new Date().toISOString() }, ...lista]);
    setNome(''); setTelefone(''); setUnidade(''); setAutorizador(''); setPlaca(''); setConfirmado(false); setModalManual(false); setBusca(''); setAba('visitas');
  };

  const alternarMorador = async (morador: Morador) => {
    setSalvandoMorador(morador.id); setErro('');
    try {
      const salvo = await atualizarMorador(morador.id, { unidade_id: morador.unidade_id, nome: morador.nome, cpf: morador.cpf, email: morador.email, telefone: morador.telefone, foto_facial_path: morador.foto_facial_path, ativo: !morador.ativo });
      setMoradores((lista) => lista.map((item) => item.id === salvo.id ? salvo : item));
    } catch (error) { setErro((error as Error).message); }
    finally { setSalvandoMorador(null); }
  };

  const abas: { id: Aba; label: string; icon: typeof UserRound }[] = [{ id: 'visitas', label: 'Visitantes', icon: UserRound }, { id: 'moradores', label: 'Moradores', icon: UserRoundCheck }, { id: 'veiculos', label: 'Veículos', icon: Car }];

  return <section className="space-y-7">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-brand text-xs font-black tracking-[.25em]">OPERAÇÃO DA PORTARIA</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Controle de acessos</h1><p className="mt-2 text-slate-500">Confira autorizações e registre movimentações do condomínio.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => { setQrAberto((aberto) => !aberto); setCodigoLido(''); }} className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-bold text-slate-700"><QrCode size={17}/>{qrAberto ? 'Fechar leitor' : 'Ler com câmera'}</button><button onClick={() => setModalManual(true)} className="gradient-brand inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-black text-white"><DoorOpen size={17}/>Liberar visitante</button></div></header>

    <div className="grid gap-3 sm:grid-cols-3"><div className="glass rounded-xl p-4"><span className="flex items-center gap-2 text-sm font-bold text-slate-500"><Clock3 size={16}/>Aguardando entrada</span><strong className="mt-2 block text-2xl">{visitas.filter((item) => item.status === 'authorized').length}</strong></div><div className="glass rounded-xl p-4"><span className="flex items-center gap-2 text-sm font-bold text-slate-500"><DoorOpen size={16}/>Dentro do condomínio</span><strong className="mt-2 block text-2xl">{visitas.filter((item) => item.status === 'inside').length}</strong></div><div className="glass rounded-xl p-4"><span className="flex items-center gap-2 text-sm font-bold text-slate-500"><ShieldCheck size={16}/>Moradores ativos</span><strong className="mt-2 block text-2xl">{moradores.filter((item) => item.ativo).length}</strong></div></div>

    {qrAberto && <div className="glass space-y-4 rounded-xl p-4"><div><h2 className="font-black">Escolha o tipo de leitura</h2><p className="mt-1 text-sm text-slate-500">Selecione como o visitante será conferido na portaria.</p></div><div className="inline-flex rounded-lg border border-border bg-surface p-1" role="group" aria-label="Tipo de leitura"><button type="button" aria-pressed={modoLeitura === 'qr'} onClick={() => { setModoLeitura('qr'); setCodigoLido(''); }} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold ${modoLeitura === 'qr' ? 'bg-brand text-white' : 'text-slate-600 hover:bg-surface-hover'}`}><QrCode size={16}/>QR Code</button><button type="button" aria-pressed={modoLeitura === 'facial'} onClick={() => { setModoLeitura('facial'); setCodigoLido(''); }} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold ${modoLeitura === 'facial' ? 'bg-brand text-white' : 'text-slate-600 hover:bg-surface-hover'}`}><ScanFace size={16}/>Facial</button></div>{modoLeitura === 'qr' ? <div className="grid gap-4 md:grid-cols-2"><div><h3 className="font-bold">Ler convite QR</h3><p className="mt-1 text-sm text-slate-500">Aponte a câmera para o código ou digite-o manualmente.</p><div className="mt-3"><QrScanner onDetected={setCodigoLido}/></div></div><div className="space-y-3"><label className="block text-sm font-bold text-slate-700">Código do convite<input value={codigoLido} onChange={(event) => setCodigoLido(event.target.value.trim())} placeholder="liven-visit-..." className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-brand"/></label>{codigoLido && (encontrados ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm"><p className="font-black text-emerald-800">{encontrados.nome}</p><p className="mt-1 text-emerald-700">{encontrados.unidade} · {statusLabel[encontrados.status]}</p>{encontrados.status === 'authorized' ? <button onClick={() => mudarStatus(encontrados.id, 'inside')} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 font-bold text-white"><Check size={16}/>Conferir e registrar entrada</button> : <p className="mt-2 text-amber-800">Este convite não está aguardando entrada.</p>}</div> : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Código não encontrado entre os convites cadastrados.</p>)}</div></div> : <div className="space-y-3"><div><h3 className="font-bold">Conferência facial</h3><p className="mt-1 text-sm text-slate-500">Selecione um convite facial autorizado para comparar a foto cadastrada com a pessoa presente.</p></div>{visitas.filter((visita) => visita.tipo === 'facial' && visita.status === 'authorized').length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Não há convites faciais aguardando entrada.</p> : <div className="grid gap-2 sm:grid-cols-2">{visitas.filter((visita) => visita.tipo === 'facial' && visita.status === 'authorized').map((visita) => <article key={visita.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"><div className="flex min-w-0 items-center gap-3">{visita.fotoPreview ? <img src={visita.fotoPreview} alt="" className="h-10 w-10 rounded-lg object-cover"/> : <ScanFace size={20} className="shrink-0 text-brand"/>}<div className="min-w-0"><p className="truncate text-sm font-bold">{visita.nome}</p><p className="text-xs text-slate-500">{visita.unidade}</p></div></div><button onClick={() => mudarStatus(visita.id, 'inside')} className="shrink-0 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white">Ler facial</button></article>)}</div>}</div>}</div>}

    <div className="flex flex-col gap-3 border-b border-border sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Tipo de cadastro">{abas.map(({ id, label, icon: Icon }) => <button key={id} role="tab" aria-selected={aba === id} onClick={() => setAba(id)} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-bold ${aba === id ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-900'}`}><Icon size={16}/>{label}</button>)}</div><label className="glass mb-2 flex items-center gap-2 rounded-lg px-3 py-2 sm:mb-0"><Search size={16} className="text-slate-400"/><input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar nome, unidade ou placa" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 sm:w-64"/></label></div>

    {erro && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
    {carregando && <p className="text-sm text-slate-500">Carregando cadastros...</p>}

    {aba === 'visitas' && <div className="space-y-3">{visitantesFiltrados.length === 0 ? <div className="glass rounded-xl p-8 text-center text-slate-500">Nenhum convite corresponde à busca.</div> : visitantesFiltrados.map((visita) => <article key={visita.id} className="glass flex flex-col gap-4 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-3">{visita.fotoPreview ? <img src={visita.fotoPreview} alt="" className="h-11 w-11 rounded-lg object-cover"/> : <div className="rounded-lg bg-brand/10 p-2.5 text-brand"><UserRound size={19}/></div>}<div className="min-w-0"><h2 className="font-black">{visita.nome}</h2><p className="mt-1 text-sm text-slate-500">{visita.unidade}{visita.telefone ? ` · ${visita.telefone}` : ''}{visita.placa ? ` · ${visita.placa}` : ''}</p><p className="mt-1 text-xs text-slate-400">{visita.tipo === 'manual' ? `Liberação manual${visita.autorizadoPor ? ` · confirmação de ${visita.autorizadoPor}` : ''}` : visita.tipo === 'qr' ? 'Convite por QR Code' : 'Convite facial'} · {new Date(visita.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p></div></div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle[visita.status]}`}>{statusLabel[visita.status]}</span>{visita.status === 'authorized' && <><button onClick={() => mudarStatus(visita.id, 'inside')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white"><Check size={14}/>Liberar entrada</button><button title="Recusar acesso" onClick={() => mudarStatus(visita.id, 'denied')} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><X size={16}/></button></>}{visita.status === 'inside' && <button onClick={() => mudarStatus(visita.id, 'exited')} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold text-slate-700"><ArrowDownToLine size={14}/>Registrar saída</button>}{(visita.status === 'exited' || visita.status === 'denied') && <button onClick={() => mudarStatus(visita.id, 'authorized')} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold text-slate-700"><ArrowRight size={14}/>Reautorizar</button>}</div></article>)}</div>}

    {aba === 'moradores' && <div className="space-y-2">{moradoresFiltrados.length === 0 ? <div className="glass rounded-xl p-8 text-center text-slate-500">{carregando ? 'Carregando moradores...' : 'Nenhum morador encontrado.'}</div> : moradoresFiltrados.map((morador) => <article key={morador.id} className="glass flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black">{morador.nome}</h2><p className="mt-1 text-sm text-slate-500">{unidadeDoMorador(morador)}{morador.telefone ? ` · ${morador.telefone}` : ''}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${morador.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{morador.ativo ? 'Acesso ativo' : 'Acesso bloqueado'}</span><button disabled={salvandoMorador === morador.id} onClick={() => void alternarMorador(morador)} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">{salvandoMorador === morador.id ? 'Salvando...' : morador.ativo ? 'Bloquear' : 'Liberar acesso'}</button></div></article>)}</div>}

    {aba === 'veiculos' && <div className="space-y-2">{veiculosFiltrados.length === 0 ? <div className="glass rounded-xl p-8 text-center text-slate-500">{carregando ? 'Carregando veículos...' : 'Nenhum veículo encontrado.'}</div> : veiculosFiltrados.map((veiculo) => <article key={veiculo.id} className="glass flex items-center justify-between gap-3 rounded-xl p-4"><div className="flex items-center gap-3"><Car className="text-brand" size={20}/><div><h2 className="font-black">{veiculo.placa}</h2><p className="mt-1 text-sm text-slate-500">{veiculo.marca ? `${veiculo.marca} ` : ''}{veiculo.modelo} · {moradores.find((morador) => morador.id === veiculo.morador_id)?.nome ?? `Morador #${veiculo.morador_id}`}</p></div></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${veiculo.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{veiculo.ativo ? 'Ativo' : 'Inativo'}</span></article>)}</div>}

    {modalManual && <div className="fixed inset-0 z-20 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4"><form onSubmit={registrarManual} className="glass my-auto w-full max-w-lg space-y-4 rounded-2xl p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-black tracking-widest text-brand">VISITA NÃO PREVISTA</p><h2 className="mt-1 text-xl font-black">Confirmar e liberar</h2></div><button type="button" aria-label="Fechar" onClick={() => setModalManual(false)} className="rounded-lg p-2 text-slate-500 hover:bg-surface-hover"><X size={18}/></button></div><p className="text-sm text-slate-500">Registre os dados após confirmar a visita com o morador responsável.</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold text-slate-700">Nome do visitante<input required value={nome} onChange={(event) => setNome(event.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 font-normal"/></label><label className="text-sm font-bold text-slate-700">Unidade<input required value={unidade} onChange={(event) => setUnidade(event.target.value)} placeholder="Ex.: A-101" className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 font-normal"/></label><label className="text-sm font-bold text-slate-700">Morador que confirmou<input required value={autorizador} onChange={(event) => setAutorizador(event.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 font-normal"/></label><label className="text-sm font-bold text-slate-700">Telefone do visitante<input value={telefone} onChange={(event) => setTelefone(event.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 font-normal"/></label><label className="text-sm font-bold text-slate-700 sm:col-span-2">Placa do veículo <span className="font-normal text-slate-400">(opcional)</span><input value={placa} onChange={(event) => setPlaca(event.target.value.toUpperCase())} className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 font-normal"/></label></div><label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={confirmado} onChange={(event) => setConfirmado(event.target.checked)} className="mt-1"/><span>Confirmei a visita com o morador responsável e autorizo o acesso.</span></label><button disabled={!confirmado} className="gradient-brand w-full rounded-xl px-4 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50"><DoorOpen className="mr-2 inline" size={17}/>Registrar entrada</button></form></div>}
    {visitaFacial && <div className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4"><div className="glass my-auto w-full max-w-3xl space-y-5 rounded-2xl p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-black tracking-widest text-brand">CONFERÊNCIA DE IDENTIDADE</p><h2 className="mt-1 text-xl font-black">Visitante por facial</h2><p className="mt-1 text-sm text-slate-500">Confira a pessoa na portaria antes de registrar a entrada.</p></div><button type="button" aria-label="Fechar conferência" onClick={() => setVisitaFacial(null)} className="rounded-lg p-2 text-slate-500 hover:bg-surface-hover"><X size={18}/></button></div><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><h3 className="text-sm font-bold text-slate-700">Foto cadastrada de {visitaFacial.nome}</h3>{visitaFacial.fotoPreview ? <img src={visitaFacial.fotoPreview} alt={`Foto cadastrada de ${visitaFacial.nome}`} className="h-56 w-full rounded-xl bg-slate-900 object-contain"/> : <div className="flex h-56 items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500">Sem foto de referência cadastrada</div>}</div><div><h3 className="mb-2 text-sm font-bold text-slate-700">Foto atual do visitante</h3><FacialCapture onReady={(file) => setFotoConferenciaPronta(Boolean(file))}/></div></div><p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Conferência demonstrativa: o sistema não compara rostos automaticamente. A decisão de liberar ou recusar é do porteiro.</p><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button disabled={!fotoConferenciaPronta} onClick={() => concluirConferenciaFacial('denied')} className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-bold text-red-700 disabled:cursor-not-allowed disabled:opacity-50">Não corresponde · recusar</button><button disabled={!fotoConferenciaPronta} onClick={() => concluirConferenciaFacial('inside')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><Check size={16}/>Confirmar identidade e liberar</button></div></div></div>}
  </section>;
}
