import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}) => {
  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs font-medium gap-1.5 rounded-lg',
    md: 'px-3.5 py-2 text-sm font-medium gap-2 rounded-xl',
    lg: 'px-5 py-2.5 text-base font-medium gap-2.5 rounded-xl',
  }[size];

  const variantClasses = {
    primary:
      'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow shadow-indigo-500/20 active:bg-indigo-800 disabled:bg-indigo-300',
    secondary:
      'bg-slate-900 hover:bg-slate-800 text-white shadow-sm hover:shadow shadow-slate-900/10 active:bg-slate-950 disabled:bg-slate-400',
    outline:
      'border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 active:bg-slate-100 disabled:bg-slate-50 disabled:text-slate-400',
    ghost:
      'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 active:bg-slate-200/70 disabled:text-slate-300',
    danger:
      'bg-rose-600 hover:bg-rose-700 text-white shadow-sm shadow-rose-500/20 active:bg-rose-800 disabled:bg-rose-300',
    success:
      'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-500/20 active:bg-emerald-800 disabled:bg-emerald-300',
  }[variant];

  return (
    <button
      className={`inline-flex items-center justify-center transition-all duration-150 select-none cursor-pointer disabled:cursor-not-allowed disabled:shadow-none ${sizeClasses} ${variantClasses} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : (
        leftIcon && <span className="shrink-0">{leftIcon}</span>
      )}
      {children}
      {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
};
