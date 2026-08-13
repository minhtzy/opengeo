import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './routes/LoginPage'
import OnboardingPage from './routes/OnboardingPage'
import DashboardPage from './routes/DashboardPage'

export default function App() {
  return <Routes><Route path="/" element={<Navigate to="/login" replace />} /><Route path="/login" element={<LoginPage />} /><Route path="/onboarding" element={<OnboardingPage />} /><Route path="/dashboard" element={<DashboardPage />} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>
}
