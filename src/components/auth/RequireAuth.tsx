// src/components/auth/RequireAuth.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import ConfirmModal from '@/components/common/modals/ConfirmModal';

type Props = { children: React.ReactNode };

export default function RequireAuth({ children }: Props) {
    const router = useRouter();
    const pathname = usePathname();

    const [ready, setReady] = useState(false);        // 認証確認完了
    const [authed, setAuthed] = useState<boolean>(false);
    const [showExpired, setShowExpired] = useState(false);
    const wasAuthedRef = useRef(false);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => {
            if (u) {
                setAuthed(true);
                setReady(true);
                wasAuthedRef.current = true;
                setShowExpired(false);
            } else {
                setAuthed(false);
                setReady(true);
                if (wasAuthedRef.current) {
                    // ★セッション切れ or 手動ログアウト
                    const manual = sessionStorage.getItem('manualSignOut') === '1';
                    if (manual) {
                        // ★手動ログアウト時はモーダルを出さない
                        sessionStorage.removeItem('manualSignOut');
                        const from = encodeURIComponent(pathname || '/');
                        router.replace(`/login?from=${from}`);
                    } else {
                        // ★純粋なセッション切れのみモーダル表示
                        setShowExpired(true);
                    }
                } else {
                    // 初回から未ログイン
                    const from = encodeURIComponent(pathname || '/');
                    router.replace(`/login?from=${from}`);
                }
            }
        });
        return () => unsub();
    }, [router, pathname]);


    // 認証確認中
    if (!ready) {
        // ★ QuickSplash が表示中ならローディングを出さない
        const splashActive =
            typeof window !== 'undefined' && sessionStorage.getItem('splashActive') === '1';
        if (splashActive) {
            return null; // ← スプラッシュに画面制御を委ねる
        }

        // （スプラッシュが無い画面のために既存ローディングは残す）
        return (
            <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
                <div className="w-6 h-6 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }


    // 未ログイン時
    if (!authed) {
        return (
            <>
                {showExpired && (
                    <ConfirmModal
                        isOpen={true}
                        title="セッション切れ"
                        message="セッションが切れました。ログイン画面に移動します。"
                        confirmLabel="OK"
                        onConfirm={() => {
                            const from = encodeURIComponent(pathname || '/');
                            router.replace(`/login?from=${from}`);
                        }}
                    />
                )}
            </>
        );
    }

    // ログイン済み
    return <>{children}</>;
}
