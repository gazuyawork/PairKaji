'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Header from '@/components/Header';
import { Mail, MessageCircle } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

export default function ContactPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [messageError, setMessageError] = useState('');
  const router = useRouter();

  const validateEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const stripHtml = (input: string) => {
    const div = document.createElement('div');
    div.innerHTML = input;
    return div.textContent || div.innerText || '';
  };

  const checkMxRecord = async (email: string) => {
    return email.includes('@');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setMessageError('');

    let hasError = false;

    if (!validateEmail(email)) {
      setEmailError('正しいメールアドレスを入力してください');
      hasError = true;
    } else if (email.length > 255) {
      setEmailError('メールアドレスは255文字以内で入力してください');
      hasError = true;
    } else if (!(await checkMxRecord(email))) {
      setEmailError('存在するメールアドレスを入力してください');
      hasError = true;
    }

    const strippedMessage = stripHtml(message);

    if (strippedMessage.length < 10) {
      setMessageError('お問い合わせ内容は10文字以上で入力してください');
      hasError = true;
    } else if (strippedMessage.length > 500) {
      setMessageError('お問い合わせ内容は500文字以内で入力してください');
      hasError = true;
    }

    if (hasError) return;

    const uid = auth.currentUser?.uid || null;

    try {
      await addDoc(collection(db, 'contacts'), {
        email,
        message: strippedMessage,
        userId: uid,
        createdAt: serverTimestamp(),
      });
      setSubmitted(true);
    } catch (err) {
      console.error('お問い合わせ送信エラー:', err);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
      <Header title="Contact" />
      <main className="flex-1 px-4 py-6 overflow-y-auto">
        {submitted ? (
          <div className="text-center mt-20 space-y-4">
            <p className="text-lg font-bold text-[#5E5E5E]">お問い合わせを送信しました。</p>
            <p className="text-sm text-gray-500">ご入力いただいた内容は確認後、必要に応じてご連絡いたします。</p>
            <button
              onClick={() => router.push('/main')}
              className="mt-6 bg-[#FFCB7D] text-white font-bold py-2 px-6 rounded-xl shadow-md hover:opacity-90"
            >
              ホームへ戻る
            </button>
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
                  placeholder="your@example.com"
                  maxLength={255}
                  className="flex-1 outline-none text-[#5E5E5E] bg-transparent"
                />
              </div>
              {emailError && <p className="text-red-500 text-sm mt-1">{emailError}</p>}
            </div>

            <div>
              <label className="block text-gray-600 mb-1">お問い合わせ内容</label>
              <div className="flex items-start border border-gray-300 rounded-xl px-3 py-2 bg-white">
                <MessageCircle size={20} className="text-gray-400 mr-2 mt-1" />
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="内容を入力してください"
                  maxLength={500}
                  className="flex-1 outline-none text-[#5E5E5E] bg-transparent resize-none h-32"
                />
              </div>
              {messageError && <p className="text-red-500 text-sm mt-1">{messageError}</p>}
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
    </div>
  );
}
