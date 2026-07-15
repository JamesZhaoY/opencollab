import { useEffect } from 'react';

export type ToastTone = 'info' | 'success' | 'error' | 'loading';

export interface ToastData {
  tone: ToastTone;
  text: string;
}

interface ToastProps {
  toast: ToastData | null;
  onClose?: () => void;
  durationMs?: number;
}

export default function Toast({ toast, onClose, durationMs = 2600 }: ToastProps) {
  useEffect(() => {
    if (!toast || toast.tone === 'loading' || !onClose) return;
    const timer = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(timer);
  }, [toast, onClose, durationMs]);

  if (!toast) return null;

  return (
    <div className={`app-toast ${toast.tone}`} role="status" aria-live="polite">
      <span className="app-toast-dot" aria-hidden="true" />
      <span>{toast.text}</span>
      {toast.tone !== 'loading' && onClose && (
        <button type="button" className="app-toast-close" onClick={onClose} aria-label="关闭提示">
          ×
        </button>
      )}
    </div>
  );
}
