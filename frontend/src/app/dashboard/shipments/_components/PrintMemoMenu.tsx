"use client";

import React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { MemoCategory } from '../_print/shipment-memo';

interface Props {
  categories: Array<'precious' | 'semi'>;
  generating: boolean;
  onPrint: (category: MemoCategory) => void;
}

const OPTIONS: Array<{ key: MemoCategory; label: string }> = [
  { key: 'precious', label: 'Precious' },
  { key: 'semi', label: 'Semi-Precious' },
  { key: 'both', label: 'Both' },
];

export const PrintMemoMenu: React.FC<Props> = ({ categories, generating, onPrint }) => {
  const label = generating ? 'Generating...' : 'Print PDF';
  // Single (or no) category → print directly, no menu needed.
  if (categories.length < 2) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPrint(categories[0] ?? 'both')}
        disabled={generating}
        data-testid="generate-pdf-button"
      >
        <FileText className="h-4 w-4 mr-1" />
        {label}
        {categories[0] && (
          <span className="ml-1 text-xs text-navy-500">
            ({categories[0] === 'precious' ? 'Precious' : 'Semi-Precious'})
          </span>
        )}
      </Button>
    );
  }
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="outline" size="sm" disabled={generating} data-testid="generate-pdf-button">
          <FileText className="h-4 w-4 mr-1" />
          {label}
          <ChevronDown className="h-3.5 w-3.5 ml-1" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-[100] min-w-[160px] rounded-md border border-navy-200 bg-white p-1 shadow-lg"
          data-testid="print-memo-menu"
        >
          {OPTIONS.map((o) => (
            <DropdownMenu.Item
              key={o.key}
              onSelect={() => onPrint(o.key)}
              className="cursor-pointer rounded px-3 py-1.5 text-sm text-navy-800 outline-none data-[highlighted]:bg-navy-50"
              data-testid={`print-memo-${o.key}`}
            >
              {o.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
