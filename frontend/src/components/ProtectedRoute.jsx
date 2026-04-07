import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import AppLoadingScreen from './ui/AppLoadingScreen.jsx'

export function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return <AppLoadingScreen subtitle="Verificando sessão…" />
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />
}

export function RoleRoute({ children, allowedRoles }) {
  const { isAuthenticated, loading, user } = useAuth()

  if (loading) {
    return <AppLoadingScreen subtitle="Verificando sessão…" />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return allowedRoles.includes(user?.role) ? children : <Navigate to="/app" replace />
}
