import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './routes/LoginPage'
import OnboardingPage from './routes/OnboardingPage'
import DashboardPage from './routes/DashboardPage'
import WorkspacePage from './routes/WorkspacePage'
import AuthCallbackPage from './routes/AuthCallbackPage'

export default function App() {
  return <Routes><Route path="/" element={<Navigate to="/login" replace />} /><Route path="/login" element={<LoginPage />} /><Route path="/auth/callback" element={<AuthCallbackPage />} /><Route path="/onboarding" element={<OnboardingPage />} /><Route path="/dashboard" element={<DashboardPage />} /><Route path="/prompts" element={<WorkspacePage />} /><Route path="/sources" element={<WorkspacePage />} /><Route path="/settings" element={<WorkspacePage />} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>
}
