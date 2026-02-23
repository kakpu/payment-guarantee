import { useAuth } from '../contexts/AuthContext';
import { FileText, Upload, LayoutDashboard, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: 'dashboard' | 'upload' | 'documents';
  onNavigate: (page: 'dashboard' | 'upload' | 'documents') => void;
}

export function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigation = [
    { name: 'ダッシュボード', page: 'dashboard' as const, icon: LayoutDashboard },
    { name: '書類アップロード', page: 'upload' as const, icon: Upload },
    { name: '書類一覧', page: 'documents' as const, icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <div className="bg-blue-600 p-2 rounded-lg">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <span className="ml-3 text-xl font-bold text-gray-900">
                  代弁実行書類確認
                </span>
              </div>
            </div>

            <div className="hidden md:flex md:items-center md:space-x-4">
              {navigation.map((item) => (
                <button
                  key={item.page}
                  onClick={() => onNavigate(item.page)}
                  className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
                    currentPage === item.page
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-slate-50 hover:text-gray-900'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.name}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 text-sm text-gray-600">
                <span>{user?.email}</span>
              </div>
              <button
                onClick={() => signOut()}
                className="hidden md:flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 transition"
              >
                <LogOut className="w-4 h-4" />
                ログアウト
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-slate-50"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white">
            <div className="px-4 py-3 space-y-2">
              {navigation.map((item) => (
                <button
                  key={item.page}
                  onClick={() => {
                    onNavigate(item.page);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full px-4 py-3 rounded-lg font-medium transition flex items-center gap-2 ${
                    currentPage === item.page
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-slate-50'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </button>
              ))}
              <div className="pt-2 border-t border-slate-200">
                <div className="text-sm text-gray-600 px-4 py-2">{user?.email}</div>
                <button
                  onClick={() => signOut()}
                  className="w-full px-4 py-3 rounded-lg text-gray-600 hover:bg-slate-50 flex items-center gap-2"
                >
                  <LogOut className="w-5 h-5" />
                  ログアウト
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
