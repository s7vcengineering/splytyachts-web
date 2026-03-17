import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(amount);
}

export function statusColor(status: string): string {
  const colors: Record<string, string> = {
    // Booking statuses
    pending: "bg-yellow-500/20 text-yellow-400",
    in_progress: "bg-blue-500/20 text-blue-400",
    booked: "bg-green-500/20 text-green-400",
    confirmed: "bg-emerald-500/20 text-emerald-400",
    failed: "bg-red-500/20 text-red-400",
    cancelled: "bg-gray-500/20 text-gray-400",
    manual: "bg-orange-500/20 text-orange-400",
    running: "bg-blue-500/20 text-blue-400",
    // Experience statuses
    open: "bg-cyan-500/20 text-cyan-400",
    filling: "bg-blue-500/20 text-blue-400",
    full: "bg-purple-500/20 text-purple-400",
    completed: "bg-green-500/20 text-green-400",
    // Invoice statuses
    disbursed: "bg-emerald-500/20 text-emerald-400",
  };
  return colors[status] || "bg-gray-500/20 text-gray-400";
}

export function scrapeStatusColor(status: string): string {
  const colors: Record<string, string> = {
    scraped: "bg-green-500/20 text-green-400",
    pending: "bg-yellow-500/20 text-yellow-400",
    failed: "bg-red-500/20 text-red-400",
    stale: "bg-orange-500/20 text-orange-400",
  };
  return colors[status] || "bg-gray-500/20 text-gray-400";
}

export function fulfillmentStageColor(stage: string): string {
  const colors: Record<string, string> = {
    deposits_collecting: "bg-yellow-500/20 text-yellow-400",
    ready_to_book: "bg-cyan-500/20 text-cyan-400",
    outreach_sent: "bg-purple-500/20 text-purple-400",
    confirmed: "bg-green-500/20 text-green-400",
    completed: "bg-emerald-500/20 text-emerald-400",
  };
  return colors[stage] || "bg-gray-500/20 text-gray-400";
}

export function formatCity(city: string): string {
  return city
    .split("--")[0]
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
