import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Upload, FileText, CheckCircle, AlertCircle, Scan } from 'lucide-react';

type DocumentType = 'mynumber_card' | 'drivers_license';

export function UploadDocument() {
  const { user } = useAuth();
  const { showSuccess } = useToast();
  const [documentType, setDocumentType] = useState<DocumentType>('mynumber_card');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // OCR 処理中フラグ（アップロード完了後に Edge Function を呼び出す間）
  const [runningOcr, setRunningOcr] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.type.startsWith('image/')) {
        setError('画像ファイルを選択してください');
        return;
      }
      if (selectedFile.size > 5 * 1024 * 1024) {
        setError('ファイルサイズは5MB以下にしてください');
        return;
      }
      setFile(selectedFile);
      setError('');
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file || !user) return;

    setUploading(true);
    setError('');
    setSuccess(false);

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
        const { data: ocrResult, error: ocrError } = await supabase.functions.invoke(
          'ocr-extract',
          { body: { document_id: document.id } },
        );

        if (ocrError) throw ocrError;

        if (ocrResult?.fallback) {
          // 上限超過・API エラー時は手動入力を促す
          showSuccess('アップロード完了。OCR が利用できないため手動で入力してください');
        } else {
          showSuccess('アップロード・OCR 抽出が完了しました');
        }
      } catch {
        // OCR 失敗はアップロード自体の成功には影響しない
        showSuccess('アップロード完了。OCR に失敗したため手動で入力してください');
      } finally {
        setRunningOcr(false);
      }

      setSuccess(true);
      setFile(null);
      setPreview(null);

      setTimeout(() => {
        setSuccess(false);
      }, 3000);
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
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-700 font-medium mb-1">
                  クリックしてファイルを選択
                </p>
                <p className="text-sm text-gray-500">
                  PNG, JPG, JPEG (最大5MB)
                </p>
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

          {success && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm">アップロードが完了しました</span>
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
                <span>アップロード中...</span>
              </>
            ) : runningOcr ? (
              <>
                <Scan className="w-5 h-5 animate-pulse" />
                <span>OCR 処理中...</span>
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
