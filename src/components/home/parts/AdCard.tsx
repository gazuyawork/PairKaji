'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';

/**
 * AdCard
 * - Amazon アソシエイト: NEXT_PUBLIC_AMAZON_TAG が設定されていればアフィリンク、未設定なら通常リンク
 * - 楽天アフィリエイト: NEXT_PUBLIC_RAKUTEN_WIDGET_HTML に管理画面のHTMLをそのまま入れると表示
 *   （未設定時は通常リンクフォールバック）
 *
 * 環境変数例（Vercel Dashboard -> Settings -> Environment Variables）:
 *  - NEXT_PUBLIC_AMAZON_TAG=yourtag-22
 *  - NEXT_PUBLIC_RAKUTEN_WIDGET_HTML=<楽天管理画面で発行されたHTMLをそのまま貼り付け>
 */

const AMAZON_TAG = process.env.NEXT_PUBLIC_AMAZON_TAG || '';
const RAKUTEN_WIDGET_HTML = process.env.NEXT_PUBLIC_RAKUTEN_WIDGET_HTML || '';

/** 共通のカードラッパ */
function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-base font-semibold text-gray-800">{title}</h3>
      {children}
    </div>
  );
}

export default function AdCard() {
  // 外部ウィジェットはクライアントマウント後に描画して SSR 不整合を避ける
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ====== Amazon ======
  // ここでは「家事」での検索結果に飛ばす例。必要に応じてキーワードを変更してください。
  const amazonSearchUrl = useMemo(() => {
    const base = new URL('https://www.amazon.co.jp/s');
    base.searchParams.set('k', '家事');
    // タグがあれば付与（アソシエイト）
    if (AMAZON_TAG) base.searchParams.set('tag', AMAZON_TAG);
    return base.toString();
  }, []);

  // ====== 楽天 ======
  // RAKUTEN_WIDGET_HTML が設定されていれば、それをそのまま描画（<script>含む可）
  // 未設定の場合は通常検索リンクのフォールバック
  const rakutenFallbackUrl = useMemo(() => {
    // 楽天市場の検索ページ（フォールバック）
    // ※ これはアフィではありません。必ずウィジェットHTMLを設定してください。
    return 'https://search.rakuten.co.jp/search/mall/%E5%AE%B6%E4%BA%8B/';
  }, []);

  return (
    <section className="mt-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Amazon ブロック */}
        <Card title="おすすめ商品をAmazonで探す">
          {/* 任意：Amazon 公式バナーHTMLを使う場合は、管理画面で取得したコードを
              NEXT_PUBLIC_AMAZON_BANNER_HTML として同様に描画する方式にしてもOK。
              ここでは確実に動く「検索リンク」+ ボタンを既定にしています。 */}
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

            {/* バナーを使いたい場合のプレースホルダ
                - Amazonアソシエイト管理画面で生成した「画像リンク」の <a><img/></a> を
                  そのまま環境変数に入れて描画したい場合は、以下を使ってください。
                - 例: NEXT_PUBLIC_AMAZON_BANNER_HTML="<a href='...' target='_blank' ...><img src='...'/></a>"
            */}
            {mounted && process.env.NEXT_PUBLIC_AMAZON_BANNER_HTML ? (
              <div
                className="pt-2"
                dangerouslySetInnerHTML={{
                  __html: process.env.NEXT_PUBLIC_AMAZON_BANNER_HTML,
                }}
              />
            ) : null}
          </div>
        </Card>

        {/* 楽天ブロック */}
        <Card title="おすすめ商品を楽天で探す">
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              楽天ポイントを貯めたい方はこちら。
              {RAKUTEN_WIDGET_HTML ? (
                <span className="ml-1 inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                  アフィリエイト有効（ウィジェット）
                </span>
              ) : (
                <span className="ml-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  ウィジェット未設定（通常リンク）
                </span>
              )}
            </p>

            {/* ウィジェットHTML（<script>含む）をそのまま描画 */}
            {mounted && RAKUTEN_WIDGET_HTML ? (
              <div
                className="min-h-[60px]"
                dangerouslySetInnerHTML={{ __html: RAKUTEN_WIDGET_HTML }}
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
        </Card>
      </div>

      {/* 注意書き */}
      <p className="mt-3 text-center text-[11px] leading-relaxed text-gray-500">
        ※ アフィリエイトID/ウィジェットが未設定の場合は通常リンクで表示されます。
        収益化するには、各サービスの管理画面で発行したタグ/ウィジェットを環境変数に設定してください。
      </p>
    </section>
  );
}
