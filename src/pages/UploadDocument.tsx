import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Upload, FileText, AlertCircle, Scan } from 'lucide-react';

type DocumentType = 'mynumber_card' | 'drivers_license';

interface Props {
  onUploadComplete: (documentId: string) => void;
}

export function UploadDocument({ onUploadComplete }: Props) {
  const { user } = useAuth();
  const { showSuccess } = useToast();
  const [documentType, setDocumentType] = useState<DocumentType>('mynumber_card');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // OCR 処理中フラグ（アップロード完了後に Edge Function を呼び出す間）
  const [runningOcr, setRunningOcr] = useState(false);
  const [error, setError] = useState('');

  // Object URL のメモリ解放（ファイル変更・コンポーネントアンマウント時）
  const previewUrlRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith('image/')) {
      setError('画像ファイルを選択してください');
      return;
    }
    if (selectedFile.size > 5 * 1024 * 1024) {
      setError('ファイルサイズは5MB以下にしてください');
      return;
    }

    // 前の Object URL を解放してからプレビュー用 URL を生成
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);

    // URL.createObjectURL は同期的なため、選択直後に即時プレビュー表示される
    const objectUrl = URL.createObjectURL(selectedFile);
    previewUrlRef.current = objectUrl;

    setFile(selectedFile);
    setPreview(objectUrl);
    setError('');
  };

  const handleUpload = async () => {
    if (!file || !user) return;

    setUploading(true);
    setError('');

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // DBにはオブジェクトキー（パス）のみ保存する（公開URLは保存しない）
      const { data: document, error: docError } = await supabase
        .from('documents')
        .insert({
          user_id: user.id,
          document_type: documentType,
          image_url: fileName,
          status: 'uploaded',
        })
        .select()
        .single();

      if (docError) throw docError;

      await supabase.from('document_data').insert({
        document_id: document.id,
        name: '',
        birth_date: null,
        address: '',
        ocr_executed_at: null,
      });

      await supabase.from('document_history').insert({
        document_id: document.id,
        operator_id: user.id,
        action: 'uploaded',
        changes: {},
      });

      setUploading(false);

      // アップロード完了後、OCR Edge Function を呼び出す
      setRunningOcr(true);
      try {
        // セッションを明示的に取得して Authorization ヘッダーに付与する
        // （supabase.functions.invoke が自動付与できない場合の安全策）
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error('SESSION_EXPIRED');
        }

        const { data: ocrResult, error: ocrError } = await supabase.functions.invoke(
          'ocr-extract',
          {
            body: { document_id: document.id },
            headers: { Authorization: `Bearer ${session.access_token}` },
          },
        );

        if (ocrError) throw ocrError;

        if (ocrResult?.fallback) {
          // 上限超過・API エラー時は手動入力を促す
          showSuccess('アップロード完了。OCR が利用できないため手動で入力してください');
        } else {
          showSuccess('アップロード・OCR 抽出が完了しました');
        }
      } catch (ocrErr) {
        // OCR 失敗はアップロード自体の成功には影響しない
        const isSessionExpired =
          ocrErr instanceof Error && ocrErr.message === 'SESSION_EXPIRED';
        showSuccess(
          isSessionExpired
            ? 'アップロード完了。セッション切れのため再ログイン後、書類詳細から手動入力してください'
            : 'アップロード完了。OCR に失敗したため手動で入力してください',
        );
      } finally {
        setRunningOcr(false);
      }

      // 完了後に書類詳細ページへ遷移（OCR 結果の確認・手動補正のため）
      onUploadComplete(document.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'アップロードに失敗しました');
    } finally {
      setUploading(false);
      setRunningOcr(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">書類アップロード</h1>
        <p className="text-gray-600">本人確認書類をアップロードしてください</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              書類種別
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setDocumentType('mynumber_card')}
                className={`p-4 border-2 rounded-lg transition ${
                  documentType === 'mynumber_card'
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <FileText className={`w-6 h-6 mx-auto mb-2 ${
                  documentType === 'mynumber_card' ? 'text-blue-600' : 'text-gray-400'
                }`} />
                <p className={`font-medium ${
                  documentType === 'mynumber_card' ? 'text-blue-900' : 'text-gray-700'
                }`}>
                  マイナンバーカード
                </p>
              </button>

              <button
                onClick={() => setDocumentType('drivers_license')}
                className={`p-4 border-2 rounded-lg transition ${
                  documentType === 'drivers_license'
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <FileText className={`w-6 h-6 mx-auto mb-2 ${
                  documentType === 'drivers_license' ? 'text-blue-600' : 'text-gray-400'
                }`} />
                <p className={`font-medium ${
                  documentType === 'drivers_license' ? 'text-blue-900' : 'text-gray-700'
                }`}>
                  運転免許証
                </p>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              画像ファイル
            </label>
            <div className={`border-2 border-dashed rounded-lg p-8 text-center transition ${
              file
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-300 hover:border-blue-400'
            }`}>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className={`w-12 h-12 mx-auto mb-4 ${
                  file ? 'text-blue-500' : 'text-gray-400'
                }`} />
                {file ? (
                  <>
                    <p className="text-blue-700 font-medium mb-1">{file.name}</p>
                    <p className="text-sm text-blue-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB — クリックして変更
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-gray-700 font-medium mb-1">
                      クリックしてファイルを選択
                    </p>
                    <p className="text-sm text-gray-500">
                      PNG, JPG, JPEG (最大5MB)
                    </p>
                  </>
                )}
              </label>
            </div>
          </div>

          {preview && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                プレビュー
              </label>
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <img
                  src={preview}
                  alt="Preview"
                  className="max-h-96 mx-auto rounded"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || uploading || runningOcr}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>① ファイル送信中...</span>
              </>
            ) : runningOcr ? (
              <>
                <Scan className="w-5 h-5 animate-pulse" />
                <span>② OCR 解析中...</span>
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                <span>アップロード</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
