import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./ui";

/** Subtle "Created by" chip in the footer; opens the author's contact card. */
export function CreatedBy({ menuItem, onOpen }: { menuItem?: boolean; onOpen?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [open]);
  return <>
    {menuItem
      ? <button role="menuitem" className="menu-item" onClick={() => { setOpen(true); onOpen?.(); }}><img className="menu-by" src="/andrey.jpg" alt="" /><span><b>Created by Andrey Alchin</b><span>Contact, website and LinkedIn.</span></span></button>
      : <button className="by-btn" onClick={() => setOpen(true)} aria-haspopup="dialog"><img src="/andrey.jpg" alt="" /><span>Created by <b>Andrey Alchin</b></span></button>}
    {open && createPortal(
      <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
        <div className="modal by-card" role="dialog" aria-modal="true" aria-label="Created by Andrey Alchin">
          <button className="icon-btn by-x" aria-label="Close" onClick={() => setOpen(false)}>{Icon.x(16)}</button>
          <img className="by-ph" src="/andrey.jpg" alt="Andrey Alchin" />
          <p className="by-kicker">Created by</p>
          <h2>Andrey Alchin</h2>
          <p className="by-role">Technical Product Manager | AI &amp; 0-1 Prototyping</p>
          <ul className="by-links">
            <li><span>Email</span><a href="https://www.linkedin.com/in/aalchin">linkedin.com/in/aalchin</a></li>
            <li><span>Website</span><a href="https://www.linkedin.com/in/aalchin" target="_blank" rel="noopener">linkedin.com/in/aalchin ↗</a></li>
            <li><span>LinkedIn</span><a href="https://www.linkedin.com/in/aalchin" target="_blank" rel="noopener">linkedin.com/in/aalchin ↗</a></li>
            <li><span>GitHub</span><a href="https://github.com/andreyalchin" target="_blank" rel="noopener">github.com/andreyalchin ↗</a></li>
          </ul>
          <p className="by-made">Built for the PayPal AI Hackathon 2026 · Made with Perplexity Computer</p>
        </div>
      </div>, document.body)}
  </>;
}
