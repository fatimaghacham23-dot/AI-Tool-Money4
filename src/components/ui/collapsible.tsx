"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const CollapsibleContext = React.createContext<{
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
} | null>(null);

function useCollapsible() {
  const context = React.useContext(CollapsibleContext);
  if (!context) {
    throw new Error("useCollapsible must be used within a Collapsible");
  }
  return context;
}

const Collapsible = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { defaultOpen?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void }
>(({ children, defaultOpen = false, open: controlledOpen, onOpenChange, className, ...props }, ref) => {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = React.useCallback(
    (value: React.SetStateAction<boolean>) => {
      const next = typeof value === "function" ? value(open) : value;
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange, open],
  );

  return (
    <CollapsibleContext.Provider value={{ open, setOpen }}>
      <div ref={ref} className={cn(className)} {...props}>
        {children}
      </div>
    </CollapsibleContext.Provider>
  );
});
Collapsible.displayName = "Collapsible";

const CollapsibleTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ children, ...props }, ref) => {
  const { open, setOpen } = useCollapsible();
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      {...props}
    >
      {children}
    </button>
  );
});
CollapsibleTrigger.displayName = "CollapsibleTrigger";

const CollapsibleContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  const { open } = useCollapsible();
  if (!open) return null;
  return (
    <div ref={ref} className={cn(className)} {...props}>
      {children}
    </div>
  );
});
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
