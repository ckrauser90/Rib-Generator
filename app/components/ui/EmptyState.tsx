import type { ReactNode } from "react";
import { Button } from "./Button";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && (
        <div className="mb-4 text-sand-400 dark:text-sand-400">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-brown-800 dark:text-cream-100 mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-sand-500 dark:text-sand-400 mb-6 max-w-sm">
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}