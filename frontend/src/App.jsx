import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './routes/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import EvidenceList from './pages/EvidenceList';
import CreateEvidence from './pages/CreateEvidence';
import ViewEvidence from './pages/ViewEvidence';
import UploadEvidenceFile from './pages/UploadEvidenceFile';
import AuditLog from './pages/AuditLog';
import ChainVerification from './pages/ChainVerification';
import CustodyHistory from './pages/CustodyHistory';
import AdminDashboard from './pages/AdminDashboard';
import Profile from './pages/Profile';
import NotFound from './pages/NotFound';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/evidence" element={<EvidenceList />} />
          <Route path="/evidence/new" element={<CreateEvidence />} />
          <Route path="/evidence/:id" element={<ViewEvidence />} />
          <Route path="/evidence/:id/upload" element={<UploadEvidenceFile />} />
          <Route path="/audit-log" element={<AuditLog />} />
          <Route path="/audit-log/verify" element={<ChainVerification />} />
          <Route path="/custody-history" element={<CustodyHistory />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
