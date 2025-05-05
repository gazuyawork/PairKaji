'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import FooterNav from '@/components/FooterNav';
import { Mail, MessageCircle } from 'lucide-react';

export default function ContactPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // ここに送信処理を実装（例: Firebase Functions や SendGrid）
    setSubmitted(true);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
      <Header title="Contact" />

      <main className="flex-1 px-4 py-6">
        {submitted ? (
          <div className="text-center mt-20">
            <p className="text-lg font-bold text-[#5E5E5E]">お問い合わせを送信しました。</p>
            <p className="text-sm text-gray-500 mt-2">ご入力いただいた内容は確認後、必要に応じてご連絡いたします。</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-6">
            <div>
              <label className="block text-gray-600 mb-1">メールアドレス</label>
              <div className="flex items-center border border-gray-300 rounded-xl px-3 py-2 bg-white">
                <Mail size={20} className="text-gray-400 mr-2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="your@example.com"
                  className="flex-1 outline-none text-[#5E5E5E] bg-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-gray-600 mb-1">お問い合わせ内容</label>
              <div className="flex items-start border border-gray-300 rounded-xl px-3 py-2 bg-white">
                <MessageCircle size={20} className="text-gray-400 mr-2 mt-1" />
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  placeholder="内容を入力してください"
                  className="flex-1 outline-none text-[#5E5E5E] bg-transparent resize-none h-32"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-[#FFCB7D] text-white font-bold py-3 rounded-xl shadow-md hover:opacity-90"
            >
              送信する
            </button>
          </form>
        )}
      </main>

      <FooterNav />
    </div>
  );
}
