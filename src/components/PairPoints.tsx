'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';

export default function PairPoints() {
  const router = useRouter();

  // 仮のペア情報（userBがnullなら未設定とみなす）
  const userA = { name: 'たろう', points: 24, image: '/images/taro.png' };
  const userB = { name: 'はなこ', points: 24, image: '/images/hanako.png' }; 
  // const userB = null; // ← ここが null なら「未設定」として表示を切り替え

  if (!userA || !userB) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-[#e5e5e5] px-4 py-6 text-center text-gray-500 font-sans text-sm">
        パートナー設定を行うと表示されます
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {[userA, userB].map((user, index) => (
        <div
          key={index}
          onClick={() => router.push('/profile')}
          className="bg-white rounded-xl shadow-md border border-[#e5e5e5] px-4 py-4 cursor-pointer hover:shadow-lg transition"
        >
          <div className="flex items-center gap-4">
            <Image
              src={user.image}
              alt={`${user.name}のアイコン`}
              width={58}
              height={58}
              className="rounded-full border-2 border-[#5E5E5E] object-cover"
            />
            <div className="text-left">
              <p className="text-sm text-gray-500 font-sans font-bold">{user.name}</p>
              <p className="text-2xl font-bold text-[#5E5E5E] font-sans">
                {user.points}
                <span className="text-sm">pt</span>
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
