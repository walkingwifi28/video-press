import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

export default function InfoPopover({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const popup = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && popup.current?.contains(event.target)) return;
      popup.current?.hidePopover();
    };
    window.addEventListener('resize', dismiss);
    document.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('resize', dismiss);
      document.removeEventListener('scroll', dismiss, true);
    };
  }, []);

  return <>
    <button type="button" className="info-button" aria-label={`${label}の説明`} aria-haspopup="dialog" popoverTarget={id} onClick={(event) => {
      if (!popup.current) return;
      const anchor = event.currentTarget.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 24);
      const top = Math.max(12, anchor.bottom + 8);
      popup.current.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12))}px`;
      popup.current.style.top = `${top}px`;
      popup.current.style.maxHeight = `${Math.max(0, window.innerHeight - top - 12)}px`;
    }}>
      <span className="info-icon" aria-hidden="true" />
    </button>
    <div ref={popup} id={id} className="info-popover" popover="auto" role="dialog" aria-label={`${label}の説明`}>
      <strong>{label}</strong>
      {children}
    </div>
  </>;
}
