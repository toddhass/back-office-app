import { Store } from "lucide-react";

// Shown only during the brief initial auth check (see App.tsx's
// `if (loading)` branch) - replaces the previous plain "Loading…" text.
// Built with Tailwind, per the new convention for anything new.
export default function SplashScreen() {
  return (
    <div className="bg-canvas min-h-screen flex flex-col items-center justify-center gap-4 font-sans">
      <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center animate-modal-pop">
        <Store size={30} color="#FFFFFF" />
      </div>
      <div className="text-xl font-bold text-ink tracking-tight">Back Office</div>
      <div className="flex gap-1.5 mt-1">
        <span className="w-1.5 h-1.5 rounded-full bg-accent/40 animate-[pulse_1.4s_ease-in-out_infinite]" />
        <span className="w-1.5 h-1.5 rounded-full bg-accent/40 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
        <span className="w-1.5 h-1.5 rounded-full bg-accent/40 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
      </div>
    </div>
  );
}
