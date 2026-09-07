'use client';

export const dynamic = 'force-dynamic';

import Header from '@/components/common/Header';
import { Mail } from 'lucide-react';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '@/lib/constants';

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] mt-16">
      <Header title="Contact" />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
        <p className="text-sm leading-relaxed text-gray-600">
          アプリに関するご質問・ご要望は、メールでご連絡ください。
        </p>
        <a
          href={SUPPORT_MAILTO}
          className="mt-6 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#FFCB7D] px-4 text-base font-bold text-white active:opacity-90"
        >
          <Mail className="h-5 w-5" />
          メールを送る
        </a>
        <p className="mt-3 text-center text-sm text-gray-600">{SUPPORT_EMAIL}</p>
      </main>
    </div>
  );
}
