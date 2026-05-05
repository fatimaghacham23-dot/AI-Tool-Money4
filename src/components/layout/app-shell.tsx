"use client";

import {
  Bot,
  Factory,
  LayoutDashboard,
  PlusCircle,
  Settings2,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/new-council",
    label: "New Council",
    icon: PlusCircle,
  },
  {
    href: "/factory",
    label: "Factory",
    icon: Factory,
  },
  {
    href: "/settings/agents",
    label: "Agents",
    icon: Settings2,
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen council-grid">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-border bg-background/82 px-4 py-5 backdrop-blur lg:block">
        <Link href="/dashboard" className="flex items-center gap-3 px-2">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="size-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold">Ahmad Product</p>
            <p className="text-xs text-muted-foreground">Council</p>
          </div>
        </Link>

        <nav className="mt-8 space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active && "bg-muted text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-5 left-4 right-4 rounded-lg border border-border bg-card/70 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Bot className="size-4 text-primary" aria-hidden="true" />
            Private council room
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Built for full-source-code product decisions, not SaaS subscription ideas.
          </p>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-border bg-background/82 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            Ahmad Product Council
          </Link>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-md text-muted-foreground",
                    active && "bg-muted text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="px-4 py-6 lg:ml-72 lg:px-8 lg:py-8">
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
