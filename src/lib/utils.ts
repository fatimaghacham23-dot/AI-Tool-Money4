import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function currency(value?: number | null) {
  if (!value) {
    return "Unset";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function titleFromGoal(goal: string) {
  const compact = goal.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "Untitled Council Run";
  }

  return compact.length > 70 ? `${compact.slice(0, 67)}...` : compact;
}
