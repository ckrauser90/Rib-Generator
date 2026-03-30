"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}

const sizeStyles = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

export function Modal({ isOpen, onClose, title, children, footer, size = "md" }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  return createPortal(
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      style={{ animation: "fadeIn 200ms ease-out" }}
    >
      <div
        className={`
          w-full ${sizeStyles[size]}
          bg-cream-50 dark:bg-night-800
          rounded-xl shadow-xl
          animate-in zoom-in-95 duration-200
        `}
        style={{ animation: "zoomIn 200ms ease-out" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-cream-200 dark:border-night-600">
            <h2 id="modal-title" className="text-lg font-semibold text-brown-800 dark:text-cream-100">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-sand-500 hover:text-brown-700 hover:bg-cream-200 dark:hover:text-cream-100 dark:hover:bg-night-700 transition-colors"
              aria-label="Schließen"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-cream-200 dark:border-night-600">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}