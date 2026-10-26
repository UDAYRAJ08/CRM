import React from 'react';
import { ContactStatus } from '../../types/crm';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'purple' | 'neutral';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'sm',
  className = '',
}) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  const variantClasses = {
    default: 'bg-slate-100 text-slate-700 border-slate-200',
    primary: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    warning: 'bg-amber-50 text-amber-700 border-amber-200/80',
    danger: 'bg-rose-50 text-rose-700 border-rose-200/80',
    purple: 'bg-purple-50 text-purple-700 border-purple-200/80',
    neutral: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  }[variant];

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${sizeClasses} ${variantClasses} ${className}`}
    >
      {children}
    </span>
  );
};

export const STATUS_BADGE_CONFIG: Record<ContactStatus, { label: string; variant: BadgeProps['variant'] }> = {
  new: { label: 'New', variant: 'primary' },
  contacted: { label: 'Contacted', variant: 'warning' },
  qualified: { label: 'Qualified', variant: 'purple' },
  proposal: { label: 'Proposal Sent', variant: 'warning' },
  won: { label: 'Won', variant: 'success' },
  lost: { label: 'Lost', variant: 'danger' },
  inactive: { label: 'Inactive', variant: 'neutral' },
};

export const StatusBadge: React.FC<{ status: ContactStatus; size?: 'sm' | 'md' }> = ({
  status,
  size = 'sm',
}) => {
  const item = STATUS_BADGE_CONFIG[status] || { label: status, variant: 'default' };

  return (
    <Badge variant={item.variant} size={size}>
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current opacity-70" />
      {item.label}
    </Badge>
  );
};
