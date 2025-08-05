// src/components/profile/LineLinkCard.tsx
'use client';

export const dynamic = 'force-dynamic';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function LineLinkCard() {
  const router = useRouter();
  const [isLinked, setIsLinked] = useState<boolean | null>(null);

  useEffect(() => {
    const fetchLinkedStatus = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const docRef = doc(db, 'users', user.uid);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setIsLinked(!!data.lineLinked);
        } else {
          setIsLinked(false);
        }
      } catch (err) {
        console.error('[LINE連携] ユーザーデータ取得失敗', err);
        setIsLinked(false);
      }
    };

    fetchLinkedStatus();
  }, []);

  if (isLinked === null || isLinked) return null; // 🔁 ローディング中 or すでに連携済みなら非表示

  return (
    <motion.div
      className="min-h-[140px] bg-white shadow rounded-2xl px-8 py-6 space-y-3 mx-auto w-full max-w-xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <p className="mb-3">
        <label className="text-[#5E5E5E] font-semibold">LINE連携</label>
      </p>
      <p className="text-gray-600 text-sm">LINEアカウントとの連携が完了していません。</p>
      <button
        onClick={() => router.push('/settings/line-link')}
        className="w-full bg-[#00c300] text-white py-2 rounded shadow text-sm"
      >
        LINEと連携する
      </button>
    </motion.div>
  );
}
