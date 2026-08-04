import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

// Mirrors the exact colors/radii already used by every inline-style button
// in the app (accent #1E5B8C, danger #B23B3B, 8px radius, 700-weight
// labels) - a FOH screen built with this component should look completely
// at home next to the existing back-office screens.
const variantClasses: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent/90",
  secondary: "bg-transparent text-ink border border-border-strong hover:bg-surface-alt",
  danger: "bg-danger text-white hover:bg-danger/90",
  ghost: "bg-transparent text-slate hover:text-ink",
};

const sizeClasses: Record<Size, string> = {
  sm: "text-xs px-3 py-1.5",
  md: "text-sm px-4 py-2.5",
};

export default function Button({ variant = "primary", size = "md", className = "", children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={`font-bold rounded-lg cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {children}
    </button>
  );
}
