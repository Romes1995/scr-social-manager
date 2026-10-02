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
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';

export default function App() {
  const location = useLocation();
  const isHome  = location.pathname === '/';
  const isLogin = location.pathname === '/login';

  return (
    <div className={`app${isHome ? ' app--dark' : ''}`}>
      {!isHome && !isLogin && <TopNav />}
      <main className={`main-content${isHome ? ' main-content--home' : ''}`}>
        <Routes>
          <Route path="/login"       element={<Login />} />

          {/* Toutes les autres pages exigent une session admin */}
          <Route path="/"            element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
          <Route path="/programme"   element={<ProtectedRoute><Programme /></ProtectedRoute>} />
          <Route path="/score-live"  element={<ProtectedRoute><ScoreLive /></ProtectedRoute>} />
          <Route path="/resultats"   element={<ProtectedRoute><Resultats /></ProtectedRoute>} />
          <Route path="/templates"   element={<ProtectedRoute><Templates /></ProtectedRoute>} />
          <Route path="/listes"      element={<ProtectedRoute><Listes /></ProtectedRoute>} />
          <Route path="/matchday"    element={<ProtectedRoute><MatchDay /></ProtectedRoute>} />
          <Route path="/convocation" element={<ProtectedRoute><ConvocationPreparator /></ProtectedRoute>} />
          <Route path="/classements" element={<ProtectedRoute><Classements /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute><UsersAdmin /></ProtectedRoute>} />
          <Route path="*"            element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
