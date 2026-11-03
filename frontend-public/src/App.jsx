import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './theme.css';
import { VITRINE } from './config/mode';
import Navbar     from './components/Navbar';
import Accueil    from './accueil/Accueil';
import ScoreLive  from './pages/ScoreLive';
import Matchs     from './pages/Matchs';
import Buteurs    from './pages/Buteurs';
import Classement from './pages/Classement';
import Tele       from './tele/Tele';

function AppRoutes() {
  const { pathname, search } = useLocation();
  // L'accueil a son propre en-tête, sans menu ; les autres pages restent accessibles par leur URL
  const showNavbar   = pathname !== '/' && !pathname.startsWith('/vitrine') && !pathname.startsWith('/tele');

  return (
    <>
      {showNavbar && <Navbar />}
      <Routes>
        <Route path="/"           element={<Accueil />} />
        {/* Ancienne vitrine 3 colonnes : remplacée par la page télé */}
        <Route path="/vitrine"    element={<Navigate to={`/tele${search}`} replace />} />
        {/* Mode vitrine : pas de score live ni de buteurs (données de l'admin) */}
        <Route path="/live"       element={VITRINE ? <Navigate to="/" replace /> : <ScoreLive />} />
        <Route path="/matchs"     element={<Matchs />} />
        <Route path="/buteurs"    element={VITRINE ? <Navigate to="/" replace /> : <Buteurs />} />
        <Route path="/classement" element={<Classement />} />
        <Route path="/tele"       element={<Tele />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
