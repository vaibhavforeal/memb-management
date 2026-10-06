"use client";

import { useState } from "react";
import { Paperclip, Upload, X, LoaderCircle } from "lucide-react";
import {
  FILE_ACCEPT,
  FILE_TYPES_LABEL,
  MAX_FILE_BYTES,
  fileSize,
  type SharedFileItem,
} from "@/lib/shared-file-utils";
import { Button } from "./ui/button";

export function MessageFiles({
  initialFiles,
  selected,
  onChange,
  onBusy,
  localOnly,
}: {
  initialFiles: SharedFileItem[];
  selected: SharedFileItem[];
  onChange: (files: SharedFileItem[]) => void;
  onBusy: (busy: boolean) => void;
  localOnly: boolean;
}) {
  const [files, setFiles] = useState(initialFiles);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  function pending(value: boolean) {
    setBusy(value);
    onBusy(value);
  }

  async function upload(file: File) {
    if (!file.size || file.size > MAX_FILE_BYTES) {
      setStatus("Choose a non-empty file no larger than 10 MB.");
      return;
    }
    pending(true);
    setStatus("Uploading your file…");
    try {
      const response = await fetch("/api/shared-files", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Upload failed. Please try again.");
      const uploaded = result.file as SharedFileItem;
      setFiles((current) => [uploaded, ...current]);
      onChange([...selected, uploaded]);
      setStatus("File uploaded. Its link is included in the message preview.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Upload failed. Please try again.",
      );
    } finally {
      pending(false);
    }
  }

  async function revoke(file: SharedFileItem) {
    pending(true);
    try {
      const response = await fetch(`/api/shared-files/${file.id}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Could not revoke the link.");
      setFiles((current) => current.filter((f) => f.id !== file.id));
      onChange(selected.filter((f) => f.id !== file.id));
      setConfirmRevoke(null);
      setStatus(
        "Link revoked. Previously shared copies of this link no longer work.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not revoke the link.",
      );
    } finally {
      pending(false);
    }
  }

  return (
    <section
      className="space-y-2 border-t pt-3"
      aria-label="Images and documents"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <Paperclip size={16} />
        Images & documents
      </div>
      <p className="text-xs text-muted-foreground">
        Up to 3 files · Public links expire in 30 days.
      </p>
      {localOnly && (
        <p className="text-xs text-amber-800">
          Local links cannot be opened on other devices.
        </p>
      )}
      <label className="field">
        <span className="flex items-center gap-2">
          <Upload size={14} />
          Upload an image or document
        </span>
        <input
          type="file"
          accept={FILE_ACCEPT}
          disabled={busy || selected.length >= 3}
          className="w-full min-w-0 rounded-lg border bg-background p-2 text-xs file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-foreground disabled:opacity-50"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
      </label>
      <p className="text-[11px] text-muted-foreground">{FILE_TYPES_LABEL}</p>
      {selected.length >= 3 && (
        <p className="text-xs text-muted-foreground">
          Remove a file from this message to add another.
        </p>
      )}
      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium">
            Reusable links · {selected.length} selected
          </p>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {files.map((file) => {
              const included = selected.some((f) => f.id === file.id);
              return (
                <div key={file.id} className="space-y-2 rounded-lg border p-2">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      aria-label={`Include ${file.name}`}
                      checked={included}
                      disabled={busy || (!included && selected.length >= 3)}
                      onChange={() =>
                        onChange(
                          included
                            ? selected.filter((f) => f.id !== file.id)
                            : [...selected, file],
                        )
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-xs font-medium underline decoration-primary/40 underline-offset-4"
                      >
                        {file.name}
                      </a>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {fileSize(file.size)} · Expires{" "}
                        {new Intl.DateTimeFormat("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          timeZone: "Asia/Kolkata",
                        }).format(new Date(file.expiresAt))}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      aria-label={`Revoke link for ${file.name}`}
                      onClick={() => setConfirmRevoke(file.id)}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                  {confirmRevoke === file.id && (
                    <div className="space-y-2 border-t pt-2">
                      <p className="text-xs text-muted-foreground">
                        Revoke this link everywhere it was shared? Downloads
                        already saved by recipients remain on their devices.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          onClick={() => void revoke(file)}
                        >
                          Revoke link
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setConfirmRevoke(null)}
                        >
                          Keep link
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {status && (
        <p
          role="status"
          className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
        >
          {busy && <LoaderCircle size={14} className="shrink-0 animate-spin" />}
          {status}
        </p>
      )}
    </section>
  );
}
