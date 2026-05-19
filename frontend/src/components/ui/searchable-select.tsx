"use client";

import * as React from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label?: string }[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  /** Show an inline × to clear the selection. Defaults to true. */
  clearable?: boolean;
  "data-testid"?: string;
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  className,
  disabled = false,
  clearable = true,
  "data-testid": dataTestId,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [dropUp, setDropUp] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Filter options based on search
  const filteredOptions = React.useMemo(() => {
    if (!search) return options;
    return options.filter((opt) =>
      (opt.label || opt.value).toLowerCase().includes(search.toLowerCase())
    );
  }, [options, search]);

  // Decide whether the panel should open upward.
  //
  // The trigger may live inside a scrollable modal, so we measure available
  // space relative to BOTH the viewport AND the nearest scrollable ancestor
  // (e.g. `<DialogContent>`). The dropdown only flips upward when there is
  // genuinely not enough room below — otherwise it stays in the conventional
  // downward position so the user isn't surprised.
  const PANEL_MAX_HEIGHT = 300;
  const MIN_BELOW = 180; // need at least ~3 rows below the trigger
  React.useEffect(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    // Find the nearest scrollable ancestor (the dialog scroll container).
    let scrollHost: HTMLElement | null = containerRef.current.parentElement;
    while (scrollHost) {
      const style = getComputedStyle(scrollHost);
      const oy = style.overflowY;
      if ((oy === "auto" || oy === "scroll") && scrollHost.clientHeight < scrollHost.scrollHeight + 1) {
        break;
      }
      scrollHost = scrollHost.parentElement;
    }
    const hostBottom = scrollHost ? scrollHost.getBoundingClientRect().bottom : window.innerHeight;
    const hostTop = scrollHost ? scrollHost.getBoundingClientRect().top : 0;

    const spaceBelow = Math.min(window.innerHeight, hostBottom) - rect.bottom;
    const spaceAbove = rect.top - Math.max(0, hostTop);

    // Only flip up if there's truly not enough space below AND meaningfully
    // more space above. Keep a conservative threshold so the panel doesn't
    // pop upward unexpectedly when the trigger is near the middle of a tall
    // modal.
    setDropUp(spaceBelow < MIN_BELOW && spaceAbove > spaceBelow + 80);
  }, [open, filteredOptions.length]);

  // Handle click outside to close
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  // Focus input when dropdown opens
  React.useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const selectedOption = options.find((opt) => opt.value === value);
  const showClear = clearable && !disabled && !!value;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-70",
          "border-navy-200",
          disabled && "bg-gray-200 text-gray-600",
          showClear && "pr-2"
        )}
        data-testid={dataTestId}
      >
        <span className={cn(!value && "text-muted-foreground", "truncate text-left")}>
          {selectedOption ? (selectedOption.label || selectedOption.value) : (value || placeholder)}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {showClear && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onValueChange("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onValueChange("");
                }
              }}
              className="rounded-full p-0.5 text-navy-400 hover:bg-navy-100 hover:text-navy-700 transition-colors"
              data-testid={dataTestId ? `${dataTestId}-clear` : undefined}
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={cn("h-4 w-4 opacity-50 transition-transform", open && "rotate-180")} />
        </span>
      </button>

      {/* Dropdown panel.
          Uses a flex column with the search header `flex-shrink-0` and the
          options list `flex-1 overflow-y-auto`, so the search is always
          visually anchored at the top of the panel and the options scroll
          beneath it. The previous sticky-positioning approach occasionally
          rendered the first option visually overlapping the search input. */}
      {open && (
        <div
          className={cn(
            "absolute z-[100] w-full rounded-md border bg-popover shadow-lg overflow-hidden",
            "flex flex-col",
            "animate-in fade-in-0 zoom-in-95",
            dropUp ? "bottom-full mb-1" : "top-full mt-1"
          )}
          style={{ maxHeight: `${PANEL_MAX_HEIGHT}px` }}
        >
          {/* Search header — fixed at top of the panel */}
          <div className="flex-shrink-0 bg-popover p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className={cn(
                  "flex h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 py-1 text-sm",
                  "placeholder:text-muted-foreground",
                  "focus:outline-none focus:ring-1 focus:ring-ring"
                )}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Options list — scrollable area below the header */}
          <div className="flex-1 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No results found
              </div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onValueChange(option.value);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "relative flex w-full cursor-pointer select-none items-center px-3 py-2 text-sm",
                    "hover:bg-accent hover:text-accent-foreground",
                    "focus:bg-accent focus:text-accent-foreground focus:outline-none",
                    value === option.value && "bg-accent"
                  )}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 flex-shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{option.label || option.value}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
