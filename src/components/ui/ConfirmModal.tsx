import React, { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import {
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Sparkles,
  Loader2,
  X,
  Layers,
  Check,
} from 'lucide-react';

export type ConfirmVariant = 'danger' | 'warning' | 'primary' | 'success';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  icon?: React.ReactNode;
  badgeLabel?: string;
  checkboxLabel?: string;
  onCheckboxChange?: (checked: boolean) => void;
  checkboxDefaultChecked?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  icon,
  checkboxLabel,
  onCheckboxChange,
  checkboxDefaultChecked = false,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isChecked, setIsChecked] = useState(checkboxDefaultChecked);

  const handleCheckboxToggle = (val: boolean) => {
    setIsChecked(val);
    if (onCheckboxChange) {
      onCheckboxChange(val);
    }
  };

  const handleConfirmClick = async () => {
    try {
      setIsLoading(true);
      await onConfirm();
      onClose();
    } catch (e) {
      console.error('Confirmation action error', e);
    } finally {
      setIsLoading(false);
    }
  };

  const getVariantConfig = () => {
    switch (variant) {
      case 'danger':
        return {
          iconContainer: 'bg-rose-50 text-rose-600',
          defaultIcon: <Trash2 className="w-6 h-6 text-rose-600" />,
          btnConfirmClasses: 'bg-rose-600 hover:bg-rose-700',
        };
      case 'warning':
        return {
          iconContainer: 'bg-amber-50 text-amber-600',
          defaultIcon: <AlertTriangle className="w-6 h-6 text-amber-600" />,
          btnConfirmClasses: 'bg-amber-600 hover:bg-amber-700',
        };
      case 'success':
        return {
          iconContainer: 'bg-emerald-50 text-emerald-600',
          defaultIcon: <CheckCircle2 className="w-6 h-6 text-emerald-600" />,
          btnConfirmClasses: 'bg-emerald-600 hover:bg-emerald-700',
        };
      case 'primary':
      default:
        return {
          iconContainer: 'bg-indigo-50 text-indigo-600',
          defaultIcon: <Sparkles className="w-6 h-6 text-indigo-600" />,
          btnConfirmClasses: 'bg-indigo-600 hover:bg-indigo-700',
        };
    }
  };

  const config = getVariantConfig();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      showCloseButton={false}
      noPadding={true}
    >
      <div className="relative bg-white">
        {!isLoading && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-20 w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
            title="Close dialog (Esc)"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="px-6 pt-7 pb-6 sm:px-8 text-center">
          <div
            className={`mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center ${config.iconContainer}`}
          >
            {icon || config.defaultIcon}
          </div>

          <h3 className="text-lg font-semibold text-slate-900 tracking-tight mb-2">
            {title}
          </h3>

          <div className="text-sm text-slate-600 leading-relaxed max-w-sm mx-auto mb-6">
            {typeof message === 'string' ? <p>{message}</p> : message}
          </div>

          {checkboxLabel && (
            <div className="mb-6 p-3.5 bg-slate-50 rounded-xl flex items-center justify-start text-left gap-3 hover:bg-slate-100 transition-colors cursor-pointer"
              onClick={() => !isLoading && handleCheckboxToggle(!isChecked)}
            >
              <div
                className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                  isChecked
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'border-slate-300 bg-white'
                }`}
              >
                {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
              <label
                htmlFor="confirm-modal-checkbox"
                className="text-xs font-medium text-slate-700 cursor-pointer select-none leading-snug flex-1"
                onClick={(e) => e.stopPropagation()}
              >
                {checkboxLabel}
              </label>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row items-center justify-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={onClose}
              disabled={isLoading}
              className="w-full sm:w-auto min-w-[110px]"
            >
              {cancelText}
            </Button>

            <button
              type="button"
              onClick={handleConfirmClick}
              disabled={isLoading}
              className={`w-full sm:w-auto min-w-[140px] px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${config.btnConfirmClasses}`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>Processing...</span>
                </>
              ) : (
                confirmText
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
