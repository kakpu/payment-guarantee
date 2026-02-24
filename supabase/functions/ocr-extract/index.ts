import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

// ブラウザからの直接呼び出しに必要な CORS ヘッダー
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 和暦の元号ごとの西暦オフセット（元号 n 年 = n + offset 年）
const ERA_OFFSETS: Record<string, number> = {
  明治: 1867,
  大正: 1911,
  昭和: 1925,
  平成: 1988,
  令和: 2018,
};

// 大きなバイナリを Base64 に変換する（スプレッド演算子によるスタックオーバーフロー回避）
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

// Vision API のフルテキストから氏名を抽出する
// "氏名" ラベルの直後にある文字列を取得（全角スペース・改行対応）
function extractName(text: string): string | null {
  const match = text.match(/氏[　\s]*名[　\s]*([^\n\r氏住生数個]{1,30})/u);
  if (!match) return null;
  return match[1].trim().replace(/[　\s]+/g, ' ');
}

// 47都道府県の正規表現パターン（住所アンカーとして使用）
const PREFECTURE_PATTERN =
  '北海道|東京都|大阪府|京都府|' +
  '青森県|岩手県|宮城県|秋田県|山形県|福島県|' +
  '茨城県|栃木県|群馬県|埼玉県|千葉県|神奈川県|' +
  '新潟県|富山県|石川県|福井県|山梨県|長野県|' +
  '岐阜県|静岡県|愛知県|三重県|' +
  '滋賀県|兵庫県|奈良県|和歌山県|' +
  '鳥取県|島根県|岡山県|広島県|山口県|' +
  '徳島県|香川県|愛媛県|高知県|' +
  '福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県';

// 番地区切り文字（全角・半角ハイフン類）
const BANCHI_SEP = '[ー－‐\\-]';

// Vision API のフルテキストから住所を抽出する
// 第1パターン: 都道府県アンカー + 番地（数字区切り）+ マンション名等（最大30字）でカット
// 第2パターン: 都道府県が取れない場合は住所ラベル後の1行分（最大70字）
function extractAddress(text: string): string | null {
  // 第1パターン: 都道府県を起点にして番地後30字で打ち切る
  // 番地は 2区切り（1-2）または 3区切り（1-2-3）に対応
  const anchoredMatch = text.match(
    new RegExp(
      `住[　\\s]*所[　\\s]*((${PREFECTURE_PATTERN})[^\\n]{1,60}?` +
      `\\d{1,4}${BANCHI_SEP}\\d{1,4}(?:${BANCHI_SEP}\\d{1,4})?` +  // 番地（2〜3区切り）
      `[^\\n\\r]{0,30})`,                                            // マンション名等（最大30字）
      'u',
    ),
  );
  if (anchoredMatch) {
    return anchoredMatch[1].trim().replace(/[　\s]+/g, ' ');
  }

  // 第2パターン（フォールバック）: OCR が都道府県を読み誤った場合など
  // 住所ラベル後の改行前1行分のみ取得（最大70字）
  const fallbackMatch = text.match(/住[　\s]*所[　\s]*([^\n\r]{10,70})/u);
  if (!fallbackMatch) return null;
  return fallbackMatch[1].trim().replace(/[　\s]+/g, ' ');
}

