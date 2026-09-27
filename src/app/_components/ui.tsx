"use client";

import Link from "next/link";
import {
  useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { money } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-surface p-4 sm:p-5 ${className}`}>{children}</div>
  );
}

const inputLook =
  "min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60";

export function Field({
  label, hint, className = "", ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      <span className="font-medium text-muted">{label}</span>
      <input {...props} className={inputLook} />
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** Rupee or quantity input: numeric keypad on phones, no spinner. */
export function NumberField(props: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return <Field inputMode="decimal" autoComplete="off" {...props} />;
}

export function TextArea({ label, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-muted">{label}</span>
      <textarea rows={3} {...props} className={inputLook} />
    </label>
  );
}

export function Select({
  label, options, ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-muted">{label}</span>
      <select {...props} className={inputLook}>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const buttonLook: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground hover:opacity-90",
  secondary: "border border-border bg-surface text-foreground hover:bg-surface-2",
  ghost: "text-accent hover:bg-accent-soft",
  danger: "border border-danger/40 text-danger hover:bg-danger-soft",
};

const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:opacity-50";

export function Button({
  variant = "primary", className = "", ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" {...props} className={`${buttonBase} ${buttonLook[variant]} ${className}`} />;
}

export function LinkButton({
  href, variant = "primary", className = "", children, external,
}: { href: string; variant?: Variant; className?: string; children: ReactNode; external?: boolean }) {
  const cls = `${buttonBase} ${buttonLook[variant]} ${className}`;
  return external
    ? <a href={href} target="_blank" rel="noreferrer" className={cls}>{children}</a>
    : <Link href={href} className={cls}>{children}</Link>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{children}</p> : null;
}

export function Centered({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 items-center justify-center p-4">{children}</div>;
}

type Tone = "muted" | "accent" | "danger" | "info" | "success" | "warning";

const toneLook: Record<Tone, string> = {
  muted: "bg-surface-2 text-muted",
  accent: "bg-accent-soft text-accent",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
};

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneLook[tone]}`}>
      {children}
    </span>
  );
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  ordered: "Ordered",
  confirmed: "Confirmed",
  received: "Received",
};

const STATUS_TONE: Record<OrderStatus, Tone> = { ordered: "muted", confirmed: "info", received: "success" };

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

/** Rupee amount: tabular digits so columns line up. */
export function Money({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{money(value)}</span>;
}

export function PageHeader({ title, subtitle, back, action }: {
  title: ReactNode; subtitle?: ReactNode; back?: { href: string; label: string }; action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-1">
      {back && (
        <Link href={back.href} className="no-print -ml-1 inline-flex min-h-9 w-fit items-center px-1 text-sm font-medium text-accent">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
        </div>
        {action && <div className="no-print flex flex-wrap gap-2">{action}</div>}
      </div>
    </header>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {text && <p className="max-w-xs text-sm text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** A row of pill buttons, one selected. Used for filters and short choices. */
export function Chips<T extends string>({ value, options, onChange, label }: {
  value: T; options: [T, string][]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-2 overflow-x-auto pb-1">
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} onClick={() => onChange(v)}
          className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition ${
            v === value ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-foreground hover:bg-surface-2"
          }`}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      aria-label={placeholder} className={inputLook} />
  );
}

export function Stat({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: Tone; hint?: ReactNode }) {
  const color = tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : tone === "accent" ? "text-accent" : "";
  return (
    <div className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
      <p className="text-xs font-medium text-muted sm:text-sm">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums sm:text-2xl ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Two-step inline confirm for destructive actions (no pop-up dialogs). */
export function ConfirmDelete({ onConfirm, disabled, label = "Delete", question = "Delete this?" }: {
  onConfirm: () => void; disabled?: boolean; label?: string; question?: string;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <Button variant="danger" disabled={disabled} onClick={() => setAsking(true)}>{label}</Button>;
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">{question}</span>
      <Button variant="danger" className="bg-danger-soft" disabled={disabled}
        onClick={() => { setAsking(false); onConfirm(); }}>Yes, delete</Button>
      <Button variant="secondary" onClick={() => setAsking(false)}>Keep</Button>
    </span>
  );
}

/** Shared busy / error state for a button that runs an async write. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      await fn();
      return true;
    } catch (err) {
      setError(friendlyError(err));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

/** Turns Firebase error codes into words an owner can act on. */
export function friendlyError(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e.code === "permission-denied") return "That wasn't allowed. Refresh the page and try again.";
  if (e.code === "unavailable" || e.code === "functions/unavailable") return "Can't reach the server. Check your connection and try again.";
  if (e.code === "functions/internal") return "Something went wrong on the server. Try again.";
  return e.message || "Something went wrong. Try again.";
}
