import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { LoginForm } from './components/LoginForm';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { UploadDocument } from './pages/UploadDocument';
import { DocumentList } from './pages/DocumentList';
import { DocumentDetail } from './pages/DocumentDetail';

type Page = 'dashboard' | 'upload' | 'documents' | 'document-detail';

function AppContent() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);

  const handleNavigate = (page: 'dashboard' | 'upload' | 'documents') => {
    setCurrentPage(page);
    setSelectedDocumentId(null);
  };

  const handleViewDocument = (id: string) => {
    setSelectedDocumentId(id);
    setCurrentPage('document-detail');
  };

  const handleBackFromDetail = () => {
    setCurrentPage('documents');
    setSelectedDocumentId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  return (
    <Layout currentPage={currentPage === 'document-detail' ? 'documents' : currentPage} onNavigate={handleNavigate}>
      {currentPage === 'dashboard' && <Dashboard />}
      {currentPage === 'upload' && <UploadDocument />}
      {currentPage === 'documents' && <DocumentList onViewDocument={handleViewDocument} />}
      {currentPage === 'document-detail' && selectedDocumentId && (
        <DocumentDetail documentId={selectedDocumentId} onBack={handleBackFromDetail} />
      )}
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
