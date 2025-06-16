// 差額のカウントアップのアニメーション
import { useEffect, useState } from 'react';

export function useUnitPriceDifferenceAnimation(totalDifference: number | null) {
  const [animatedDifference, setAnimatedDifference] = useState<number | null>(null);
  const [animationComplete, setAnimationComplete] = useState(false);

  useEffect(() => {
    if (totalDifference !== null) {
      const duration = 1000;
      const delay = 500;

      const from = 0;
      const to = Math.abs(Math.round(totalDifference));

      const startAnimation = () => {
        const start = performance.now();

        const animate = (now: number) => {
          const elapsed = now - start;
          const progress = Math.min(elapsed / duration, 1);
          const currentValue = Math.floor(from + (to - from) * progress);
          setAnimatedDifference(currentValue);

          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            setAnimationComplete(true);
          }
        };

        requestAnimationFrame(animate);
      };

      const delayTimeout = setTimeout(() => {
        startAnimation();
      }, delay);

      return () => clearTimeout(delayTimeout);
    } else {
      setAnimatedDifference(null);
      setAnimationComplete(false);
    }
  }, [totalDifference]);

  return { animatedDifference, animationComplete };
}
