import { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';

export interface ToastState {
  title: string;
  message: string;
  type?: 'success' | 'error' | 'info';
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const notify = useCallback((title: string, message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ title, message, type });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  return { toast, notify };
}

export function ToastView({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;
  const color = toast.type === 'error' ? '#f87171' : toast.type === 'info' ? '#60a5fa' : '#36dca9';
  return (
    <div className="toast" style={{ borderColor: `${color}40` }}>
      <div className="toast-check" style={{ background: color, color: '#06271f' }}>
        {toast.type === 'error' ? <X size={15} /> : '✓'}
      </div>
      <div>
        <strong style={{ color: toast.type === 'error' ? '#fca5a5' : '#d6f8ed' }}>{toast.title}</strong>
        <span>{toast.message}</span>
      </div>
    </div>
  );
}

export function GuideCard({ title, steps }: { title: string; steps: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="guide-card">
      <button className="guide-toggle" onClick={() => setOpen(!open)}>
        <span className="guide-icon">?</span>
        <span>{title}</span>
        <span className={`guide-chevron ${open ? 'open' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="guide-steps">
          {steps.map((step, i) => (
            <div key={i} className="guide-step">
              <span className="guide-num">{i + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="code-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        {children}
      </div>
    </div>
  );
}
