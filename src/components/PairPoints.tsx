// src/components/PairPoints.tsx

'use client';

export default function PairPoints() {
  const userA = { name: 'たろう', points: 24, image: '/images/taro.png' };
  const userB = { name: 'はなこ', points: 18, image: '/images/hanako.png' };

  return (
    <div className="grid grid-cols-2 gap-4">
      {[userA, userB].map((user, index) => (
        <div
          key={index}
          className="bg-white rounded-xl shadow-md border border-[#e5e5e5] px-4 py-5"
        >
          <div className="flex items-center gap-4">
            <img
              src={user.image}
              alt={`${user.name}のアイコン`}
              className="w-22 h-22 rounded-full border-2 border-[#5E5E5E] object-cover"
            />
            <div className="text-left">
              <p className="text-xl text-gray-500 font-sans font-bold">{user.name} さん</p>
              <p className="text-2xl font-bold text-[#5E5E5E] font-sans">{user.points} pt</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
