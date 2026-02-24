import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ArrowLeft, Save, CheckCircle, XCircle, History, ZoomIn, RotateCw, ImageOff, Scan } from 'lucide-react';

interface DocumentDetailProps {
  documentId: string;
  onBack: () => void;
}

interface DocumentData {
  id: string;
  document_type: string;
  status: string;
  image_url: string;
  created_at: string;
  data: {
    name: string;
    birth_date: string | null;
    address: string;
  };
}

interface HistoryItem {
  id: string;
  action: string;
  created_at: string;
  operator_id: string;
  changes: unknown;
}

export function DocumentDetail({ documentId, onBack }: DocumentDetailProps) {
  const { user } = useAuth();
  const { showError, showSuccess } = useToast();
  const [document, setDocument] = useState<DocumentData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [imageZoom, setImageZoom] = useState(false);
  const [rotation, setRotation] = useState(0);
  // privateバケットのため署名付きURL（有効期限1時間）
  const [signedImageUrl, setSignedImageUrl] = useState<string | null>(null);
  // 署名付きURL取得失敗フラグ
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  // OCR 処理中のポーリングタイマー参照
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    birth_date: '',
    address: '',
  });

  useEffect(() => {
    loadDocument();
    loadHistory();
    return () => {
      // アンマウント時にポーリングを停止する
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [documentId]);

  const loadDocument = async () => {
    try {
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (docError) throw docError;

      const { data: docData, error: dataError } = await supabase
        .from('document_data')
        .select('*')
        .eq('document_id', documentId)
        .maybeSingle();

      if (dataError) throw dataError;

      const fullDoc = {
        ...doc,
        data: docData || { name: '', birth_date: null, address: '' },
      };

      setDocument(fullDoc);
      setFormData({
        name: docData?.name || '',
        birth_date: docData?.birth_date || '',
        address: docData?.address || '',
      });

      // OCR 処理中ならポーリングを開始し、完了したら停止する
      if (doc.status === 'ocr_processing') {
        startPolling();
      } else {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }

      // privateバケットのため署名付きURLを生成する（有効期限1時間）
      const { data: signedData, error: signedError } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.image_url, 3600);
      if (signedData) {
        setSignedImageUrl(signedData.signedUrl);
      } else if (signedError) {
        setImageLoadFailed(true);
      }
    } catch (err) {
      showError('書類の取得に失敗しました。再読み込みしてください。');
      console.error('Error loading document:', err);
    } finally {
      setLoading(false);
    }
  };

  // OCR 処理中に 3 秒間隔でステータスをポーリングする
  const startPolling = () => {
    if (pollTimerRef.current) return; // 二重起動防止
    pollTimerRef.current = setInterval(async () => {
      const { data: doc } = await supabase
        .from('documents')
        .select('status')
        .eq('id', documentId)
        .single();

      if (doc && doc.status !== 'ocr_processing') {
        clearInterval(pollTimerRef.current!);
        pollTimerRef.current = null;
        // ステータスが変わったらドキュメント全体を再読み込みする
        await loadDocument();
        await loadHistory();
      }
    }, 3000);
  };

  const loadHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('document_history')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHistory(data || []);
    } catch (err) {
      showError('操作履歴の取得に失敗しました。');
      console.error('Error loading history:', err);
    }
  };

  const handleSave = async () => {
    if (!user || !document) return;

    setSaving(true);
    try {
      const oldData = document.data;

      await supabase
        .from('document_data')
        .update({
          name: formData.name,
          birth_date: formData.birth_date || null,
          address: formData.address,
          updated_at: new Date().toISOString(),
        })
        .eq('document_id', documentId);

      await supabase.from('document_history').insert({
        document_id: documentId,
        operator_id: user.id,
        action: 'modified',
        changes: {
          old: oldData,
          new: formData,
        },
      });

      await loadDocument();
      await loadHistory();
      showSuccess('保存しました');
    } catch (err) {
      showError('保存に失敗しました。再試行してください。');
      console.error('Error saving:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!user) return;

    setSaving(true);
    try {
      await supabase
        .from('documents')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', documentId);

      await supabase.from('document_history').insert({
        document_id: documentId,
        operator_id: user.id,
        action: 'confirmed',
        changes: {},
      });

      await loadDocument();
      await loadHistory();
      showSuccess('確認済みにしました');
    } catch (err) {
      showError('確認操作に失敗しました。再試行してください。');
      console.error('Error confirming:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!user) return;

    setSaving(true);
    try {
      await supabase
        .from('documents')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', documentId);

      await supabase.from('document_history').insert({
        document_id: documentId,
        operator_id: user.id,
        action: 'rejected',
        changes: {},
      });

      await loadDocument();
      await loadHistory();
      showSuccess('差戻しました');
    } catch (err) {
      showError('差戻し操作に失敗しました。再試行してください。');
      console.error('Error rejecting:', err);
    } finally {
      setSaving(false);
    }
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      uploaded: 'アップロード',
      ocr_extracted: 'OCR抽出',
      confirmed: '確認済み',
      rejected: '差戻し',
      modified: '修正',
    };
    return labels[action] || action;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">書類が見つかりません</p>
        <button onClick={onBack} className="mt-4 text-blue-600 hover:text-blue-700">
          戻る
        </button>
      </div>
    );
  }

  const isConfirmed = document.status === 'confirmed';
  const isRejected = document.status === 'rejected';
  // OCR 処理中はフォームを編集不可にする
  const isOcrProcessing = document.status === 'ocr_processing';
  const isFormDisabled = isConfirmed || isRejected || isOcrProcessing;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-slate-100 rounded-lg transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">書類詳細</h1>
          <p className="text-sm text-gray-600">
            {document.document_type === 'mynumber_card' ? 'マイナンバーカード' : '運転免許証'}
          </p>
        </div>
      </div>

      {/* OCR 処理中バナー */}
      {isOcrProcessing && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg flex items-center gap-3">
          <Scan className="w-5 h-5 animate-pulse shrink-0" />
          <div>
            <p className="font-medium">OCR 処理中...</p>
            <p className="text-sm">氏名・生年月日・住所を自動抽出しています。完了後に自動で更新されます。</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">書類画像</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setRotation((rotation + 90) % 360)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition"
                  title="回転"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setImageZoom(!imageZoom)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition"
                  title="拡大"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className={`bg-gray-100 rounded-lg overflow-hidden ${imageZoom ? 'h-auto' : 'h-96'}`}>
              {signedImageUrl ? (
                <img
                  src={signedImageUrl}
                  alt="Document"
                  className="w-full h-full object-contain"
                  style={{ transform: `rotate(${rotation}deg)` }}
                />
              ) : imageLoadFailed ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                  <ImageOff className="w-12 h-12 text-gray-300" />
                  <div className="text-gray-400 text-sm">画像読み込み失敗</div>
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center justify-between hover:bg-slate-50 transition"
          >
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-gray-600" />
              <span className="font-medium">操作履歴</span>
            </div>
            <span className="text-sm text-gray-500">{history.length}件</span>
          </button>

          {showHistory && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="space-y-3">
                {history.map((item) => (
                  <div key={item.id} className="border-l-2 border-blue-200 pl-4 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{getActionLabel(item.action)}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(item.created_at).toLocaleString('ja-JP')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="font-bold text-gray-900 mb-6">抽出情報</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                氏名
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={isFormDisabled}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                placeholder="山田 太郎"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                生年月日
              </label>
              <input
                type="date"
                value={formData.birth_date ?? ''}
                onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                disabled={isFormDisabled}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                住所
              </label>
              <textarea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                disabled={isFormDisabled}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                placeholder="東京都千代田区..."
              />
            </div>

            {!isFormDisabled && (
              <div className="space-y-3 pt-4">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full bg-slate-600 text-white py-3 rounded-lg font-medium hover:bg-slate-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  保存
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleConfirm}
                    disabled={saving}
                    className="bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-5 h-5" />
                    確認OK
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={saving}
                    className="bg-red-600 text-white py-3 rounded-lg font-medium hover:bg-red-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-5 h-5" />
                    差戻し
                  </button>
                </div>
              </div>
            )}

            {isOcrProcessing && (
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg flex items-center gap-2">
                <Scan className="w-5 h-5 animate-pulse" />
                <span className="font-medium">OCR 処理完了後に入力できます</span>
              </div>
            )}

            {isConfirmed && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">この書類は確認済みです</span>
              </div>
            )}

            {isRejected && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                <XCircle className="w-5 h-5" />
                <span className="font-medium">この書類は差戻されました</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