// Vision API のフルテキストから生年月日を抽出し YYYY-MM-DD 形式で返す
// 和暦（昭和・平成・令和等）と西暦の両方に対応
function extractBirthDate(text: string): string | null {
  // パターン1（主）: 元号 + 年月日 + 「生」サフィックス
  // 運転免許証・マイナンバーカード共通の実際の形式
  // 例: 平成7年4月30日生、昭和55年1月1日生
  // ※「日生年」は「生年月日」ラベルの冒頭と区別するため除外
  const suffixMatch = text.match(
    /(明治|大正|昭和|平成|令和)[　\s]*(\d{1,2})[　\s]*年[　\s]*(\d{1,2})[　\s]*月[　\s]*(\d{1,2})[　\s]*日[　\s]*生(?!年)/u,
  );
  if (suffixMatch) {
    const offset = ERA_OFFSETS[suffixMatch[1]];
    if (offset === undefined) return null;
    const year = offset + parseInt(suffixMatch[2]);
    const month = String(parseInt(suffixMatch[3])).padStart(2, '0');
    const day = String(parseInt(suffixMatch[4])).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // パターン2（フォールバック）: 「生年月日」ラベル + 和暦
  // OCR が「生年月日」ラベルをそのまま出力した場合
  const labelJpMatch = text.match(
    /生[　\s]*年[　\s]*月[　\s]*日[　\s]*(明治|大正|昭和|平成|令和)[　\s]*(\d{1,2})[　\s]*年[　\s]*(\d{1,2})[　\s]*月[　\s]*(\d{1,2})[　\s]*日/u,
  );
  if (labelJpMatch) {
    const offset = ERA_OFFSETS[labelJpMatch[1]];
    if (offset === undefined) return null;
    const year = offset + parseInt(labelJpMatch[2]);
    const month = String(parseInt(labelJpMatch[3])).padStart(2, '0');
    const day = String(parseInt(labelJpMatch[4])).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // パターン3（フォールバック）: 「生年月日」ラベル + 西暦
  const labelAdMatch = text.match(
    /生[　\s]*年[　\s]*月[　\s]*日[　\s]*(\d{4})[　\s]*年[　\s]*(\d{1,2})[　\s]*月[　\s]*(\d{1,2})[　\s]*日/u,
  );
  if (labelAdMatch) {
    const month = String(parseInt(labelAdMatch[2])).padStart(2, '0');
    const day = String(parseInt(labelAdMatch[3])).padStart(2, '0');
    return `${labelAdMatch[1]}-${month}-${day}`;
  }

  return null;
}

// OCR 失敗時に document_data.ocr_error_message を記録し、
// documents.status を 'uploaded'（手動入力待ち）へ戻す
async function handleOcrFailure(
  adminClient: ReturnType<typeof createClient>,
  documentId: string,
  errorMessage: string,
): Promise<void> {
  const now = new Date().toISOString();
  await adminClient
    .from('documents')
    .update({ status: 'uploaded', updated_at: now })
    .eq('id', documentId);

  await adminClient
    .from('document_data')
    .update({ ocr_error_message: errorMessage, updated_at: now })
    .eq('document_id', documentId);
}

Deno.serve(async (req) => {
  // CORS プリフライトリクエストには即座に返す
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 予期せぬエラーによる EarlyDrop を防ぐためにハンドラ全体を try-catch で包む
  try {
    console.log('[ocr-extract] リクエスト開始:', req.method);

    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[ocr-extract] 認証ヘッダーなし');
      return new Response(
        JSON.stringify({ success: false, error: 'UNAUTHORIZED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    console.log('[ocr-extract] 認証ヘッダー確認済み');

    // リクエストボディを先に読んでおく（catch ブロックで再利用不可のため）
    let documentId: string;
    try {
      const body = await req.json();
      documentId = body.document_id;
      console.log('[ocr-extract] リクエスト解析完了: document_id=', documentId);
    } catch (parseErr) {
      console.error('[ocr-extract] ボディ解析エラー:', parseErr);
      return new Response(
        JSON.stringify({ success: false, error: 'INVALID_REQUEST' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!documentId) {
      console.error('[ocr-extract] document_id が未指定');
      return new Response(
        JSON.stringify({ success: false, error: 'MISSING_DOCUMENT_ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const visionApiKey = Deno.env.get('GOOGLE_VISION_API_KEY') ?? '';

    console.log('[ocr-extract] 環境変数確認: supabaseUrl=', supabaseUrl ? '設定済み' : '未設定');
    console.log('[ocr-extract] 環境変数確認: serviceRoleKey=', serviceRoleKey ? '設定済み' : '未設定');
    console.log('[ocr-extract] 環境変数確認: anonKey=', anonKey ? '設定済み' : '未設定');
    console.log('[ocr-extract] 環境変数確認: visionApiKey=', visionApiKey ? '設定済み' : '未設定');

    if (!visionApiKey) {
      console.error('[ocr-extract] GOOGLE_VISION_API_KEY が未設定');
      return new Response(
        JSON.stringify({ success: false, fallback: true, error: 'OCR_NOT_CONFIGURED' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ユーザートークンで Supabase クライアントを作成（書類の所有権チェック用）
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    // service_role クライアント（Storage 署名付きURL 発行・DB 書き込み用）
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    console.log('[ocr-extract] Supabase クライアント作成完了');

    try {
      // ユーザーが所有する書類か確認（RLS によって他ユーザーの書類は取得されない）
      const { data: doc, error: docError } = await userClient
        .from('documents')
        .select('id, image_url, document_type')
        .eq('id', documentId)
        .single();

      if (docError || !doc) {
        console.error('[ocr-extract] 書類取得エラー:', docError?.message ?? '書類なし');
        return new Response(
          JSON.stringify({ success: false, error: 'DOCUMENT_NOT_FOUND' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      console.log('[ocr-extract] 書類取得完了: document_type=', doc.document_type);

      // OCR 処理中ステータスへ更新
      await adminClient
        .from('documents')
        .update({ status: 'ocr_processing', updated_at: new Date().toISOString() })
        .eq('id', documentId);
      console.log('[ocr-extract] ステータスを ocr_processing に更新');

      // Storage から短期署名付きURL を発行（Vision API 呼び出しの間だけ有効な 60 秒）
      const { data: signedData, error: signedError } = await adminClient.storage
        .from('documents')
        .createSignedUrl(doc.image_url, 60);

      if (signedError || !signedData?.signedUrl) {
        throw new Error(`署名付きURL の発行に失敗しました: ${signedError?.message ?? '不明'}`);
      }
      console.log('[ocr-extract] 署名付きURL 発行完了');

      // 署名付きURL から画像を取得し Base64 に変換
      const imageResponse = await fetch(signedData.signedUrl);
      if (!imageResponse.ok) {
        throw new Error(`画像の取得に失敗しました: ${imageResponse.status}`);
      }
      const imageBuffer = await imageResponse.arrayBuffer();
      console.log('[ocr-extract] 画像取得完了: サイズ=', imageBuffer.byteLength, 'bytes');

      const base64Image = arrayBufferToBase64(imageBuffer);
      console.log('[ocr-extract] Base64 変換完了: 長さ=', base64Image.length);

      // Google Cloud Vision API（DOCUMENT_TEXT_DETECTION）を呼び出す
      console.log('[ocr-extract] Vision API 呼び出し開始');
      const visionResponse = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [
              {
                image: { content: base64Image },
                features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
              },
            ],
          }),
        },
      );
      console.log('[ocr-extract] Vision API レスポンス: status=', visionResponse.status);

      // 月次無料枠（1,000 ユニット）超過時はフォールバック
      if (visionResponse.status === 429) {
        await handleOcrFailure(adminClient, documentId, 'OCR_RATE_LIMIT_EXCEEDED');
        return new Response(
          JSON.stringify({ success: false, fallback: true, error: 'OCR_RATE_LIMIT_EXCEEDED' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (!visionResponse.ok) {
        const errBody = await visionResponse.text();
        throw new Error(`Vision API エラー: status=${visionResponse.status}, body=${errBody.slice(0, 200)}`);
      }

      const visionData = await visionResponse.json();
      const fullText: string = visionData.responses?.[0]?.fullTextAnnotation?.text ?? '';
      console.log('[ocr-extract] テキスト検出: 文字数=', fullText.length);

      if (!fullText) {
        await handleOcrFailure(adminClient, documentId, 'テキストが検出されませんでした');
        return new Response(
          JSON.stringify({ success: false, fallback: true, error: 'OCR_NO_TEXT' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // テキストから各フィールドを抽出（個人情報はログに出力しない）
      const name = extractName(fullText);
      const birthDate = extractBirthDate(fullText);
      const address = extractAddress(fullText);
      console.log('[ocr-extract] フィールド抽出完了: name=', name ? '取得' : 'null', ', birthDate=', birthDate ? '取得' : 'null', ', address=', address ? '取得' : 'null');
      const now = new Date().toISOString();

      // document_data を OCR 結果で更新
      const { error: upsertError } = await adminClient
        .from('document_data')
        .update({
          name: name ?? '',
          birth_date: birthDate ?? null,
          address: address ?? '',
          ocr_executed_at: now,
          ocr_error_message: null,
          updated_at: now,
        })
        .eq('document_id', documentId);

      if (upsertError) throw new Error(`document_data 更新エラー: ${upsertError.message}`);

      // ステータスを ocr_completed へ更新
      await adminClient
        .from('documents')
        .update({ status: 'ocr_completed', updated_at: now })
        .eq('id', documentId);

      // 操作履歴に OCR 抽出完了を記録（抽出値はログに出力しない）
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        await adminClient.from('document_history').insert({
          document_id: documentId,
          operator_id: user.id,
          action: 'ocr_extracted',
          changes: { extracted_fields: ['name', 'birth_date', 'address'] },
        });
      }

      console.log('[ocr-extract] OCR 完了: document_id=', documentId);

      return new Response(
        JSON.stringify({
          success: true,
          data: { name, birth_date: birthDate, address },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '不明なエラー';
      console.error('[ocr-extract] OCR 処理エラー:', message);

      await handleOcrFailure(adminClient, documentId, message);

      return new Response(
        JSON.stringify({ success: false, fallback: true, error: 'OCR_API_ERROR' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  } catch (topErr) {
    // ハンドラ全体の予期せぬ例外をキャッチして EarlyDrop を防ぐ
    console.error('[ocr-extract] 予期せぬトップレベルエラー:', topErr instanceof Error ? topErr.message : String(topErr));
    return new Response(
      JSON.stringify({ success: false, fallback: true, error: 'UNEXPECTED_ERROR' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
