"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const SheetContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

function useSheet() {
  const context = React.useContext(SheetContext);
  if (!context) throw new Error("Sheet components must be used within Sheet");
  return context;
}

interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function Sheet({ open, onOpenChange, children }: SheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const currentOpen = open !== undefined ? open : isOpen;

  return (
    <SheetContext.Provider
      value={{
        open: currentOpen,
        setOpen: (v) => {
          setIsOpen(v);
          onOpenChange?.(v);
        },
      }}
    >
      {children}
    </SheetContext.Provider>
  );
}

const SheetTrigger = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const sheet = useSheet();
    return (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        onClick={() => sheet.setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") sheet.setOpen(true); }}
        className={cn("cursor-pointer", className)}
      >
        {children}
      </div>
    );
  }
);
SheetTrigger.displayName = "SheetTrigger";

const SheetContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { side?: "left" | "right" | "top" | "bottom" }>(
  ({ className, side = "right", children, ...props }, ref) => {
    const sheet = useSheet();
    if (!sheet.open) return null;

    const sideStyles = {
      left: "inset-y-0 left-0 h-full w-3/4 sm:max-w-sm",
      right: "inset-y-0 right-0 h-full w-[480px] max-w-full",
      top: "inset-x-0 top-0 h-auto w-full",
      bottom: "inset-x-0 bottom-0 h-auto w-full",
    };

    return (
      <div className="fixed inset-0 z-50">
        <div
          className="fixed inset-0 bg-black/80"
          onClick={() => sheet.setOpen(false)}
        />
        <div
          ref={ref}
          className={cn(
            "fixed z-50 bg-background p-6 shadow-lg transition ease-in-out",
            sideStyles[side],
            className
          )}
          {...props}
        >
          <button
            onClick={() => sheet.setOpen(false)}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            <span className="sr-only">Close</span>
          </button>
          {children}
        </div>
      </div>
    );
  }
);
SheetContent.displayName = "SheetContent";

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);

const SheetTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2 ref={ref} className={cn("text-lg font-semibold", className)} {...props} />
  )
);
SheetTitle.displayName = "SheetTitle";

const SheetDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
);
SheetDescription.displayName = "SheetDescription";

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription };