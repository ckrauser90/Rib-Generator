import { forwardRef, type InputHTMLAttributes, useId } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-brown-700 dark:text-cream-100">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`
            h-11 px-3 rounded-md
            bg-cream-50 border border-cream-200
            text-brown-800 placeholder:text-sand-400
            transition-colors duration-200
            hover:border-cream-300
            focus:outline-none focus:border-terracotta-500 focus:ring-2 focus:ring-terracotta-100
            disabled:bg-cream-200 disabled:text-sand-400 disabled:cursor-not-allowed
            dark:bg-night-800 dark:border-night-600 dark:text-cream-100 dark:placeholder:text-sand-400
            dark:hover:border-night-600
            dark:focus:border-terracotta-400 dark:focus:ring-terracotta-900/20
            ${error ? "border-red-500 focus:border-red-500 focus:ring-red-100" : ""}
            ${className}
          `.trim()}
          {...props}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";