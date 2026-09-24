import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import TopNav from './components/TopNav';
import HomePage from './pages/HomePage';
import Programme from './pages/Programme';
import ScoreLive from './pages/ScoreLive';
import Resultats from './pages/Resultats';
import Templates from './pages/Templates';
import Listes from './pages/Listes';
import MatchDay from './pages/MatchDay';
import ConvocationPreparator from './pages/ConvocationPreparator';
import Classements from './pages/Classements';
import UsersAdmin from './pages/admin/UsersAdmin';
import './App.css';

export default function App() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <div className={`app${isHome ? ' app--dark' : ''}`}>
      {!isHome && <TopNav />}
      <main className={`main-content${isHome ? ' main-content--home' : ''}`}>
        <Routes>
          <Route path="/"            element={<HomePage />} />
          <Route path="/programme"   element={<Programme />} />
          <Route path="/score-live"  element={<ScoreLive />} />
          <Route path="/resultats"   element={<Resultats />} />
          <Route path="/templates"   element={<Templates />} />
          <Route path="/listes"      element={<Listes />} />
          <Route path="/matchday"    element={<MatchDay />} />
          <Route path="/convocation" element={<ConvocationPreparator />} />
          <Route path="/classements" element={<Classements />} />
          <Route path="/admin/users" element={<UsersAdmin />} />
          <Route path="*"            element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
