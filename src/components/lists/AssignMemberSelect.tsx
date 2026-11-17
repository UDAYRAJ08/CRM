import React from 'react';
import { useTeam } from '../../context/TeamContext';

interface AssignMemberSelectProps {
  value: string;
  onChange: (memberId: string | null) => void;
  placeholder?: string;
  includeUnassigned?: boolean;
  className?: string;
}

// Team member picker. Empty value means "no owner" (only offered when includeUnassigned).
export const AssignMemberSelect: React.FC<AssignMemberSelectProps> = ({
  value,
  onChange,
  placeholder = 'Choose a team member',
  includeUnassigned = false,
  className = 'bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer',
}) => {
  const { teamMembers } = useTeam();
  return (
    <select
      value={value}
      aria-label={placeholder}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '') return;
        onChange(v === '__none__' ? null : v);
      }}
      className={className}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {includeUnassigned && <option value="__none__">Unassigned (no owner)</option>}
      {teamMembers.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
};
