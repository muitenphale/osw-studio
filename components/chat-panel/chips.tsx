'use client';

import { useState } from 'react';

interface ChipsBlockProps {
  options: string[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}

export function ChipsBlock({ options, onSelect, disabled }: ChipsBlockProps) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {options.map((option) => {
        const isSelected = selected === option;
        const isDimmed = selected !== null && !isSelected;
        return (
          <button
            key={option}
            onClick={() => {
              if (!selected && !disabled) {
                setSelected(option);
                onSelect(option);
              }
            }}
            disabled={!!selected || disabled}
            className={`text-xs px-3 py-1.5 rounded border transition-all ${
              isSelected
                ? 'bg-primary/10 border-primary/30 text-primary font-medium'
                : isDimmed
                  ? 'border-border text-muted-foreground/30 cursor-default'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 cursor-pointer'
            }`}
          >
            {option}
            {isSelected && <span className="ml-1.5 text-[10px] opacity-60">✓</span>}
          </button>
        );
      })}
    </div>
  );
}
