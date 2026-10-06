"use client";
import Script from "next/script";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { money } from "@/lib/domain";

type CheckoutResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};
type CheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; email: string };
  handler: (response: CheckoutResponse) => void;
  modal: { ondismiss: () => void };
  theme: { color: string };
};
declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => {
      open: () => void;
      on: (event: "payment.failed", handler: () => void) => void;
    };
  }
}

async function post(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.message || "Payment could not be checked.");
  return result;
}

export function BusinessCheckout({
  amountPaise,
  businessName,
  user,
  pendingOrderId,
  enabled,
}: {
  amountPaise: number | null;
  businessName: string;
  user: { name: string; email: string };
  pendingOrderId?: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [orderId, setOrderId] = useState(pendingOrderId);
  const inFlight = useRef(false);
  const callbackReceived = useRef(false);

  function finish() {
    inFlight.current = false;
    setBusy(false);
  }
  function report(error: unknown) {
    setFailed(true);
    setMessage(
      error instanceof Error
        ? error.message
        : "Unable to reach billing. Check payment status before paying again.",
    );
    finish();
  }
  function showStatus(paid: boolean) {
    setFailed(false);
    setMessage(
      paid
        ? "Payment confirmed. Your monthly billing period has been renewed."
        : "Payment is not captured yet. If you were debited, check again shortly; your billing will update when Razorpay confirms it.",
    );
    if (paid) setOrderId(undefined);
    finish();
    router.refresh();
  }
  async function checkStatus() {
    if (!orderId || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      showStatus(
        (await post(`/api/billing/orders/${encodeURIComponent(orderId)}`)).paid,
      );
    } catch (error) {
      report(error);
    }
  }
  async function pay() {
    if (!window.Razorpay || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    setFailed(false);
    callbackReceived.current = false;
    try {
      const order = await post("/api/billing/orders");
      setOrderId(order.id);
      // A previous tab may have paid while its callback was lost. Reconcile before opening Checkout.
      const previous = await post(
        `/api/billing/orders/${encodeURIComponent(order.id)}`,
      );
      if (previous.paid) {
        showStatus(true);
        return;
      }
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "membrr",
        description: `${businessName} — one month`,
        order_id: order.orderId,
        prefill: user,
        theme: { color: "#1d4ed8" },
        handler: (result) => {
          callbackReceived.current = true;
          setMessage("Verifying your payment…");
          void post("/api/billing/verify", {
            billingOrderId: order.id,
            ...result,
          })
            .then((status) => showStatus(status.paid))
            .catch(report);
        },
        modal: {
          ondismiss: () => {
            if (callbackReceived.current) return;
            setMessage(
              "Checkout closed. If you made a payment, check its status before trying again.",
            );
            finish();
            router.refresh();
          },
        },
      });
      checkout.on("payment.failed", () => {
        setFailed(true);
        setMessage(
          "The payment attempt failed. You can retry in Razorpay or close checkout. If debited, check payment status.",
        );
      });
      checkout.open();
    } catch (error) {
      report(error);
    }
  }

  return (
    <div className="space-y-3">
      {enabled && amountPaise !== null && (
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="afterInteractive"
          onReady={() => setReady(true)}
          onError={() => {
            setFailed(true);
            setMessage(
              "Razorpay Checkout could not load. Check your connection and reload this page.",
            );
          }}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {amountPaise !== null && (
          <Button onClick={pay} disabled={!enabled || !ready || busy}>
            <CreditCard size={16} />
            {busy ? "Processing…" : `Pay ${money(amountPaise)} for one month`}
          </Button>
        )}
        {orderId && (
          <Button
            variant="secondary"
            disabled={!enabled || busy}
            onClick={checkStatus}
          >
            <RefreshCw size={16} />
            Check payment status
          </Button>
        )}
      </div>
      {message && (
        <p
          role={failed ? "alert" : "status"}
          className={`text-sm ${failed ? "text-destructive" : "text-muted-foreground"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
