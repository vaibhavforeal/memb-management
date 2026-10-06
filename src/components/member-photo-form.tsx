"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { MAX_PHOTO_BYTES, PHOTO_ACCEPT } from "@/lib/member-photo-utils";

export function MemberPhotoForm({
  memberId,
  name,
  photoUrl,
}: {
  memberId: string;
  name: string;
  photoUrl: string | null;
}) {
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [savedUrl, setSavedUrl] = useState(photoUrl);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function save(remove = false) {
    if (busy || (!remove && !file)) return;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/members/${encodeURIComponent(memberId)}/photo`,
        {
          method: remove ? "DELETE" : "POST",
          ...(remove
            ? {}
            : { body: file!, headers: { "Content-Type": file!.type } }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        if (result.upgradeUrl) router.push(result.upgradeUrl);
        throw new Error(result.message || "Unable to save photo.");
      }
      setSavedUrl(remove ? null : result.photoUrl);
      setFile(null);
      if (input.current) input.current.value = "";
      setFeedback({ message: result.message, error: false });
      router.refresh();
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error ? error.message : "Unable to save photo.",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mb-5 space-y-3 border-b pb-5"
      aria-label="Member photo"
      aria-busy={busy}
    >
      <div className="flex items-center gap-4">
        {preview || savedUrl ? (
          <img
            src={preview || savedUrl!}
            alt={`Photo of ${name}`}
            width={80}
            height={80}
            className="size-20 rounded-full object-cover"
          />
        ) : (
          <div
            className="flex size-20 shrink-0 items-center justify-center rounded-full bg-secondary text-2xl"
            aria-label="No member photo"
          >
            {name.trim().slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 space-y-2">
          <label htmlFor={id} className="field">
            Member photo
            <input
              ref={input}
              id={id}
              type="file"
              accept={PHOTO_ACCEPT}
              disabled={busy}
              className="block w-full text-xs"
              onChange={(event) => {
                const chosen = event.target.files?.[0];
                setFile(null);
                setFeedback(null);
                if (!chosen) return;
                if (
                  chosen.size > MAX_PHOTO_BYTES ||
                  !PHOTO_ACCEPT.split(",").includes(chosen.type)
                ) {
                  setFeedback({
                    message: "Choose a PNG, JPG, or WebP photo up to 2 MB.",
                    error: true,
                  });
                  event.target.value = "";
                  return;
                }
                setFile(chosen);
              }}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            PNG, JPG or WebP · up to 2 MB. Used on bills and cards.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || !file}
          onClick={() => save()}
        >
          {busy ? "Saving…" : "Save photo"}
        </Button>
        {savedUrl && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => save(true)}
          >
            Remove photo
          </Button>
        )}
      </div>
      {feedback && (
        <p
          role={feedback.error ? "alert" : "status"}
          className={`text-xs ${feedback.error ? "text-destructive" : "text-primary"}`}
        >
          {feedback.message}
        </p>
      )}
    </section>
  );
}
