// src/components/ads/AdCard.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
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
 *
 * 環境変数例:
 *  - NEXT_PUBLIC_AMAZON_TAG=yourtag-22
 *  - NEXT_PUBLIC_AMAZON_BANNER_HTML=<a href="..."><img src="..."/></a>
 *  - NEXT_PUBLIC_RAKUTEN_SINGLE_HTML=<table ...>...</table>
 *  - NEXT_PUBLIC_RAKUTEN_SINGLE_HTML_B64=<Base64文字列>
 *  - NEXT_PUBLIC_RAKUTEN_WIDGET_HTML=<script ...><script>...</script>
 *  - NEXT_PUBLIC_RAKUTEN_WIDGET_HTML_B64=<Base64文字列>
 */

// ====== 環境変数（Amazon）======
const AMAZON_TAG = process.env.NEXT_PUBLIC_AMAZON_TAG || '';
const AMAZON_BANNER_HTML = process.env.NEXT_PUBLIC_AMAZON_BANNER_HTML || '';

// ====== 環境変数（楽天：ウィジェット系）======
const RAKUTEN_WIDGET_HTML_RAW = process.env.NEXT_PUBLIC_RAKUTEN_WIDGET_HTML || '';
const RAKUTEN_WIDGET_HTML_B64 = process.env.NEXT_PUBLIC_RAKUTEN_WIDGET_HTML_B64 || '';

// ====== 楽天：単品HTML系（★追加済み）======
const RAKUTEN_SINGLE_HTML_RAW = process.env.NEXT_PUBLIC_RAKUTEN_SINGLE_HTML || '';
const RAKUTEN_SINGLE_HTML_B64 = process.env.NEXT_PUBLIC_RAKUTEN_SINGLE_HTML_B64 || '';

/** 共通のカードラッパ */
function Card({
  title,
  children,
  badge, // PRなどの表示に使用
}: {
  title: string;
  children: ReactNode;
  badge?: string;
}) {
  return (
    <div className="w-full h-full rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-800">{title}</h3>
        {badge ? (
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{badge}</span>
        ) : null}
      </div>
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
    // これはアフィではありません。収益化は単品/ウィジェットを設定してください。
    return 'https://search.rakuten.co.jp/search/mall/%E5%AE%B6%E4%BA%8B/';
  }, []);

  // ====== 楽天：単品HTMLの復号（CSRのみ atob）======
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

  // ====== iframe 用の ref と高さ ======
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeHeight, setIframeHeight] = useState<number>(140);

  // 子iframeから高さ通知を受け取る
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e?.data?.type === 'rk_iframe_resize' && typeof e.data.height === 'number') {
        setIframeHeight(Math.max(140, Math.ceil(e.data.height)));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // ====== 単品HTMLを iframe の srcDoc でサンドボックス表示（強制レスポンシブ + 自動高さ）======
  const singleSrcDoc = useMemo(() => {
    if (!rakutenSingleHtml) return '';
    return `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  html,body{margin:0;padding:0;overflow-x:hidden;}
  *,*::before,*::after{box-sizing:border-box;}
  img{max-width:100%;height:auto;display:block}
  a{text-decoration:none}
  table{border-collapse:collapse;max-width:100% !important;width:100% !important;}
  td,th{vertical-align:top;}
  /* 固定幅上書き（代表例） */
  [style*="width:504px"], [style*="width: 504px"] { width:100% !important; }
  [style*="width:240px"], [style*="width: 240px"],
  [style*="width:248px"], [style*="width: 248px"] { width:auto !important; }

  /* 横並びを崩して縦積み（狭幅時） */
  @media (max-width: 520px){
    table, tbody, tr, td, div{max-width:100% !important;}
    tr, td{display:block !important; width:100% !important;}
    td[style*="width:240px"], td[style*="width: 240px"]{margin-bottom:8px;}
    [style*="float:right"], [style*="float: right"]{ float:none !important; }
    #rk-inner{padding:4px 2px;}
  }

  /* 可能なら全体の枠も100%化 */
  #rk-root{width:100% !important; max-width:100% !important;}
</style>
</head><body>
  <div id="rk-root"><div id="rk-inner">${rakutenSingleHtml}</div></div>
  <script>
    (function(){
      function fit(){
        try{
          var h = Math.max(
            document.body.scrollHeight||0,
            document.documentElement.scrollHeight||0
          );
          document.body.style.height = h + 'px';
          try{ parent.postMessage({ type:'rk_iframe_resize', height: h }, '*'); }catch(e){}
        }catch(e){}
      }
      window.addEventListener('load', fit);
      window.addEventListener('resize', fit);
      setTimeout(fit, 0);
    })();
  </script>
</body></html>`;
  }, [rakutenSingleHtml]);

  return (
    <section className="mt-4">
      {/* 最大幅と中央寄せ（SP含む全幅で2カラム、max-w-xlに収める） */}
      <div className="mx-auto w-full max-w-xl px-2">
        {/* 短い開示（セクション冒頭） */}
        <p className="mb-2 text-center text-[11px] text-gray-500">
          本セクションにはプロモーションが含まれます。
        </p>

        {/* SPでも常時2カラム、行高さ揃え */}
        <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-4">
          {/* Amazon ブロック */}
          <Card title="おすすめ商品をAmazonで探す" badge="PR">
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

              {/* ★修正：属性内コメントを削除し、rel を広告向けに */}
              <a
                href={amazonSearchUrl}
                target="_blank"
                rel="noopener sponsored nofollow"
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
            <p className="mt-3 text-center text-[11px] leading-relaxed text-gray-500">
              ※ 当サイトはAmazonアソシエイトとして、適格販売により収入を得ています。
            </p>
          </Card>

          {/* 楽天ブロック */}
          <Card title="おすすめ商品を楽天で探す" badge="PR">
            {/* 単品HTMLがあれば最優先表示（iframe + srcDoc） */}
            {mounted && singleSrcDoc && !/<script/i.test(rakutenSingleHtml) ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  楽天ポイントを貯めたい方はこちら。
                  <span className="ml-1 inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                    アフィリエイト有効（単品HTML）
                  </span>
                </p>

                <iframe
                  ref={iframeRef}
                  className="w-full border-0"
                  style={{ height: iframeHeight }}
                  // ユーザー操作の遷移/ポップアップ許容
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
                      setIframeHeight(h);
                    } catch {
                      /* noop */
                    }
                  }}
                />
              </div>
            ) : (
              // ウィジェット or フォールバック分岐
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
                  <>
                    {/* ★修正：属性内コメントを削除し、rel を広告向けに */}
                    <a
                      href={rakutenFallbackUrl}
                      target="_blank"
                      rel="noopener sponsored nofollow"
                      className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
                    >
                      楽天で探す
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </>
                )}
              </div>
            )}
            <p className="mt-3 text-center text-[11px] leading-relaxed text-gray-500">
              ※ 当サイトは楽天アフィリエイトに参加しています。
            </p>
          </Card>
        </div>
      </div>
    </section>
  );
}
