"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { mutate, type ActionState } from "@/app/actions";
import { Button } from "./ui/button";
export const initialActionState: ActionState = { ok: false, message: "" };
export function SubmitButton({
  children = "Save changes",
  variant = "default",
}: {
  children?: React.ReactNode;
  variant?: "default" | "secondary" | "destructive";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant}>
      {pending && <Loader2 className="animate-spin" />}
      {pending ? "Saving…" : children}
    </Button>
  );
}
export function FormNotice({ ok, message }: { ok: boolean; message: string }) {
  return (
    <div
      role={ok ? "status" : "alert"}
      className={`flex gap-2 rounded-md border p-3 text-xs ${ok ? "border-primary/20 bg-primary/5 text-primary" : "border-destructive/20 bg-destructive/5 text-destructive"}`}
    >
      {ok ? (
        <CheckCircle2 size={16} className="shrink-0" />
      ) : (
        <AlertCircle size={16} className="shrink-0" />
      )}
      {message}
    </div>
  );
}
export function ActionForm({
  action,
  children,
  submit = "Save changes",
  className = "space-y-3",
  variant = "default",
  serverAction = mutate,
}: {
  action: string;
  children?: React.ReactNode;
  submit?: string;
  className?: string;
  variant?: "default" | "secondary" | "destructive";
  serverAction?: (prev: ActionState, form: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState(serverAction, initialActionState);
  const router = useRouter();
  useEffect(() => {
    if (!state.ok || !state.redirectTo) return;
    // Absolute URLs cross hosts (console ↔ main site); the client router cannot.
    if (/^https?:\/\//i.test(state.redirectTo))
      window.location.assign(state.redirectTo);
    else router.push(state.redirectTo);
  }, [state, router]);
  return (
    <form action={formAction} className={className}>
      <input type="hidden" name="_action" value={action} />
      {children}
      {state.message && <FormNotice ok={state.ok} message={state.message} />}
      <SubmitButton variant={variant}>{submit}</SubmitButton>
    </form>
  );
}
