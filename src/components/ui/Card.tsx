import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export default function Card({ className = "", children, ...rest }: CardProps) {
  return (
    <div {...rest} className={`bg-surface border border-border rounded-xl p-4 ${className}`}>
      {children}
    </div>
  );
}
