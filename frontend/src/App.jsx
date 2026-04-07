import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import { ProtectedRoute, RoleRoute } from './components/ProtectedRoute.jsx'
import InstallAppPrompt from './components/ui/InstallAppPrompt.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import SuperAdminPage from './pages/SuperAdminPage.jsx'
import SuperAdminIntegrationsPage from './pages/SuperAdminIntegrationsPage.jsx'

function HomeRedirect() {
  const { isAuthenticated, user } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (user?.role === 'super_admin') {
    return <Navigate to="/super-admin" replace />
  }

  return <Navigate to="/app" replace />
}

function App() {
  return (
    <>
      <InstallAppPrompt />
      <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super-admin"
        element={
          <RoleRoute allowedRoles={['super_admin']}>
            <SuperAdminPage />
          </RoleRoute>
        }
      />
      <Route
        path="/super-admin/integrations"
        element={
          <RoleRoute allowedRoles={['super_admin']}>
            <SuperAdminIntegrationsPage />
          </RoleRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App
