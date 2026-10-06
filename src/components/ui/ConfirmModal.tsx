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
  badgeLabel,
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
          topBarGradient: 'bg-gradient-to-r from-rose-500 via-red-500 to-amber-500',
          haloBg: 'bg-rose-500/25',
          iconContainer:
            'bg-gradient-to-br from-white via-rose-50 to-rose-100/90 text-rose-600 border-rose-200/90 shadow-rose-500/20 ring-4 ring-rose-500/10',
          defaultIcon: <Trash2 className="w-7 h-7 text-rose-600" />,
          pillBadge: badgeLabel || 'Destructive Action',
          pillBg: 'bg-rose-50 text-rose-700 border-rose-200/90',
          pillDot: 'bg-rose-500',
          btnConfirmClasses:
            'bg-gradient-to-r from-rose-600 via-red-600 to-rose-600 hover:from-rose-500 hover:to-red-500 shadow-md shadow-rose-600/30 hover:shadow-lg hover:shadow-rose-600/40',
        };
      case 'warning':
        return {
          topBarGradient: 'bg-gradient-to-r from-amber-400 via-orange-500 to-yellow-400',
          haloBg: 'bg-amber-500/25',
          iconContainer:
            'bg-gradient-to-br from-white via-amber-50 to-orange-100/90 text-amber-600 border-amber-200/90 shadow-amber-500/20 ring-4 ring-amber-500/10',
          defaultIcon: <AlertTriangle className="w-7 h-7 text-amber-600" />,
          pillBadge: badgeLabel || 'Attention Required',
          pillBg: 'bg-amber-50 text-amber-800 border-amber-200/90',
          pillDot: 'bg-amber-500',
          btnConfirmClasses:
            'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 hover:from-amber-500 hover:to-orange-500 shadow-md shadow-amber-600/30 hover:shadow-lg hover:shadow-amber-600/40',
        };
      case 'success':
        return {
          topBarGradient: 'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500',
          haloBg: 'bg-emerald-500/25',
          iconContainer:
            'bg-gradient-to-br from-white via-emerald-50 to-teal-100/90 text-emerald-600 border-emerald-200/90 shadow-emerald-500/20 ring-4 ring-emerald-500/10',
          defaultIcon: <CheckCircle2 className="w-7 h-7 text-emerald-600" />,
          pillBadge: badgeLabel || 'Batch Action',
          pillBg: 'bg-emerald-50 text-emerald-800 border-emerald-200/90',
          pillDot: 'bg-emerald-500',
          btnConfirmClasses:
            'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 shadow-md shadow-emerald-600/30 hover:shadow-lg hover:shadow-emerald-600/40',
        };
      case 'primary':
      default:
        return {
          topBarGradient: 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500',
          haloBg: 'bg-indigo-500/25',
          iconContainer:
            'bg-gradient-to-br from-white via-indigo-50 to-purple-100/90 text-indigo-600 border-indigo-200/90 shadow-indigo-500/20 ring-4 ring-indigo-500/10',
          defaultIcon: <Sparkles className="w-7 h-7 text-indigo-600" />,
          pillBadge: badgeLabel || 'Workspace Action',
          pillBg: 'bg-indigo-50 text-indigo-700 border-indigo-200/90',
          pillDot: 'bg-indigo-500',
          btnConfirmClasses:
            'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 shadow-md shadow-indigo-600/30 hover:shadow-lg hover:shadow-indigo-600/40',
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
      <div className="relative overflow-hidden bg-white">
        {/* 1. Top Vibrant Edge-to-Edge Shimmer Accent Line */}
        <div className={`h-1.5 w-full ${config.topBarGradient}`} />

        {/* 2. Floating Frosted Close Button */}
        {!isLoading && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-slate-100/90 hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition border border-slate-200/70 shadow-2xs cursor-pointer"
            title="Close dialog (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="px-6 pt-7 pb-6 sm:px-8 sm:pt-8 sm:pb-7 text-center">
          {/* 3. Ambient Glowing Multi-Layer Icon Orb */}
          <div className="relative mx-auto mb-4 flex items-center justify-center w-20 h-20">
            <div
              className={`absolute inset-0 rounded-3xl blur-xl opacity-80 animate-pulse transition duration-500 ${config.haloBg}`}
            />
            <div
              className={`relative w-16 h-16 rounded-2xl flex items-center justify-center border shadow-md transform transition duration-200 hover:scale-105 ${config.iconContainer}`}
            >
              {icon || config.defaultIcon}
            </div>
          </div>

          {/* 4. Category Pill Tag */}
          <div className="flex justify-center mb-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border shadow-2xs ${config.pillBg}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${config.pillDot} animate-ping`} />
              <span>{config.pillBadge}</span>
            </span>
          </div>

          {/* 5. Bold High-Contrast Title */}
          <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mb-2.5">
            {title}
          </h3>

          {/* 6. Formatted Message Content */}
          <div className="text-sm text-slate-600 leading-relaxed max-w-sm mx-auto mb-6">
            {typeof message === 'string' ? <p>{message}</p> : message}
          </div>

          {/* 7. Optional Secondary Checkbox Option */}
          {checkboxLabel && (
            <div className="mb-6 p-3.5 bg-slate-50/90 border border-slate-200/90 rounded-2xl flex items-center justify-start text-left gap-3 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
              onClick={() => !isLoading && handleCheckboxToggle(!isChecked)}
            >
              <div
                className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                  isChecked
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs'
                    : 'border-slate-300 bg-white'
                }`}
              >
                {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
              <label
                htmlFor="confirm-modal-checkbox"
                className="text-xs font-semibold text-slate-700 cursor-pointer select-none leading-snug flex-1"
                onClick={(e) => e.stopPropagation()}
              >
                {checkboxLabel}
              </label>
            </div>
          )}

          {/* 8. Modern Button Actions */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-center gap-2.5 pt-1 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={onClose}
              disabled={isLoading}
              className="w-full sm:w-auto min-w-[110px] font-bold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border-slate-200/80 rounded-xl py-2.5"
            >
              {cancelText}
            </Button>

            <button
              type="button"
              onClick={handleConfirmClick}
              disabled={isLoading}
              className={`w-full sm:w-auto min-w-[160px] px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-150 transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${config.btnConfirmClasses}`}
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
