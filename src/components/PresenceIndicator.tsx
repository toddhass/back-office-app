import { useState } from "react";
import { usePresence } from "../lib/usePresence";
import { good, textMuted, border, card, textPrimary } from "../lib/tokens";

// Inline-styled (not Tailwind) to match App.tsx, where this is actually
// used - the established convention is Tailwind for new screens, but this
// is a small component embedded directly into the existing inline-style
// header/sidebar, so matching that file's own convention keeps the code
// consistent where it's actually read, not just picking a style based on
// when the file was created.
export default function PresenceIndicator({ restaurantId, style }: { restaurantId: string | null; style?: React.CSSProperties }) {
  const users = usePresence(restaurantId);
  const [open, setOpen] = useState(false);

  if (users.length === 0) return null;

  return (
    <div style={{ position: "relative", ...style }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "4px 6px",
          borderRadius: 6,
          fontSize: 12,
          color: textMuted,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: good, flexShrink: 0 }} />
        {users.length} online
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 998 }} />
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: 4,
              background: card,
              border: `1px solid ${border}`,
              borderRadius: 8,
              padding: 8,
              minWidth: 190,
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              zIndex: 999,
            }}
          >
            {users.map((u) => (
              <div key={u.userId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", fontSize: 12.5, color: textPrimary }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: good, flexShrink: 0 }} />
                {u.email}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
