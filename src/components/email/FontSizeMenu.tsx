import React from 'react';

const FONT_SIZES = [
  { label: 'Small',   value: '12px' },
  { label: 'Normal',  value: '14px' },
  { label: 'Medium',  value: '16px' },
  { label: 'Large',   value: '18px' },
  { label: 'X-Large', value: '22px' },
];

interface FontSizeMenuProps {
  onSelect: (px: string) => void;
}

/** Dropdown panel for the rich-text toolbar's font size button. */
export const FontSizeMenu: React.FC<FontSizeMenuProps> = ({ onSelect }) => (
  <div className="font-size-menu absolute top-full left-0 mt-2 w-44 bg-white border border-slate-200 rounded-2xl shadow-lg p-1.5 z-50">
    <p className="px-2.5 pt-1 pb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
      Text size
    </p>
    {FONT_SIZES.map((fs) => (
      <button
        key={fs.value}
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onSelect(fs.value);
        }}
        className="group w-full h-9 flex items-center justify-between gap-3 px-2.5 rounded-xl text-left transition-colors hover:bg-indigo-50 cursor-pointer"
      >
        <span className="flex items-baseline gap-1.5">
          <span className="text-xs font-semibold text-slate-700 group-hover:text-indigo-700">{fs.label}</span>
          <span className="text-[10px] text-slate-400">{fs.value}</span>
        </span>
        <span
          className="w-7 text-center font-semibold leading-none text-slate-400 group-hover:text-indigo-600"
          style={{ fontSize: fs.value }}
          aria-hidden
        >
          Aa
        </span>
      </button>
    ))}
  </div>
);
