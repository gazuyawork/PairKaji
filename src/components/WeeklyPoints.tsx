// src/components/WeeklyPoints.tsx

'use client';

export default function WeeklyPoints() {
  // 仮の進捗値（例：42/100）
  const points = 42;
  const maxPoints = 100;
  const percent = (points / maxPoints) * 100;

  return (
    <div className="bg-white rounded-xl shadow-md border border-[#e5e5e5] px-6 py-5 text-center mb-4">
      <p className="text-gray-500 font-sans font-bold">今週の合計ポイント</p>
      {/* 横棒グラフ */}
      <div className="mt-4 h-6 w-full bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#FFCB7D]"
          style={{ width: `${percent}%`, transition: 'width 0.5s ease-in-out' }}
        ></div>
      </div>
      <p className="text-2xl font-bold text-[#5E5E5E] mt-2 font-sans">{points} / {maxPoints} pt</p>
    </div>
  );
}
