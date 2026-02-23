import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 日本時間（JST = UTC+9）で当日の開始・終了時刻を計算する
function getJstDayRange(now: Date): { start: string; end: string } {
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);

  const year = jstNow.getUTCFullYear();
  const month = jstNow.getUTCMonth();
  const day = jstNow.getUTCDate();

  // JST 00:00:00 → UTC 前日15:00:00
  const start = new Date(Date.UTC(year, month, day, 0, 0, 0) - jstOffset);
  // JST 23:59:59 → UTC 当日14:59:59
  const end = new Date(Date.UTC(year, month, day, 23, 59, 59) - jstOffset);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

// 連携項目をCSV行に変換する（個人情報を含むためログ出力しない）
function toCsvRow(values: string[]): string {
  return values
    .map((v) => `"${(v ?? '').toString().replace(/"/g, '""')}"`)
    .join(',');
}

Deno.serve(async (req) => {
  // POST以外は拒否
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response('Missing environment variables', { status: 500 });
  }

  // Service roleキーでSupabaseクライアントを初期化（RLSをバイパス）
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const now = new Date();
  const { start, end } = getJstDayRange(now);

  // batch_exportsにRunning状態でレコードを作成
  const { data: batchExport, error: batchError } = await supabase
    .from('batch_exports')
    .insert({
      executed_at: now.toISOString(),
      document_count: 0,
      status: 'success',
    })
    .select()
    .single();

  if (batchError || !batchExport) {
    console.error('batch_exports insert error:', batchError?.message);
    return new Response('Failed to create batch export record', { status: 500 });
  }

  try {
    // 当日JST内に確認済みになった書類を取得（個人情報はログに出力しない）
    const { data: documents, error: fetchError } = await supabase
      .from('documents')
      .select(`
        id,
        document_type,
        image_url,
        updated_at,
        user_id,
        document_data (
          name,
          birth_date,
          address,
          ocr_executed_at
        ),
        document_history (
          operator_id,
          created_at,
          action
        )
      `)
      .eq('status', 'confirmed')
      .gte('updated_at', start)
      .lte('updated_at', end);

    if (fetchError) throw new Error(`documents fetch error: ${fetchError.message}`);

    const docs = documents ?? [];
    console.log(`バッチ対象件数: ${docs.length} 件`);

    // CSVヘッダー
    const csvLines: string[] = [
      toCsvRow([
        '案件ID',
        '書類種別',
        '氏名',
        '生年月日',
        '住所',
        '画像オブジェクトキー',
        '確認者ID',
        '確認日時',
        'OCR実行日時',
      ]),
    ];

    const batchItems: { batch_export_id: string; document_id: string }[] = [];

    for (const doc of docs) {
      const docData = Array.isArray(doc.document_data)
        ? doc.document_data[0]
        : doc.document_data;

      // 確認操作の履歴から確認者IDと確認日時を取得
      const confirmHistory = (doc.document_history ?? [])
        .filter((h: { action: string }) => h.action === 'confirmed')
        .sort(
          (a: { created_at: string }, b: { created_at: string }) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];

      csvLines.push(
        toCsvRow([
          doc.id,
          doc.document_type === 'mynumber_card' ? 'マイナンバーカード' : '運転免許証',
          docData?.name ?? '',
          docData?.birth_date ?? '',
          docData?.address ?? '',
          doc.image_url,
          confirmHistory?.operator_id ?? '',
          confirmHistory?.created_at ?? '',
          docData?.ocr_executed_at ?? '',
        ])
      );

      batchItems.push({ batch_export_id: batchExport.id, document_id: doc.id });
    }

    const csvContent = csvLines.join('\n');
    const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const dateStr = jstDate.toISOString().slice(0, 10);
    const csvPath = `${dateStr}.csv`;

    // CSVをbatch-exportsバケットに保存
    const { error: uploadError } = await supabase.storage
      .from('batch-exports')
      .upload(csvPath, new Blob([csvContent], { type: 'text/csv; charset=utf-8' }), {
        upsert: true,
      });

    if (uploadError) throw new Error(`CSV upload error: ${uploadError.message}`);

    // batch_export_itemsに明細を記録
    if (batchItems.length > 0) {
      const { error: itemsError } = await supabase
        .from('batch_export_items')
        .insert(batchItems);

      if (itemsError) throw new Error(`batch_export_items insert error: ${itemsError.message}`);
    }

    // batch_exportsを成功状態に更新
    await supabase
      .from('batch_exports')
      .update({ document_count: docs.length, status: 'success' })
      .eq('id', batchExport.id);

    console.log(`バッチ完了: ${docs.length} 件 → ${csvPath}`);

    return new Response(
      JSON.stringify({ success: true, document_count: docs.length, csv_path: csvPath }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('バッチ処理エラー:', message);

    // batch_exportsを失敗状態に更新
    await supabase
      .from('batch_exports')
      .update({ status: 'failed', error_message: message })
      .eq('id', batchExport.id);

    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
