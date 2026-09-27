"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/format";
import { Gate, useSession } from "./Gate";

const NAV = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/orders", label: "Orders", icon: OrdersIcon },
  { href: "/vendors", label: "Vendors", icon: VendorsIcon },
  { href: "/payments", label: "Payments", icon: PaymentsIcon },
];

// ＋ New order has its own button, so the Orders tab isn't lit while on it.
const isActive = (path: string, href: string) =>
  href === "/" ? path === "/"
    : path !== "/orders/new" && (path === href || path.startsWith(`${href}/`));

/** Signed-in frame: top bar on desktop, bottom bar on phones, ＋ New order always one tap away. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <Gate>
      <Frame>{children}</Frame>
    </Gate>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { ledger } = useSession();
  const onNewOrder = path === "/orders/new";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="no-print sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4">
          <Link href="/" className="min-w-0 shrink">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-accent">{APP_NAME}</span>
            <span className="block truncate text-sm font-semibold leading-tight">{ledger.business?.name}</span>
          </Link>
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={isActive(path, n.href) ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  isActive(path, n.href) ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground"
                }`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {!onNewOrder && (
              <Link href="/orders/new"
                className="hidden min-h-10 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground hover:opacity-90 md:inline-flex">
                ＋ New order
              </Link>
            )}
            <Link href="/settings" aria-label="Settings" aria-current={path === "/settings" ? "page" : undefined}
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                path === "/settings" ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2"
              }`}>
              <SettingsIcon />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 pb-28 pt-4 md:pb-10">{children}</main>

      <nav aria-label="Main"
        className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 items-end">
          {NAV.slice(0, 2).map((n) => <Tab key={n.href} {...n} active={isActive(path, n.href)} />)}
          <Link href="/orders/new" aria-label="New order" aria-current={onNewOrder ? "page" : undefined}
            className="flex flex-col items-center gap-0.5 pb-2">
            <span className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-3xl font-light text-accent-foreground shadow-lg ring-4 ring-surface">
              ＋
            </span>
            <span className="text-[11px] font-semibold text-accent">New order</span>
          </Link>
          {NAV.slice(2).map((n) => <Tab key={n.href} {...n} active={isActive(path, n.href)} />)}
        </div>
      </nav>
    </div>
  );
}

function Tab({ href, label, icon: Icon, active }: { href: string; label: string; icon: () => ReactNode; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
        active ? "text-accent" : "text-muted"
      }`}>
      <Icon />
      {label}
    </Link>
  );
}

const svg = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function HomeIcon() {
  return <svg {...svg} aria-hidden><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>;
}
function OrdersIcon() {
  return <svg {...svg} aria-hidden><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>;
}
function VendorsIcon() {
  return <svg {...svg} aria-hidden><path d="M3 9l2-5h14l2 5" /><path d="M4 9v11h16V9" /><path d="M9 20v-6h6v6" /></svg>;
}
function PaymentsIcon() {
  return <svg {...svg} aria-hidden><rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 10h20M6 15h4" /></svg>;
}
function SettingsIcon() {
  return (
    <svg {...svg} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </svg>
  );
}
