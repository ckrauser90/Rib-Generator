import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className = "" }: PageHeaderProps) {
  return (
    <header className={`flex flex-col gap-4 mb-8 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-brown-800 dark:text-cream-100">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 text-sm text-sand-500 dark:text-sand-400">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}