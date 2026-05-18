import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, hasRole } = useAuth();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (roles && !hasRole(roles)) {
    return (
      <div className="access-denied">
        <div className="access-denied-inner">
          <span className="access-denied-icon">🔒</span>
          <h2>Accès refusé</h2>
          <p>Votre rôle ne vous permet pas d'accéder à cette page.</p>
          <Navigate to="/" replace />
        </div>
      </div>
    );
  }

  return children;
}
