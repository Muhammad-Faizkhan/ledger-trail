import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-surface p-5 ${className}`}>{children}</div>
  );
}

export function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted">{label}</span>
      <input
        {...props}
        className="rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-accent"
      />
    </label>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  const look =
    variant === "primary"
      ? "bg-accent text-accent-foreground hover:opacity-90"
      : "text-muted hover:text-foreground";
  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${look} ${className}`}
    />
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <p className="text-sm text-danger">{children}</p> : null;
}

export function Centered({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 items-center justify-center p-4">{children}</div>;
}

export function Select({
  label,
  options,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted">{label}</span>
      <select
        {...props}
        className="rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-accent"
      >
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  );
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "accent" | "danger" }) {
  const look = { muted: "border-border text-muted", accent: "border-accent text-accent", danger: "border-danger text-danger" }[tone];
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${look}`}>{children}</span>;
}
