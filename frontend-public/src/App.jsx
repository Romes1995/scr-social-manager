import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import './theme.css';
import Navbar     from './components/Navbar';
import Accueil    from './pages/Accueil';
import Vitrine    from './pages/Vitrine';
import ScoreLive  from './pages/ScoreLive';
import Matchs     from './pages/Matchs';
import Buteurs    from './pages/Buteurs';
import Classement from './pages/Classement';

function AppRoutes() {
  const { pathname } = useLocation();
  const showNavbar   = !pathname.startsWith('/vitrine');

  return (
    <>
      {showNavbar && <Navbar />}
      <Routes>
        <Route path="/"           element={<Accueil />} />
        <Route path="/vitrine"    element={<Vitrine />} />
        <Route path="/live"       element={<ScoreLive />} />
        <Route path="/matchs"     element={<Matchs />} />
        <Route path="/buteurs"    element={<Buteurs />} />
        <Route path="/classement" element={<Classement />} />
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
