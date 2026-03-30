"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-terracotta-500 text-white
    hover:bg-terracotta-600
    active:bg-terracotta-600
    disabled:bg-cream-300 disabled:text-sand-400
  `,
  secondary: `
    bg-cream-200 text-brown-800 border border-cream-300
    hover:bg-cream-300
    active:bg-cream-300
    disabled:bg-cream-100 disabled:text-sand-400 disabled:border-cream-200
    dark:bg-night-700 dark:text-cream-100 dark:border-night-600
    dark:hover:bg-night-600
    dark:disabled:bg-night-800 dark:disabled:text-sand-400 dark:disabled:border-night-700
  `,
  ghost: `
    bg-transparent text-brown-700
    hover:bg-cream-200
    active:bg-cream-300
    disabled:text-sand-400
    dark:text-cream-100 dark:hover:bg-night-700
    dark:disabled:text-sand-400
  `,
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm rounded-md gap-1.5",
  md: "h-10 px-4 text-base rounded-md gap-2",
  lg: "h-12 px-6 text-lg rounded-lg gap-2.5",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", isLoading, className = "", children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`
          inline-flex items-center justify-center font-medium
          transition-colors duration-200 ease-out
          cursor-pointer select-none
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-500
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `.trim()}
        {...props}
      >
        {isLoading ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Loading...</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";