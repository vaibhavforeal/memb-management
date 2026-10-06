"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { BusinessLogo } from "./business-logo";
import { Button } from "./ui/button";
import { LOGO_ACCEPT, MAX_LOGO_BYTES } from "@/lib/business-logo-utils";

export function BusinessLogoForm({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [savedUrl, setSavedUrl] = useState(logoUrl);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    error: boolean;
  } | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function clearSelection() {
    setFile(null);
    setPreview(null);
    if (input.current) input.current.value = "";
  }

  async function save(remove = false) {
    if (busy || (!remove && !file)) return;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/business/logo", {
        method: remove ? "DELETE" : "POST",
        ...(remove
          ? {}
          : { body: file!, headers: { "Content-Type": file!.type } }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.upgradeUrl) router.push(result.upgradeUrl);
        throw new Error(result.message || "The logo could not be saved.");
      }
      setSavedUrl(remove ? null : result.logoUrl);
      clearSelection();
      setFeedback({ message: result.message, error: false });
      router.refresh();
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error
            ? error.message
            : "The logo could not be saved. Please try again.",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 space-y-3 border-b pb-5" aria-busy={busy}>
      <p className="text-sm font-medium">Business logo</p>
      <div className="flex items-start gap-4">
        <BusinessLogo src={preview ?? savedUrl} name={name} size={80} />
        <div className="min-w-0 flex-1 space-y-2">
          <p
            id={`${id}-help`}
            className="text-xs leading-relaxed text-muted-foreground"
          >
            PNG, JPG, or WebP · up to 2 MB. Your logo appears in the sidebar and
            on payment receipts.
          </p>
          <input
            ref={input}
            id={id}
            type="file"
            accept={LOGO_ACCEPT}
            disabled={busy}
            className="sr-only"
            aria-label="Choose business logo"
            aria-describedby={`${id}-help`}
            onChange={(event) => {
              const chosen = event.currentTarget.files?.[0];
              setFeedback(null);
              if (!chosen) return;
              if (
                !LOGO_ACCEPT.split(",").includes(chosen.type) ||
                chosen.size > MAX_LOGO_BYTES ||
                !chosen.size
              ) {
                clearSelection();
                setFeedback({
                  message:
                    "Choose a PNG, JPG, or WebP image no larger than 2 MB.",
                  error: true,
                });
                return;
              }
              setFile(chosen);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <Upload />
              {savedUrl ? "Change logo" : "Choose logo"}
            </Button>
            {file && (
              <>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  {busy && <Loader2 className="animate-spin" />}Save logo
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={clearSelection}
                >
                  Cancel
                </Button>
              </>
            )}
            {savedUrl && !file && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void save(true)}
              >
                {busy && <Loader2 className="animate-spin" />}Remove logo
              </Button>
            )}
          </div>
          {file && (
            <p className="truncate text-xs text-muted-foreground">
              {file.name} · Preview, not saved yet
            </p>
          )}
        </div>
      </div>
      {feedback && (
        <p
          role={feedback.error ? "alert" : "status"}
          className={`text-xs ${feedback.error ? "text-destructive" : "text-primary"}`}
        >
          {feedback.message}
        </p>
      )}
    </div>
  );
}
