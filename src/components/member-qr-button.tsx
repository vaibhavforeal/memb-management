"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Download, Printer, QrCode } from "lucide-react";
import { createQrCard } from "@/app/attendance-actions";
import type { MemberQrCard } from "@/lib/member-qr-format";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

export function MemberQrButton({
  memberId,
  owner,
}: {
  memberId: string;
  owner: boolean;
}) {
  const [card, setCard] = useState<MemberQrCard | null>(null);
  const [message, setMessage] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [pending, startTransition] = useTransition();
  function load(replace = false) {
    setMessage("");
    setCard(null);
    setReplacing(false);
    startTransition(async () => {
      try {
        const result = await createQrCard(memberId, replace);
        if (result.ok) setCard(result.card);
        else setMessage(result.message);
      } catch {
        setMessage("Unable to load the card. Please try again.");
      }
    });
  }
  return (
    <Dialog
      title="Member QR card"

      trigger={
        <Button variant="secondary" onClick={() => load()}>
          <QrCode />
          Member QR
        </Button>
      }
    >
      {pending && (
        <p role="status" className="text-sm text-muted-foreground">
          Preparing QR card…
        </p>
      )}
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      {card && (
        <div className="space-y-3">
          <div className="text-center">
            <p className="font-semibold">{card.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {card.code} · {card.business}
            </p>
            <img
              src={card.image}
              alt={`Attendance QR for ${card.name}`}
              width={240}
              height={240}
              className="mx-auto mt-3 rounded-lg"
            />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <a href={card.image} download={`${card.code}-attendance-qr.png`}>
                <Download />
                Download QR
              </a>
            </Button>
            <Button asChild variant="secondary">
              <Link
                href={`/member-card/${memberId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Printer />
                Open membership card
              </Link>
            </Button>
          </div>

          {owner && (
            <div className="border-t pt-3">
              {replacing ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    The old QR will stop working. Give the member the
                    replacement card.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="destructive" onClick={() => load(true)}>
                      Replace QR now
                    </Button>
                    <Button variant="ghost" onClick={() => setReplacing(false)}>
                      Keep current QR
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReplacing(true)}
                >
                  Replace lost QR
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
