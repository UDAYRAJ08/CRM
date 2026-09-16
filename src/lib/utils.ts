export function getInitials(name?: string | null, fallback = 'U'): string {
  if (!name || typeof name !== 'string') return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  const first = parts[0]?.[0] || '';
  const second = parts.length > 1 ? parts[1]?.[0] || '' : '';
  return (first + second).toUpperCase() || fallback;
}

export function formatDate(dateString?: string | null): string {
  if (!dateString) return 'N/A';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

export function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 45) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay === 1) return 'yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}

export function getStatusColor(status?: string): string {
  switch (status?.toLowerCase()) {
    case 'new':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'contacted':
      return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'qualified':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
    case 'proposal':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'won':
      return 'bg-green-100 text-green-800 border-green-300';
    case 'lost':
      return 'bg-rose-100 text-rose-700 border-rose-200';
    case 'inactive':
      return 'bg-slate-100 text-slate-600 border-slate-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

