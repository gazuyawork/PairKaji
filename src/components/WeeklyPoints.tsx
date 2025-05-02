// src/components/WeeklyPoints.tsx

'use client';

export default function WeeklyPoints() {
  // 仮の進捗値（例：42/100）
  const points = 42;
  const maxPoints = 100;
  const percent = (points / maxPoints) * 100;

  return (
    <div className="bg-white rounded-xl shadow-md border border-[#e5e5e5] px-6 py-6 text-center">
      <p className="text-xl text-gray-500 font-sans font-bold">今週の合計ポイント</p>
      {/* 横棒グラフ */}
      <div className="mt-4 h-6 w-full bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#FFCB7D]"
          style={{ width: `${percent}%`, transition: 'width 0.5s ease-in-out' }}
        ></div>
      </div>
      <p className="text-2xl font-bold text-[#5E5E5E] mt-1 font-sans">{points} / {maxPoints} pt</p>
    </div>
  );
}
