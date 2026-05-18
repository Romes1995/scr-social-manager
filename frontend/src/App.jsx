import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import TopNav from './components/TopNav';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import HomePage from './pages/HomePage';
import Programme from './pages/Programme';
import ScoreLive from './pages/ScoreLive';
import Resultats from './pages/Resultats';
import Templates from './pages/Templates';
import Listes from './pages/Listes';
import MatchDay from './pages/MatchDay';
import ConvocationPreparator from './pages/ConvocationPreparator';
import UsersAdmin from './pages/admin/UsersAdmin';
import './App.css';

const ADMIN   = ['admin'];
const GESTION = ['admin', 'gestionnaire'];
const SCORE   = ['admin', 'gestionnaire', 'score_live'];
const CONVOC  = ['admin', 'gestionnaire', 'coach'];

// Page d'accueil publique pour les non-connectés, admin seulement pour les connectés
// Les autres rôles sont renvoyés vers leur page principale
const ROLE_HOME = { gestionnaire: '/programme', coach: '/convocation', score_live: '/score-live' };

function HomeOrRedirect() {
  const { isAuthenticated, user } = useAuth();
  if (isAuthenticated && user?.role !== 'admin') {
    return <Navigate to={ROLE_HOME[user.role] ?? '/programme'} replace />;
  }
  return <HomePage />;
}

export default function App() {
  const location = useLocation();
  const isHome  = location.pathname === '/';
  const isLogin = location.pathname === '/login';

  return (
    <div className={`app${isHome ? ' app--dark' : ''}`}>
      {!isHome && !isLogin && <TopNav />}
      <main className={`main-content${isHome ? ' main-content--home' : ''}`}>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Accueil : public pour anonymes, admin uniquement pour les connectés */}
          <Route path="/" element={<HomeOrRedirect />} />

          {/* Pages protégées */}
          <Route path="/programme"   element={<ProtectedRoute roles={GESTION}><Programme /></ProtectedRoute>} />
          <Route path="/score-live"  element={<ProtectedRoute roles={SCORE}><ScoreLive /></ProtectedRoute>} />
          <Route path="/resultats"   element={<ProtectedRoute roles={GESTION}><Resultats /></ProtectedRoute>} />
          <Route path="/templates"   element={<ProtectedRoute roles={GESTION}><Templates /></ProtectedRoute>} />
          <Route path="/listes"      element={<ProtectedRoute roles={GESTION}><Listes /></ProtectedRoute>} />
          <Route path="/matchday"    element={<ProtectedRoute roles={GESTION}><MatchDay /></ProtectedRoute>} />
          <Route path="/convocation" element={<ProtectedRoute roles={CONVOC}><ConvocationPreparator /></ProtectedRoute>} />

          {/* Admin */}
          <Route path="/admin/users" element={<ProtectedRoute roles={ADMIN}><UsersAdmin /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
