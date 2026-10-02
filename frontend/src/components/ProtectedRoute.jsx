import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Page réservée aux admins connectés ; sinon retour à /login, puis à cette page
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!isAuthenticated) {
    const suite = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?suite=${suite}`} replace />;
  }
  return children;
}
