import type { ReactNode } from "react";

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  position?: "center" | "sheet";
  maxWidth?: number;
}

// Same backdrop-fade + pop/slide motion as every existing modal in the app
// (see index.css) - just invoked as Tailwind animation utilities instead of
// an inline style prop. Position "sheet" matches AskAgentModal's
// bottom-anchored style; "center" matches everything else (edit-entity,
// auto-PO picker, notifications).
//
// Deliberately "absolute", not "fixed": a fixed modal centers on the whole
// browser viewport, but the desktop layout's content area sits to the
// right of a 240px sidebar and is itself centered within the remaining
// space - so a viewport-centered modal doesn't align with the content
// behind it (confirmed as a real, visible bug on desktop; mobile has no
// sidebar so it looked fine there). "absolute" anchors to the nearest
// positioned ancestor instead, which App.tsx's content wrapper now
// guarantees is a full-height, correctly-positioned container.
export default function Modal({ onClose, children, position = "center", maxWidth = 400 }: ModalProps) {
  const isSheet = position === "sheet";
  return (
    <div
      onClick={onClose}
      className={`absolute inset-0 bg-black/40 z-[1000] flex justify-center animate-backdrop-fade ${isSheet ? "items-end" : "items-center p-5"}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth }}
        className={`bg-surface w-full flex flex-col animate-modal-pop ${isSheet ? "rounded-t-2xl max-h-[80vh]" : "rounded-xl p-5"}`}
      >
        {children}
      </div>
    </div>
  );
}
