// src/components/ads/AdCard.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState, useRef, type ReactNode } from 'react'; // ★ 変更①: useRef を追加
import { ExternalLink } from 'lucide-react';

/**
 * AdCard
 * - Amazon アソシエイト:
 *    NEXT_PUBLIC_AMAZON_TAG が設定されていればアフィリンク、未設定なら通常リンク
 *    画像バナー等を使う場合は NEXT_PUBLIC_AMAZON_BANNER_HTML に <a><img/></a> を入れて描画可能
 *
 * - 楽天アフィリエイト:
 *    ① 単品HTML（MakeLink の <table>…</table> 等）を最優先表示
 *       - NEXT_PUBLIC_RAKUTEN_SINGLE_HTML            … プレーンHTML（1行）
 *       - NEXT_PUBLIC_RAKUTEN_SINGLE_HTML_B64        … 上記を UTF-8 Base64 化（推奨）
 *    ② ランキング等のウィジェット（<script>…rakuten_widget…</script>）
 *       - NEXT_PUBLIC_RAKUTEN_WIDGET_HTML            … 管理画面のHTMLをそのまま（1行）
 *       - NEXT_PUBLIC_RAKUTEN_WIDGET_HTML_B64        … 上記を UTF-8 Base64 化
 *    ③ どちらも無ければ通常リンクフォールバック
 */

// ====== 環境変数（Amazon）======
const AMAZON_TAG = process.env.NEXT_PUBLIC_AMAZON_TAG || '';
const AMAZON_BANNER_HTML = process.env.NEXT_PUBLIC_AMAZON_BANNER_HTML || '';

// ====== 環境変数（楽天：ウィジェット系）======
const RAKUTEN_WIDGET_HTML_RAW = process.env.NEXT_PUBLIC_RAKUTEN_WIDGET_HTML || '';
const RAKUTEN_WIDGET_HTML_B64 = process.env.NEXT_PUBLIC_RAKUTEN_WIDGET_HTML_B64 || '';

// ====== ★ 追加（楽天：単品HTML系）======
const RAKUTEN_SINGLE_HTML_RAW = process.env.NEXT_PUBLIC_RAKUTEN_SINGLE_HTML || '';
const RAKUTEN_SINGLE_HTML_B64 = process.env.NEXT_PUBLIC_RAKUTEN_SINGLE_HTML_B64 || '';

/** 共通のカードラッパ */
function Card({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="w-full rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-base font-semibold text-gray-800">{title}</h3>
      {children}
    </div>
  );
}

