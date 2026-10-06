"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Copy, ExternalLink, Check, MessageCircle } from "lucide-react";
import { mutate } from "@/app/actions";
import {
  personalizeMessage,
  whatsappLink,
  type ManualKind,
} from "@/lib/manual-message-utils";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { MessageFiles } from "./message-files";
import { messageWithFiles, type SharedFileItem } from "@/lib/shared-file-utils";

type Recipient = {
  id: string;
  name: string;
  code: string;
  phone: string;
  body: string;
  reason: string;
};
export function ManualComposer({
  recipients,
  kind,
  business,
  files,
  localFileLinks,
}: {
  recipients: Recipient[];
  kind: ManualKind;
  business: string;
  files: SharedFileItem[];
  localFileLinks: boolean;
}) {
  const [text, setText] = useState(
    recipients[0]?.body ?? "Hi {name},\n\nAn update from {business}:\n\n",
  );
  const [recordedPhones, setRecordedPhones] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<SharedFileItem[]>([]);
  const [fileBusy, setFileBusy] = useState(false);
  const phones = new Set<string>();
  const unique = recipients.filter((r) => {
    if (phones.has(r.phone)) return false;
    phones.add(r.phone);
    return true;
  });
  return (
    <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <Card className="min-w-0 space-y-3 p-3 xl:sticky xl:top-5">
        <div className="flex items-center gap-2 font-medium">
          <MessageCircle size={18} className="text-primary" />
          Your message
        </div>
        <label className="field">
          Message text
          <textarea
            className="min-h-32 w-full rounded-lg border bg-background p-2.5 text-sm leading-relaxed text-foreground"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
          />
        </label>
        <p className="text-[11px] text-muted-foreground">
          {messageWithFiles(text, selectedFiles).length}/2,000 characters
          including file links.{" "}
          {kind === "ANNOUNCEMENT" &&
            "Use {name} and {business} to personalise each message."}
        </p>
        <MessageFiles
          initialFiles={files}
          selected={selectedFiles}
          onChange={setSelectedFiles}
          onBusy={setFileBusy}
          localOnly={localFileLinks}
        />
      </Card>
      <div className="min-w-0 space-y-3">
        {recipients.length > 1 && (
          <label className="field">
            Find a recipient on this page
            <input
              className="rounded-lg border bg-card px-3 py-2 text-foreground"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Name or mobile number"
            />
          </label>
        )}
        {!recipients.length && (
          <Card className="p-4 text-sm text-muted-foreground">
            No members match this audience.
          </Card>
        )}
        {unique
          .filter((r) =>
            `${r.name} ${r.phone}`.toLowerCase().includes(filter.toLowerCase()),
          )
          .map((r) => (
            <RecipientCard
              key={r.id}
              recipient={r}
              kind={kind}
              body={messageWithFiles(
                personalizeMessage(text, r.name, business),
                selectedFiles,
              )}
              fileBusy={fileBusy}
              recorded={recordedPhones.includes(r.phone)}
              onRecorded={() =>
                setRecordedPhones((current) => [...current, r.phone])
              }
            />
          ))}
        {recipients.length > unique.length && (
          <p className="text-xs text-muted-foreground">
            Shared phone numbers appear once on this page.
          </p>
        )}
      </div>
    </div>
  );
}

function RecipientCard({
  recipient: r,
  kind,
  body,
  recorded,
  onRecorded,
  fileBusy,
}: {
  recipient: Recipient;
  kind: ManualKind;
  body: string;
  recorded: boolean;
  onRecorded: () => void;
  fileBusy: boolean;
}) {
  const [confirmedBody, setConfirmedBody] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [pending, start] = useTransition();
  const requestId = useRef<string | null>(null);
  const valid = !fileBusy && body.trim().length >= 2 && body.length <= 2000;
  return (
    <Card className="min-w-0 space-y-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/members/${r.id}`} className="font-medium">
            {r.name}
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">
            {r.phone} · {r.code}
          </p>
        </div>
        {recorded && <Badge>Sent manually</Badge>}
      </div>
      {r.reason ? (
        <p className="text-xs leading-relaxed text-amber-800">
          {r.reason}{" "}
          <Link href={`/members/${r.id}`} className="underline">
            View member
          </Link>
        </p>
      ) : (
        <>
          <p className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-primary/5 p-3 text-sm leading-relaxed">
            {body}
          </p>
          {!recorded && (
            <>
              <div className="flex flex-wrap gap-2">
                {valid ? (
                  <Button asChild>
                    <a
                      href={whatsappLink(r.phone, body)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink />
                      Open WhatsApp
                    </a>
                  </Button>
                ) : (
                  <Button disabled>
                    {fileBusy
                      ? "Preparing file link…"
                      : body.length > 2000
                        ? "Message is too long"
                        : "Enter a message"}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  disabled={!valid}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(body);
                      setResult("Message copied.");
                    } catch {
                      setResult(
                        "Could not access the clipboard. Select the preview text and copy it.",
                      );
                    }
                  }}
                >
                  <Copy />
                  Copy message
                </Button>
              </div>
              {body.length > 2000 && (
                <p role="alert" className="text-xs text-amber-800">
                  This message has {body.length} characters including file
                  links. Shorten it to 2,000 characters before sending.
                </p>
              )}
              <label className="flex items-start gap-3 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={confirmedBody === body}
                  onChange={(e) =>
                    setConfirmedBody(e.target.checked ? body : null)
                  }
                />
                I sent this message in WhatsApp
              </label>
              <Button
                variant="secondary"
                disabled={pending || !valid || confirmedBody !== body}
                onClick={() =>
                  start(async () => {
                    requestId.current ??= crypto.randomUUID();
                    const data = new FormData();
                    for (const [key, value] of Object.entries({
                      _action: "manual-send",
                      memberId: r.id,
                      phone: r.phone,
                      kind,
                      body,
                      requestId: requestId.current,
                      confirmed: "true",
                    }))
                      data.set(key, value);
                    const response = await mutate(
                      { ok: false, message: "" },
                      data,
                    );
                    setResult(response.message);
                    if (response.ok) onRecorded();
                  })
                }
              >
                <Check />
                {pending ? "Recording…" : "Record as sent manually"}
              </Button>
            </>
          )}
        </>
      )}
      {result && (
        <p role="status" className="text-xs text-muted-foreground">
          {result}
        </p>
      )}
    </Card>
  );
}
