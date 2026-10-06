"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { PrintButton } from "./print-button";
import "./member-document.css";

export function DocumentPreview({
  children,
  width,
  filename,
  kind,
}: {
  children: ReactNode;
  width: number;
  filename: string;
  kind: "bill" | "card" | "receipt";
}) {
  const frame = useRef<HTMLDivElement>(null);
  const document = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ scale: 1, height: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!frame.current || !document.current) return;
    const measure = () => {
      const scale = Math.min(1, frame.current!.clientWidth / width);
      setSize({ scale, height: document.current!.offsetHeight * scale });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(frame.current);
    observer.observe(document.current);
    measure();
    return () => observer.disconnect();
  }, [width]);
  async function download() {
    if (!document.current || busy) return;
    setBusy(true);
    setError("");
    try {
      await window.document.fonts.ready;
      await Promise.all(
        Array.from(document.current.querySelectorAll("img")).map((img) =>
          img.decode(),
        ),
      );
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(document.current, {
        pixelRatio: 2,
        width,
        height: document.current.offsetHeight,
        preferredFontFormat: "woff2",
      });
      if (!blob) throw new Error("No image produced");
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `${filename.replace(/[^a-zA-Z0-9_-]/g, "-")}.png`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError(
        "The image could not be downloaded. Please try again, or use Print to save a PDF.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="no-print mb-5 flex flex-wrap items-center gap-2">
        <Button onClick={download} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Download />}
          {busy ? "Preparing image…" : "Download image"}
        </Button>
        <PrintButton
          label={
            kind === "card"
              ? "Print card"
              : kind === "bill"
                ? "Print bill"
                : "Print receipt"
          }
        />
        <p className="w-full text-xs text-muted-foreground">
          Download to attach in WhatsApp or email. Use Print to save a PDF.
        </p>
        {error && (
          <p role="alert" className="w-full text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <div
        ref={frame}
        className={`document-frame document-frame-${kind}`}
        style={{ height: size.height || undefined }}
      >
        <div
          className="document-scale"
          style={{ width, transform: `scale(${size.scale})` }}
        >
          <div ref={document} className="document-export" style={{ width }}>
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
