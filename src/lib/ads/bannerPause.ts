type Listener = () => void;

let pauseCount = 0;
const listeners = new Set<Listener>();

export function getNativeBannerPauseCount(): number {
  return pauseCount;
}

export function subscribeNativeBannerPause(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function pauseNativeBanner(): void {
  pauseCount += 1;
  listeners.forEach((listener) => listener());
}

export function resumeNativeBanner(): void {
  pauseCount = Math.max(0, pauseCount - 1);
  listeners.forEach((listener) => listener());
}
