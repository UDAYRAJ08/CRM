import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
  showCloseButton?: boolean;
  noPadding?: boolean;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'lg',
  showCloseButton = true,
  noPadding = false,
  className = '',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
  }[maxWidth];

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 z-50 overflow-y-auto flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
      style={{ margin: 0 }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {/* Background backdrop click */}
      <div
        className="fixed inset-0 top-0 left-0 right-0 bottom-0"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onClose();
        }}
      />

      {/* Dialog container */}
      <div
        className={`relative w-full ${maxWidthClasses} my-auto max-h-[92vh] flex flex-col bg-white rounded-3xl shadow-2xl shadow-slate-950/30 border border-slate-200/90 overflow-hidden z-10 transform animate-in zoom-in-95 duration-200 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* If title is provided, render top header bar */}
        {title ? (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70 shrink-0">
            <div className="min-w-0 flex-1 mr-4">
              {typeof title === 'string' ? (
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 truncate">{title}</h3>
              ) : (
                title
              )}
              {description && (
                <p className="text-xs text-slate-500 mt-0.5">{description}</p>
              )}
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onClose();
                }}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 p-2 rounded-xl transition-all shrink-0 cursor-pointer"
                title="Close dialog (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        ) : showCloseButton ? (
          /* Floating close button if no header is passed */
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onClose();
            }}
            className="absolute top-4 right-4 z-20 text-slate-400 hover:text-slate-800 bg-white/90 hover:bg-white shadow-xs border border-slate-200/80 p-2 rounded-2xl transition-all cursor-pointer"
            title="Close dialog (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        ) : null}

        <div className={`overflow-y-auto flex-1 ${noPadding ? '' : 'p-5 sm:p-6'}`}>{children}</div>
      </div>
    </div>,
    document.body
  );
};
