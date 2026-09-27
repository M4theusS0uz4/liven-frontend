import { AlertTriangle, Bell, Building2, Car, DoorOpen, LogOut, Map, Menu, Package, Shield, Users, X } from 'lucide-react';
import { useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { useAuth, type Perfil } from './context/AuthContext';
import AccessPage from './pages/AccessPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import CondominiumMapPage from './pages/CondominiumMapPage';
import DeliveriesPage from './pages/DeliveriesPage';
import LoginPage from './pages/LoginPage';
import OccurrencesPage from './pages/OccurrencesPage';
import ResidentsPage from './pages/ResidentsPage';
import StaffPage from './pages/StaffPage';
import SyndicDashboardPage from './pages/SyndicDashboardPage';
import UnitsPage from './pages/UnitsPage';
import VehiclesPage from './pages/VehiclesPage';
import VisitsPage from './pages/VisitsPage';

const perfilLabel: Record<Perfil, string> = { morador: 'Morador', portaria: 'Portaria', sindico: 'Síndico' };
type NavigationItem = { to: string; label: string; icon: LucideIcon };
type NavigationGroup = { label: string; items: NavigationItem[] };

function NavigationSections({ groups, pathname, onNavigate }: { groups: NavigationGroup[]; pathname: string; onNavigate?: () => void }) {
  return <div className="space-y-6">{groups.map((group) => <section key={group.label} className="space-y-1"><h2 className="px-3 pb-1 text-[11px] font-bold uppercase tracking-[.14em] text-slate-400">{group.label}</h2>{group.items.map(({ to, label, icon: Icon }) => {
    const active = pathname === to;
    return <Link key={to} to={to} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${active ? 'bg-brand/10 text-brand' : 'text-slate-600 hover:bg-surface-hover hover:text-slate-900'}`}><Icon size={18} strokeWidth={active ? 2.3 : 1.8}/><span>{label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand"/>}</Link>;
  })}</section>)}</div>;
}

function Dashboard() {
  const { usuario } = useAuth();
  const morador = usuario?.perfil === 'morador';
  return <section className="space-y-6 sm:space-y-8"><header><h1 className="mobile-compact-heading text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Olá, {usuario?.nome}</h1><p className="mt-2 text-sm text-slate-500 sm:text-base">{morador ? 'Consulte sua unidade e gerencie suas visitas.' : 'Acesse rapidamente as rotinas da operação.'}</p></header><div className="grid gap-3 sm:grid-cols-2">{morador ? <Link className="glass rounded-xl p-5 transition hover:bg-surface-hover sm:p-7" to="/visits"><Users className="text-brand"/><h2 className="mt-4 text-lg font-bold sm:mt-5 sm:text-xl">Minhas visitas</h2><p className="mt-2 text-sm text-slate-500">Autorize entradas por QR Code ou reconhecimento facial.</p></Link> : <><Link className="glass rounded-xl p-5 transition hover:bg-surface-hover sm:p-7" to="/map"><Map className="text-brand"/><h2 className="mt-4 text-lg font-bold sm:mt-5 sm:text-xl">Mapa do condomínio</h2><p className="mt-2 text-sm text-slate-500">Visualize blocos e unidades.</p></Link><Link className="glass rounded-xl p-5 transition hover:bg-surface-hover sm:p-7" to="/deliveries"><Package className="text-brand"/><h2 className="mt-4 text-lg font-bold sm:mt-5 sm:text-xl">Entregas</h2><p className="mt-2 text-sm text-slate-500">Registre e acompanhe encomendas.</p></Link></>}</div></section>;
}

function ProtectedRoute({ children, perfis }: { children: React.ReactNode; perfis?: Perfil[] }) {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to="/login" replace />;
  if (perfis && !perfis.includes(usuario.perfil)) return <Navigate to="/" replace />;
  return children;
}

function Layout() {
  const location = useLocation();
  const { usuario, sair } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);
  if (!usuario) return <Routes><Route path="/login" element={<LoginPage />} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>;

  const administrativo = usuario.perfil !== 'morador';
  const grupos: NavigationGroup[] = [
    { label: 'Geral', items: [{ to: '/', label: 'Visão geral', icon: Building2 }, { to: '/announcements', label: 'Comunicados', icon: Bell }, { to: '/occurrences', label: 'Ocorrências', icon: AlertTriangle }] },
    ...(usuario.perfil === 'morador' ? [{ label: 'Meu espaço', items: [{ to: '/visits', label: 'Minhas visitas', icon: Users }] }] : []),
    ...(administrativo ? [
      { label: 'Operação', items: [{ to: '/accesses', label: 'Controle de acessos', icon: DoorOpen }, { to: '/deliveries', label: 'Entregas', icon: Package }] },
      { label: 'Condomínio', items: [{ to: '/map', label: 'Mapa', icon: Map }, { to: '/units', label: 'Unidades', icon: Building2 }, { to: '/residents', label: 'Moradores', icon: Users }, { to: '/vehicles', label: 'Veículos', icon: Car }] },
    ] : []),
    ...(usuario.perfil === 'sindico' ? [{ label: 'Equipe', items: [{ to: '/staff', label: 'Porteiros', icon: Shield }] }] : []),
  ];
  const fecharMenu = () => setMenuAberto(false);

  return <div className="min-h-screen bg-background">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
      <Link to="/" className="flex h-[76px] shrink-0 items-center gap-3 border-b border-border px-6"><span className="grid size-9 place-items-center rounded-lg bg-brand text-white"><Building2 size={19}/></span><span className="text-xl font-bold tracking-tight text-slate-900">Liven</span></Link>
      <nav className="custom-scrollbar flex-1 overflow-y-auto px-3 py-6" aria-label="Navegação principal"><NavigationSections groups={grupos} pathname={location.pathname}/></nav>
      <div className="border-t border-border p-3"><div className="flex items-center gap-3 rounded-lg px-2 py-2"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-black text-brand">{usuario.nome.slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-800">{usuario.nome}</strong><small className="text-xs text-slate-500">{perfilLabel[usuario.perfil]}</small></span><button title="Sair" aria-label="Sair" onClick={sair} className="rounded-lg p-2 text-slate-500 transition hover:bg-surface-hover hover:text-slate-900"><LogOut size={17}/></button></div></div>
    </aside>

    <div className="lg:pl-64">
      <header className="app-header sticky top-0 z-30 lg:hidden"><div className="flex h-16 items-center justify-between px-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-brand text-white"><Building2 size={19}/></span><Link to="/" onClick={fecharMenu} className="text-lg font-bold tracking-tight text-slate-900">Liven</Link></div><div className="flex items-center gap-2"><span className="hidden text-right sm:block"><strong className="block max-w-36 truncate text-sm text-slate-800">{usuario.nome}</strong><small className="text-xs text-slate-500">{perfilLabel[usuario.perfil]}</small></span><button title={menuAberto ? 'Fechar menu' : 'Abrir menu'} aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menuAberto} onClick={() => setMenuAberto((aberto) => !aberto)} className="grid size-10 place-items-center rounded-lg text-slate-600 transition hover:bg-surface-hover">{menuAberto ? <X size={20}/> : <Menu size={20}/>}</button></div></div>{menuAberto && <nav className="max-h-[calc(100dvh-64px)] overflow-y-auto border-t border-border bg-surface px-4 py-5 shadow-lg" aria-label="Navegação móvel"><NavigationSections groups={grupos} pathname={location.pathname} onNavigate={fecharMenu}/><button onClick={sair} className="mt-5 flex w-full items-center gap-3 rounded-lg border-t border-border px-3 py-4 text-sm font-semibold text-slate-600"><LogOut size={18}/>Sair da conta</button></nav>}</header>

    <main className="mx-auto min-h-[calc(100vh-64px)] max-w-[1600px] p-4 sm:p-6 lg:min-h-screen xl:p-8"><Routes>
      <Route path="/" element={usuario.perfil === 'sindico' ? <SyndicDashboardPage/> : <Dashboard/>}/>
      <Route path="/announcements" element={<ProtectedRoute><AnnouncementsPage/></ProtectedRoute>}/>
      <Route path="/occurrences" element={<ProtectedRoute><OccurrencesPage/></ProtectedRoute>}/>
      <Route path="/visits" element={<ProtectedRoute perfis={['morador']}><VisitsPage/></ProtectedRoute>}/>
      <Route path="/staff" element={<ProtectedRoute perfis={['sindico']}><StaffPage/></ProtectedRoute>}/>
      <Route path="/accesses" element={<ProtectedRoute perfis={['portaria', 'sindico']}><AccessPage/></ProtectedRoute>}/>
      <Route path="/map" element={<ProtectedRoute perfis={['portaria', 'sindico']}><CondominiumMapPage/></ProtectedRoute>}/>
      <Route path="/units" element={<ProtectedRoute perfis={['portaria', 'sindico']}><UnitsPage/></ProtectedRoute>}/>
      <Route path="/residents" element={<ProtectedRoute perfis={['portaria', 'sindico']}><ResidentsPage/></ProtectedRoute>}/>
      <Route path="/vehicles" element={<ProtectedRoute perfis={['portaria', 'sindico']}><VehiclesPage/></ProtectedRoute>}/>
      <Route path="/deliveries" element={<ProtectedRoute perfis={['portaria', 'sindico']}><DeliveriesPage/></ProtectedRoute>}/>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes></main></div></div>;
}

export default function App() { return <BrowserRouter><Layout/></BrowserRouter>; }
