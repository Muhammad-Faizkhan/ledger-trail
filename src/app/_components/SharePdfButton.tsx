"use client";

import { useEffect, useState } from "react";
import { whatsAppUrl } from "@/lib/format";
import { Button, LinkButton } from "./ui";

type PdfModule = typeof import("@/lib/pdf");

/**
 * Makes a PDF and hands it to the phone's Share menu, where the owner picks
 * WhatsApp and the chat. A website can't attach a file to a WhatsApp chat by
 * itself, so where there's no Share menu (most computers) the PDF is
 * downloaded instead and the vendor's chat is offered to attach it.
 */
export function SharePdfButton({ build, filename, message, phone, variant = "secondary" }: {
  build: (pdf: PdfModule) => Blob;
  filename: string;
  /** Caption sent with the file, and the text for the chat on the fallback path. */
  message: string;
  phone: string;
  variant?: "primary" | "secondary";
}) {
  const [pdf, setPdf] = useState<PdfModule | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Load ahead of the tap: phones only allow the Share menu right after a tap,
  // so there's no time to fetch code once the button is pressed.
  useEffect(() => {
    let live = true;
    import("@/lib/pdf")
      .then((m) => { if (live) setPdf(m); })
      .catch(() => { if (live) setError("Couldn't load the PDF maker. Check your connection and reload."); });
    return () => { live = false; };
  }, []);

  function download(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setSaved(true);
  }

  function share() {
    if (!pdf) return;
    setSaved(false);
    setError("");
    let blob: Blob;
    try {
      blob = build(pdf);
    } catch {
      setError("Couldn't make the PDF. Try again.");
      return;
    }
    const file = new File([blob], filename, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: filename, text: message }).catch((err: DOMException) => {
        // Closing the Share menu isn't an error.
        if (err.name !== "AbortError") download(blob);
      });
      return;
    }
    download(blob);
  }

  const chat = whatsAppUrl(phone, message);
  return (
    <div className="flex flex-col gap-2">
      <Button variant={variant} onClick={share} disabled={!pdf}>
        <WhatsAppIcon /> Share PDF on WhatsApp
      </Button>
      {saved && (
        <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3 text-sm">
          <p>
            <span className="font-semibold">{filename}</span> is saved in your Downloads.
            {chat ? " Open the chat and attach it with the 📎 button." : " Attach it in WhatsApp with the 📎 button."}
          </p>
          {chat && <LinkButton href={chat} external variant="secondary" className="self-start">Open WhatsApp chat</LinkButton>}
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.3-.4.3-.4.8-1.3a.5.5 0 000-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c1.7.7 2.4.8 3.2.6a2.8 2.8 0 001.8-1.3 2.3 2.3 0 00.2-1.3c-.1-.1-.3-.2-.5-.3z" />
    </svg>
  );
}
