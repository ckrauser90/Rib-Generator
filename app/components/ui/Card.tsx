import type { ReactNode } from "react";

type CardVariant = "default" | "elevated" | "outline";

interface CardProps {
  variant?: CardVariant;
  className?: string;
  children: ReactNode;
}

const variantStyles: Record<CardVariant, string> = {
  default: "bg-cream-50 border border-cream-200",
  elevated: "bg-cream-50 shadow-md",
  outline: "bg-transparent border-2 border-cream-200 dark:border-night-600",
};

export function Card({ variant = "default", className = "", children }: CardProps) {
  return (
    <div
      className={`
        rounded-lg p-5
        ${variantStyles[variant]}
        ${className}
      `.trim()}
    >
      {children}
    </div>
  );
}