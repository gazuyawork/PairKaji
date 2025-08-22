// src/components/ads/AdCard.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';

const RAKUTEN_WIDGET_HTML_RAW = process.env.NEXT_PUBLIC_RAKUTEN_WIDGET_HTML || '';
const RAKUTEN_WIDGET_HTML_B64 = process.env.NEXT_PUBLIC_RAKUTEN_WIDGET_HTML_B64 || '';
const RAKUTEN_SINGLE_HTML_RAW = process.env.NEXT_PUBLIC_RAKUTEN_SINGLE_HTML || '';
const RAKUTEN_SINGLE_HTML_B64 = process.env.NEXT_PUBLIC_RAKUTEN_SINGLE_HTML_B64 || '';

function Card({
  title,
  children,
  badge,
}: {
  title: string;
  children: ReactNode;
  badge?: string;
}) {
  return (
    <div className="w-full h-full rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {/* ロゴ左端、PRバッジ右端 */}
      <div className="mb-2 flex items-center justify-between">
        <img
          src="https://static.affiliate.rakuten.co.jp/makelink/rl.svg"
          alt="楽天ロゴ"
          style={{
            maxHeight: '27px',
            width: 'auto',
          }}
        />
        {badge ? (
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{badge}</span>
        ) : null}
      </div>

      {/* タイトル */}
      <h3 className="mb-3 text-base font-semibold text-gray-800">{title}</h3>

      <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
        ※ 当サイトは楽天アフィリエイトに参加しています。
      </p>

      {children}

    </div>
  );
}

export default function AdCard() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [isLocal, setIsLocal] = useState(false);
  useEffect(() => {
    try {
      const host = window.location.hostname;
      setIsLocal(host === 'localhost' || host === '127.0.0.1');
    } catch { }
  }, []);

  const rakutenFallbackUrl = useMemo(() => {
    return 'https://search.rakuten.co.jp/search/mall/%E5%AE%B6%E4%BA%8B/';
  }, []);

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
      if (e?.data?.type === 'rk_iframe_resize' && typeof e.data.height === 'number') {
        setIframeHeight(Math.max(140, Math.ceil(e.data.height)));
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
    display:block !important;
    float:none !important;
    position:static !important;
    margin:0 0 8px !important;
    max-width:100% !important;
    height:auto !important;
    z-index:auto !important;
  }
  [style*="float:right"], [style*="float: right"],
  [style*="position:absolute"], [style*="position: absolute"]{
    float:none !important;
    position:static !important;
  }
  @media (max-width: 520px){
    table, tbody, tr, td, div{max-width:100% !important;}
    tr, td{display:block !important; width:100% !important;}
    td[style*="width:240px"], td[style*="width: 240px"]{margin-bottom:8px;}
    #rk-inner{padding:6px 4px;}
  }
  #rk-root{width:100% !important; max-width:100% !important;}
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

  return (
    <section className="mt-4">
      <div className="mx-auto w-full max-w-xl px-2">
        <p className="mb-2 text-center text-[11px] text-gray-500">
          本セクションにはプロモーションが含まれます。
        </p>

        <div className="grid grid-cols-1 items-stretch gap-3 sm:gap-4">
          {/* 楽天アフィリエイトカード */}
          <Card title="おすすめ商品を楽天で探す" badge="PR">
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
                    } catch { }
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
        </div>
      </div>
    </section>
  );
}
