// src/components/ads/AdCard.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';

// --- プラン種別 ---
// free: 広告表示
// lite: 広告非表示のみ
// premium: 広告非表示 + （アプリ全体で）LINE通知が利用可能（このコンポーネントでは非表示のみ対応）
export type Plan = 'free' | 'lite' | 'premium';

const RAKUTEN_WIDGET_HTML_RAW = process.env.NEXT_PUBLIC_RAKUTEN_WIDGET_HTML || '';
const RAKUTEN_WIDGET_HTML_B64 = process.env.NEXT_PUBLIC_RAKUTEN_WIDGET_HTML_B64 || '';
const RAKUTEN_SINGLE_HTML_RAW = process.env.NEXT_PUBLIC_RAKUTEN_SINGLE_HTML || '';
const RAKUTEN_SINGLE_HTML_B64 = process.env.NEXT_PUBLIC_RAKUTEN_SINGLE_HTML_B64 || '';

type CardProps = {
  title: string;
  children: ReactNode;
  badge?: string;
  onClose?: () => void;
  showClose?: boolean;
};

function Card({ title, children, onClose, showClose }: CardProps) {
  return (
    <div className="relative w-full h-full rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {/* 右上バッジ */}
      {/* {badge && (
        <span className="absolute right-3 top-3 inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {badge}
        </span>
      )} */}

      {/* × ボタン（free のときのみ表示。押してもカードは閉じず、課金導線へ） */}
      {showClose && onClose && (
        <button
          type="button"
          aria-label="広告を閉じる"
          onClick={onClose}
          className="absolute right-3 top-4 inline-flex h-7 items-center justify-center rounded-full bg-red-400 px-3 text-xs text-white hover:bg-red-600"
        >
          PRを非表示にする
        </button>
      )}

      {/* タイトル */}
      <h3 className="mb-3 text-base font-semibold text-gray-800">{title}</h3>

      <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
        ※ 当サイトは楽天アフィリエイトに参加しています。
      </p>

      {children}
    </div>
  );
}

/**
 * AdCard
 * - plan が 'lite' | 'premium' の場合は広告を描画しない（無料のみ表示）
 * - × ボタンは「課金ページへの案内のみ」。カード自体は閉じない
 * - plan は親から渡してください（例: <AdCard plan={user.plan} />）
 */
export default function AdCard({ plan = 'free' }: { plan?: Plan }) {
  const router = useRouter();

  // ✅ Hooks はコンポーネント冒頭で固定順序で宣言（早期 return はしない）
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [isLocal, setIsLocal] = useState(false);
  useEffect(() => {
    try {
      const host = window.location.hostname;
      setIsLocal(host === 'localhost' || host === '127.0.0.1');
    } catch {
      // ignore
    }
  }, []);

  const showAds = plan === 'free'; // JSX 側で分岐（早期 return しない）

  const rakutenFallbackUrl = useMemo(() => {
    return 'https://search.rakuten.co.jp/search/mall/%E5%AE%B6%E4%BA%8B/';
  }, []);

  const rakutenSingleHtml = useMemo(() => {
    if (!mounted) return '';
    if (RAKUTEN_SINGLE_HTML_B64) {
      try {
        // ブラウザ環境での base64 デコード
        return atob(RAKUTEN_SINGLE_HTML_B64);
      } catch {
        return '';
      }
    }
    return RAKUTEN_SINGLE_HTML_RAW;
  }, [mounted]);

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

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeHeight, setIframeHeight] = useState<number>(140);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = (e as MessageEvent & { data?: { type?: string; height?: number } }).data;
      if (data?.type === 'rk_iframe_resize' && typeof data.height === 'number') {
        setIframeHeight(Math.max(140, Math.ceil(data.height)));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

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
  [style*="width:504px"], [style*="width: 504px"] { width:100% !important; }
  [style*="width:240px"], [style*="width: 240px"],
  [style*="width:248px"], [style*="width: 248px"] { width:auto !important; }
  img[alt*="Rakuten"], img[alt*="楽天"],
  .rakuten-logo, .rk-logo, [class*="rakuten-logo"], [id*="rakuten-logo"] {
    display:block !important; float:none !important; position:static !important;
    margin:0 0 8px !important; max-width:100% !important; height:auto !important; z-index:auto !important;
  }
  [style*="float:right"], [style*="float: right"],
  [style*="position:absolute"], [style*="position: absolute"]{
    float:none !important; position:static !important;
  }
  @media (max-width: 520px){
    table, tbody, tr, td, div{max-width:100% !important;}
    tr, td{display:block !important; width:100% !important;}
    td[style*="width:240px"], td[style*="width: 240px"]{margin-bottom:8px;}
    #rk-inner{padding:6px 4px;}
  }
  #rk-root{width:100% !重要; max-width:100% !important;}
  #rk-inner::after { content:""; display:block; clear:both; }
</style>
</head><body>
  <div id="rk-root">
    <div id="rk-inner">${rakutenSingleHtml}</div>
    <div style="clear:both;height:0;line-height:0;"></div>
  </div>
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

  // ×ボタン押下時：カードは閉じず、課金ページへ誘導のみ
  const handleClickClose = () => {
    const go = window.confirm(
      '広告を非表示にするには「Lite」または「Premium」プランのご利用が必要です。\n今すぐ料金プランをご確認しますか？'
    );
    if (go) {
      router.push('/pricing?ref=ad_x');
    }
  };

  return (
    <section className="mt-4">
      <div className="mx-auto w-full max-w-xl px-2">
        {/* ここは広告の有無に関わらずテキストは残す（必要なら削除可） */}
        <p className="mb-2 text-center text-[11px] text-gray-500">
          本セクションにはプロモーションが含まれます。
        </p>

        <div className="grid grid-cols-1 items-stretch gap-3 sm:gap-4">
          {/* ✅ JSX 内で分岐：Hooks は上で既にすべて宣言済み */}
          {showAds ? (
            <Card title="おすすめ商品を楽天で探す" badge="PR" onClose={handleClickClose} showClose>
              {mounted && singleSrcDoc && !/<script/i.test(rakutenSingleHtml) ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    {isLocal && (
                      <span className="ml-1 inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                        アフィリエイト有効（単品HTML）
                      </span>
                    )}
                  </p>
                  <iframe
                    ref={iframeRef}
                    className="w-full border-0"
                    style={{ height: iframeHeight }}
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
                        // ignore
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    楽天ポイントを貯めたい方はこちら。
                    {isLocal &&
                      (rakutenWidgetHtml ? (
                        <span className="ml-1 inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                          アフィリエイト有効（ウィジェット）
                        </span>
                      ) : (
                        <span className="ml-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          ウィジェット未設定（通常リンク）
                        </span>
                      ))}
                  </p>
                  {mounted && rakutenWidgetHtml ? (
                    <div
                      className="min-h-[60px]"
                      dangerouslySetInnerHTML={{ __html: rakutenWidgetHtml }}
                    />
                  ) : (
                    <>
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
            </Card>
          ) : null}
        </div>
      </div>
    </section>
  );
}
