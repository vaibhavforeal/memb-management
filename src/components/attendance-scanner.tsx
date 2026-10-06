"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, ScanLine, CheckCircle2 } from "lucide-react";
import { confirmQrCheckIn, scanQrCard } from "@/app/attendance-actions";
import type { ScannedMember } from "@/lib/member-qr-format";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

function decodeImage(
  source: HTMLVideoElement | HTMLImageElement,
  canvas: HTMLCanvasElement,
  decode: typeof import("jsqr").default,
) {
  const width =
    source instanceof HTMLVideoElement
      ? source.videoWidth
      : source.naturalWidth;
  const height =
    source instanceof HTMLVideoElement
      ? source.videoHeight
      : source.naturalHeight;
  if (!width || !height) return null;
  const scale = Math.min(1, 1280 / Math.max(width, height));
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Image decoding is unavailable.");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return decode(pixels.data, pixels.width, pixels.height)?.data ?? null;
}

export function AttendanceScanner() {
  return (
    <Dialog
      title="Scan member QR"

      trigger={
        <Button>
          <ScanLine />
          Scan member QR
        </Button>
      }
    >
      <ScannerPanel />
    </Dialog>
  );
}

function ScannerPanel() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const generation = useRef(0);
  const scanning = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [payload, setPayload] = useState("");
  const [member, setMember] = useState<ScannedMember | null>(null);

  function stopCamera() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }
  useEffect(
    () => () => {
      generation.current++;
      scanning.current = false;
      stopCamera();
    },
    [],
  );

  async function identify(raw: string, run: number) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await scanQrCard(raw);
      if (run !== generation.current) return;
      if (result.ok) {
        setMember(result.member);
        setPayload(raw);
      } else setError(result.message);
    } catch {
      if (run === generation.current)
        setError("Unable to look up this QR. Please try again.");
    } finally {
      if (run === generation.current) setBusy(false);
    }
  }

  async function startCamera() {
    const run = ++generation.current;
    stopCamera();
    setError("");
    setSuccess("");
    setMember(null);
    setPayload("");
    setBusy(true);
    setCamera(true);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Use HTTPS (or localhost) for the camera, or choose a QR image instead.",
        );
      }
      const { default: decode } = await import("jsqr");
      if (run !== generation.current) return;
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (run !== generation.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      scanning.current = true;
      video.current!.srcObject = media;
      await video.current!.play();
      if (run !== generation.current) return;
      setBusy(false);
      const canvas = document.createElement("canvas");
      function scanFrame() {
        if (!scanning.current || run !== generation.current || !video.current)
          return;
        try {
          const raw = decodeImage(video.current, canvas, decode);
          if (raw) {
            scanning.current = false;
            stopCamera();
            setCamera(false);
            void identify(raw, run);
            return;
          }
          timer.current = window.setTimeout(scanFrame, 250);
        } catch {
          scanning.current = false;
          stopCamera();
          setCamera(false);
          setError(
            "Unable to read the camera. Try again or choose a QR image.",
          );
        }
      }
      scanFrame();
    } catch (cause) {
      if (run !== generation.current) return;
      scanning.current = false;
      stopCamera();
      setCamera(false);
      setBusy(false);
      setError(
        cause instanceof Error && cause.message.startsWith("Use HTTPS")
          ? cause.message
          : "Camera unavailable or permission denied. Allow camera access and retry, or choose a QR image.",
      );
    }
  }

  async function readImage(file: File) {
    const run = ++generation.current;
    scanning.current = false;
    stopCamera();
    setCamera(false);
    setMember(null);
    setPayload("");
    setError("");
    setSuccess("");
    setBusy(true);
    if (
      file.size > 10 * 1024 * 1024 ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    ) {
      setError("Choose a PNG, JPG or WebP image up to 10 MB.");
      setBusy(false);
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const { default: decode } = await import("jsqr");
      if (run !== generation.current) return;
      const image = new Image();
      image.src = url;
      await image.decode();
      if (run !== generation.current) return;
      const raw = decodeImage(image, document.createElement("canvas"), decode);
      if (!raw) throw new Error("No QR detected.");
      await identify(raw, run);
    } catch {
      if (run === generation.current)
        setError(
          "No readable QR found. Try a clearer image of the member’s QR card.",
        );
    } finally {
      URL.revokeObjectURL(url);
      if (run === generation.current) setBusy(false);
    }
  }

  async function confirm() {
    const run = generation.current;
    setBusy(true);
    setError("");
    try {
      const result = await confirmQrCheckIn(payload);
      if (run !== generation.current) return;
      if (result.ok) {
        setSuccess(result.message);
        setMember(null);
        setPayload("");
        router.refresh();
      } else setError(result.message);
    } catch {
      if (run === generation.current)
        setError(
          "Unable to confirm check-in. Retry safely; a duplicate will not be recorded.",
        );
    } finally {
      if (run === generation.current) setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={startCamera} disabled={busy || camera}>
          <Camera />
          {success ? "Scan next member" : "Start camera"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          <ImagePlus />
          Choose QR image
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Choose member QR image"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void readImage(file);
          }}
        />
      </div>
      <video
        ref={video}
        muted
        playsInline
        aria-label="QR camera preview"
        className={`aspect-[4/3] w-full rounded-lg bg-black object-cover ${camera ? "" : "hidden"}`}
      />
      {camera && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Hold the QR steady inside the camera view.</span>
          <Button
            variant="ghost"
            onClick={() => {
              generation.current++;
              scanning.current = false;
              stopCamera();
              setCamera(false);
              setBusy(false);
            }}
          >
            Stop camera
          </Button>
        </div>
      )}
      {busy && (
        <p role="status" className="text-xs text-muted-foreground">
          Please wait…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {success && (
        <div
          role="status"
          className="flex gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm text-primary"
        >
          <CheckCircle2 size={18} className="shrink-0" />
          {success}
        </div>
      )}
      {member && (
        <div className="space-y-3 rounded-lg border p-3">
          <div>
            <p className="font-semibold">{member.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {member.code} · {member.status}
            </p>
          </div>
          {member.checkedIn ? (
            <p className="text-sm text-primary">Already checked in today.</p>
          ) : member.canCheckIn ? (
            <>
              <Button onClick={confirm} disabled={busy}>
                Confirm check-in
              </Button>
            </>
          ) : (
            <p className="text-sm text-destructive">
              An active membership is required to check in.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
