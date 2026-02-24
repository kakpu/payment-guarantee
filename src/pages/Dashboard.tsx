import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { FileText, CheckCircle, Clock, XCircle, TrendingUp, RotateCcw, ShieldCheck } from 'lucide-react';

interface Stats {
  total: number;
  uploaded: number;
  reviewPending: number;
  reviewed: number;
  rejected: number;
  reviewRejected: number;
}

export function Dashboard() {
  const { user } = useAuth();
  const { showError } = useToast();
  const [stats, setStats] = useState<Stats>({
    total: 0,
    uploaded: 0,
    reviewPending: 0,
    reviewed: 0,
    rejected: 0,
    reviewRejected: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [user]);

  const loadStats = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('documents')
        .select('status')
        .eq('user_id', user.id);

      if (error) throw error;

      const newStats = {
        total: data.length,
        uploaded: data.filter(d => d.status === 'uploaded' || d.status === 'ocr_processing' || d.status === 'ocr_completed').length,
        reviewPending: data.filter(d => d.status === 'confirmed').length,
        reviewed: data.filter(d => d.status === 'reviewed').length,
        rejected: data.filter(d => d.status === 'rejected').length,
        reviewRejected: data.filter(d => d.status === 'review_rejected').length,
      };

      setStats(newStats);
    } catch (err) {
      showError('統計情報の取得に失敗しました。再読み込みしてください。');
      console.error('Error loading stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: '総書類数',
      value: stats.total,
      icon: FileText,
      color: 'bg-blue-50 text-blue-600',
      iconBg: 'bg-blue-100',
    },
    {
      title: '確認待ち',
      value: stats.uploaded,
      icon: Clock,
      color: 'bg-amber-50 text-amber-600',
      iconBg: 'bg-amber-100',
    },
    {
      title: '再鑑待ち',
      value: stats.reviewPending,
      icon: CheckCircle,
      color: 'bg-green-50 text-green-600',
      iconBg: 'bg-green-100',
    },
    {
      title: '再鑑OK',
      value: stats.reviewed,
      icon: ShieldCheck,
      color: 'bg-teal-50 text-teal-600',
      iconBg: 'bg-teal-100',
    },
    {
      title: '差戻し',
      value: stats.rejected,
      icon: XCircle,
      color: 'bg-red-50 text-red-600',
      iconBg: 'bg-red-100',
    },
    {
      title: '再鑑差戻し',
      value: stats.reviewRejected,
      icon: RotateCcw,
      color: 'bg-orange-50 text-orange-600',
      iconBg: 'bg-orange-100',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">ダッシュボード</h1>
        <p className="text-gray-600">書類処理の状況を確認できます</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => (
          <div
            key={card.title}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-lg ${card.iconBg}`}>
                <card.icon className={`w-6 h-6 ${card.color.split(' ')[1]}`} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              <p className="text-sm text-gray-600 mt-1">{card.title}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-50 rounded-lg">
            <TrendingUp className="w-5 h-5 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">処理状況</h2>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">処理済み率</span>
              <span className="font-medium text-gray-900">
                {stats.total > 0 ? Math.round(((stats.reviewPending + stats.reviewed + stats.rejected + stats.reviewRejected) / stats.total) * 100) : 0}%
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-blue-600 to-blue-500 h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${stats.total > 0 ? ((stats.reviewPending + stats.reviewed + stats.rejected + stats.reviewRejected) / stats.total) * 100 : 0}%`,
                }}
              ></div>
            </div>
          </div>

          {stats.total === 0 && (
            <div className="text-center py-8 text-gray-500">
              まだ書類がアップロードされていません
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