export default function AdCard() {
  // 外部ウィジェットやENV依存の描画は、クライアントマウント後に行い SSR 不整合を回避
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ====== Amazon ======
  const amazonSearchUrl = useMemo(() => {
    const base = new URL('https://www.amazon.co.jp/s');
    base.searchParams.set('k', '家事');
    if (AMAZON_TAG) base.searchParams.set('tag', AMAZON_TAG);
    return base.toString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ====== 楽天（通常検索フォールバック）======
  const rakutenFallbackUrl = useMemo(() => {
    return 'https://search.rakuten.co.jp/search/mall/%E5%AE%B6%E4%BA%8B/';
  }, []);

  // ====== ★ 追加（楽天：単品HTMLの復号＆決定：CSRのみ）======
  const rakutenSingleHtml = useMemo(() => {
    if (!mounted) return '';
    if (RAKUTEN_SINGLE_HTML_B64) {
      try {
        return atob(RAKUTEN_SINGLE_HTML_B64);
      } catch {
        return '';
      }
    }
    return RAKUTEN_SINGLE_HTML_RAW;
  }, [mounted]);

  // ====== 楽天：ウィジェットHTMLの復号（必要な場合）======
  const rakutenWidgetHtml = useMemo(() => {
    if (!mounted) return '';
    if (RAKUTEN_WIDGET_HTML_B64) {
      try {
        return atob(RAKUTEN_WIDGET_HTML_B64);
      } catch {
        return '';
      }
    }
    return RAKUTEN_WIDGET_HTML_RAW;
  }, [mounted]);

  // ====== ★ 追加：iframe 用の ref と高さ（赤線対策：必ず使用）======
  const iframeRef = useRef<HTMLIFrameElement | null>(null);     // ← 参照を使います
  const [iframeHeight, setIframeHeight] = useState<number>(140); // ← 高さ state も実際に使います

  // 単品HTMLを iframe の srcDoc で包む（広告ブロッカーの化粧フィルタ対策）
const singleSrcDoc = useMemo(() => {
  if (!rakutenSingleHtml) return '';
  return `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  html,body{margin:0;padding:0;overflow-x:hidden;}
  img{max-width:100%;height:auto;display:block}
  a{text-decoration:none}
  table{border-collapse:collapse;max-width:100% !important;width:100% !important;}
  td,div{max-width:100% !important;}
</style>
</head><body>${rakutenSingleHtml}</body></html>`;
}, [rakutenSingleHtml]);


  return (
    <section className="mt-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Amazon ブロック */}
        <Card title="おすすめ商品をAmazonで探す">
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              家事・日用品・便利グッズなどをチェック。
              {AMAZON_TAG ? (
                <span className="ml-1 inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                  アフィリエイト有効
                </span>
              ) : (
                <span className="ml-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  タグ未設定（通常リンク）
                </span>
              )}
            </p>

            <a
              href={amazonSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              Amazonで探す
              <ExternalLink className="h-4 w-4" />
            </a>

            {/* Amazon 公式バナー（任意） */}
            {mounted && AMAZON_BANNER_HTML ? (
              <div
                className="pt-2"
                dangerouslySetInnerHTML={{ __html: AMAZON_BANNER_HTML }}
              />
            ) : null}
          </div>
        </Card>

        {/* 楽天ブロック */}
        <Card title="おすすめ商品を楽天で探す">
          {/* 単品HTMLがあれば最優先表示（iframe + srcDoc） */}
          {mounted && singleSrcDoc && !/<script/i.test(rakutenSingleHtml) ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                楽天ポイントを貯めたい方はこちら。
                <span className="ml-1 inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                  アフィリエイト有効（単品HTML）
                </span>
              </p>

              {/* ★ 変更②: div dangerouslySetInnerHTML → iframe srcDoc に置換 */}
              <iframe
                ref={iframeRef}                           // ← useRef を実使用（赤線解消）
                className="w-full border-0"
                style={{ height: iframeHeight }}          // ← state を実使用（赤線解消）
                sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
                referrerPolicy="no-referrer"
                srcDoc={singleSrcDoc}
                onLoad={() => {
                  try {
                    const doc = iframeRef.current?.contentWindow?.document;
                    if (!doc) return;
                    const h = Math.max(
                      doc.body?.scrollHeight || 0,
                      doc.documentElement?.scrollHeight || 0,
                      140
                    );
                    setIframeHeight(h);                   // ← setter も使用（赤線解消）
                  } catch {
                    /* noop */
                  }
                }}
              />
            </div>
          ) : (
            // ウィジェット or フォールバック分岐（従来どおり）
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                楽天ポイントを貯めたい方はこちら。
                {rakutenWidgetHtml ? (
                  <span className="ml-1 inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                    アフィリエイト有効（ウィジェット）
                  </span>
                ) : (
                  <span className="ml-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    ウィジェット未設定（通常リンク）
                  </span>
                )}
              </p>

              {mounted && rakutenWidgetHtml ? (
                <div
                  className="min-h-[60px]"
                  dangerouslySetInnerHTML={{ __html: rakutenWidgetHtml }}
                />
              ) : (
                <a
                  href={rakutenFallbackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
                >
                  楽天で探す
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* 注意書き */}
      <p className="mt-3 text-center text-[11px] leading-relaxed text-gray-500">
        ※ アフィリエイトID/ウィジェット/単品HTMLが未設定の場合は通常リンクで表示されます。収益化するには、各サービスの管理画面で発行したタグ/ウィジェット/HTMLを環境変数に設定してください。
      </p>
    </section>
  );
}
