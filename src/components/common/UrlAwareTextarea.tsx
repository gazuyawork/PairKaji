'use client';

import React, {
    forwardRef,
    useEffect,
    useMemo,
    useRef,
    TextareaHTMLAttributes,
} from 'react';

type BaseTextareaProps = Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    'value' | 'onChange' | 'className' | 'placeholder' | 'maxLength'
>;

type Props = BaseTextareaProps & {
    /** 表示値（必須・controlled） */
    value: string;
    /** ネイティブの onChange イベント（selectionStart/End を親で取得可能） */
    onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    /** 見た目用クラス */
    className?: string;
    /** プレースホルダ */
    placeholder?: string;
    /** 文字数上限（超過は切り捨て） */
    maxLen?: number;
    /** スクロール時の通知（必要なら） */
    onScroll?: (e: React.UIEvent<HTMLTextAreaElement>) => void;
    /** 最大高さ(px) 指定が無い場合はコンテンツに合わせる */
    maxHeightPx?: number;
};

/* HTMLエスケープ */
const escapeHtml = (s: string) =>
    s
        .replaceAll(/&/g, '&amp;')
        .replaceAll(/</g, '&lt;')
        .replaceAll(/>/g, '&gt;')
        .replaceAll(/"/g, '&quot;')
        .replaceAll(/'/g, '&#39;');

/** URLだけ <span class="text-blue-600">..</span> に置換（クリック不可・装飾のみ） */
const highlightUrls = (escaped: string) => {
    // 句読点や各種カッコの閉じを凡例として外す
    const urlRegex = /\b((https?:\/\/|www\.)[^\s<>"'）)】\]}、。！？\u3000]+)/gi;
    return escaped.replace(urlRegex, (raw) => {
        return `<span class="text-blue-600">${raw}</span>`;
    });
};

const UrlAwareTextarea = forwardRef<HTMLTextAreaElement, Props>(function UrlAwareTextarea(
    {
        value,
        onChange,
        className,
        placeholder = '備考を入力',
        maxLen = 500,
        onScroll,
        maxHeightPx,
        ...rest
    },
    ref
) {
    const taRef = useRef<HTMLTextAreaElement | null>(null);
    const hiRef = useRef<HTMLDivElement | null>(null);

    // 親からの ref と内部 ref を同期
    const setRefs = (el: HTMLTextAreaElement | null) => {
        taRef.current = el;
        if (!ref) return;
        if (typeof ref === 'function') ref(el);
        else (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    };

    // ハイライトHTMLをメモ化
    const highlightHtml = useMemo(() => {
        const safe = escapeHtml(value ?? '');
        // 空文字でも改行や行高を保つために、末尾改行の時はゼロ幅空白をつける
        return highlightUrls(safe) + (safe.endsWith('\n') ? '\u200B' : '');
    }, [value]);

    // スクロール同期: textarea -> highlight
    const syncScroll = () => {
        const ta = taRef.current;
        const hi = hiRef.current;
        if (!ta || !hi) return;
        hi.scrollTop = ta.scrollTop;
        hi.scrollLeft = ta.scrollLeft;
    };

    useEffect(() => {
        syncScroll();
    }, [value]);

    // 高さ制御（maxHeightPx があればスクロール、無ければ内容にフィット）
    useEffect(() => {
        const ta = taRef.current;
        const hi = hiRef.current;
        if (!ta || !hi) return;

        if (maxHeightPx) {
            ta.style.maxHeight = `${maxHeightPx}px`;
            hi.style.maxHeight = `${maxHeightPx}px`;
            ta.style.overflowY = 'auto';
            hi.style.overflowY = 'auto';
        } else {
            ta.style.maxHeight = '';
            hi.style.maxHeight = '';
            ta.style.overflowY = 'hidden';
            hi.style.overflowY = 'hidden';
        }

        // 行数に合わせて高さを調整
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(ta.scrollHeight, maxHeightPx ?? ta.scrollHeight)}px`;
        hi.style.height = ta.style.height;
    }, [value, maxHeightPx]);

    return (
        <div className="relative w-full">
            {/* 下敷き：ハイライトレイヤー（URLだけ青） */}
            <div
                ref={hiRef}
                className={[
                    'pointer-events-none whitespace-pre-wrap break-words',
                    'w-full border-b border-gray-300',
                    'text-[#111] leading-[1.5rem]',
                    'px-0 py-0',
                    'font-sans',
                    'min-h-[1.5rem]',
                    'absolute inset-0',
                    'pr-2', // スクロール余白
                ].join(' ')}
                style={{ WebkitOverflowScrolling: 'touch' as any }}
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: highlightHtml || '' }}
            />

            {/* 入力本体：文字は透明、キャレットだけ見せる（オーバーレイ） */}
            <textarea
                ref={setRefs}
                value={value}
                onChange={(e) => {
                    // 超過分は切り捨て（親の setState 呼び出しは onChange 側に委ねる）
                    if (maxLen && e.target.value.length > maxLen) {
                        e.target.value = e.target.value.slice(0, maxLen);
                    }
                    onChange?.(e);
                }}
                onScroll={(e) => {
                    syncScroll();
                    onScroll?.(e);
                }}
                onInput={syncScroll}
                placeholder={placeholder}
                className={[
                    'w-full border-b border-gray-300 focus:outline-none focus:border-blue-500',
                    'resize-none bg-transparent',
                    'whitespace-pre-wrap break-words',
                    'leading-[1.5rem]',
                    'min-h-[1.5rem]',
                    'font-sans',
                    'text-transparent caret-[#111]',
                    'pr-2', // ★ 追加：ハイライトと折り返し位置を揃える
                    '[-webkit-overflow-scrolling:touch]',
                    className ?? '',
                ].join(' ')}
                style={{
                    // ハイライトと完全に重ねる
                    position: 'relative',
                    background: 'transparent',
                }}
                {...rest}
            />
        </div>
    );
});

UrlAwareTextarea.displayName = 'UrlAwareTextarea';

export default UrlAwareTextarea;
