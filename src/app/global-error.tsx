'use client';

export default function GlobalError({
  error,
  reset: _reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fffaf1',
          color: '#5E5E5E',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ maxWidth: 360, padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>画面を表示できませんでした</p>
          <p style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 16px' }}>
            {error?.message || '読み込み中に問題が起きました。'}
          </p>
          <button
            type="button"
            onClick={() => {
              const reload = () => location.reload();
              try {
                if (!navigator.serviceWorker?.getRegistrations) {
                  reload();
                  return;
                }
                void navigator.serviceWorker
                  .getRegistrations()
                  .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
                  .finally(reload);
              } catch {
                reload();
              }
            }}
            style={{
              minHeight: 44,
              padding: '0 20px',
              border: 0,
              borderRadius: 12,
              background: '#FFCB7D',
              color: '#fff',
              fontWeight: 700,
            }}
          >
            読み直す
          </button>
        </div>
      </body>
    </html>
  );
}
