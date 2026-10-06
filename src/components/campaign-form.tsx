"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Send, MessageCircle } from "lucide-react";
import { mutate, type ActionState } from "@/app/actions";
import { Button } from "./ui/button";
import { Input, NativeSelect } from "./ui/input";
import { Card } from "./ui/card";
export function CampaignForm({
  templates,
  members,
}: {
  templates: { id: string; name: string; body: string; category: string }[];
  members: { id: string; name: string; code: string }[];
}) {
  const [templateId, setTemplate] = useState(templates[0]?.id ?? ""),
    [segment, setSegment] = useState("active"),
    [preview, setPreview] = useState<ActionState | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [result, setResult] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const template = templates.find((t) => t.id === templateId);
  async function run(form: FormData, isPreview: boolean) {
    form.set("_action", isPreview ? "preview-campaign" : "campaign");
    form.set("selected", selected.join(","));
    form.set("expectedCount", String(preview?.count ?? 0));
    if (!isPreview) {
      requestId.current ??= crypto.randomUUID();
      form.set("requestId", requestId.current);
    }
    const r = await mutate({ ok: false, message: "" }, form);
    if (isPreview) setPreview(r);
    else {
      setResult(r.message);
      if (r.ok) router.push("/whatsapp");
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(() => run(f, false));
      }}
      className="grid items-start gap-3 xl:grid-cols-[1.3fr_1fr]"
    >
      <Card className="space-y-3 p-4">
        <label className="field">
          Campaign name
          <Input
            name="name"
            required
            minLength={3}
            maxLength={100}
            placeholder="e.g. October community update"
          />
        </label>
        <label className="field">
          Approved announcement template
          <NativeSelect
            name="templateId"
            value={templateId}
            onChange={(e) => {
              setTemplate(e.target.value);
              setPreview(null);
            }}
          >
            {templates.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name} · {t.category.toLowerCase()}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="field">
          Audience
          <NativeSelect
            name="segment"
            value={segment}
            onChange={(e) => {
              setSegment(e.target.value);
              setPreview(null);
            }}
          >
            <option value="active">Active members</option>
            <option value="all">All members</option>
            <option value="expiring">Expiring this week</option>
            <option value="expired">Expired memberships</option>
            <option value="selected">Selected members</option>
          </NativeSelect>
        </label>
        {segment === "selected" && (
          <div className="space-y-2">
            <Input
              aria-label="Filter recipient list"
              placeholder="Filter the member list…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="max-h-48 overflow-auto rounded border p-3">
              {members
                .filter((m) =>
                  `${m.name} ${m.code}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .slice(0, 100)
                .map((m) => (
                  <label
                    key={m.id}
                    className="flex items-center gap-3 py-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(m.id)}
                      onChange={(e) => {
                        setSelected(
                          e.target.checked
                            ? [...selected, m.id]
                            : selected.filter((id) => id !== m.id),
                        );
                        setPreview(null);
                      }}
                    />
                    {m.name}
                    <span className="ml-auto text-muted-foreground">
                      {m.code}
                    </span>
                  </label>
                ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {selected.length} selected. Shared numbers receive one message.
            </p>
          </div>
        )}
        <label className="field">
          Schedule (IST)
          <Input name="scheduledAt" type="datetime-local" />
          <span className="text-[10px]">
            Leave blank to queue immediately after confirmation.
          </span>
        </label>
        {preview && (
          <div
            role={preview.ok ? "status" : "alert"}
            className={`text-xs ${preview.ok ? "text-primary" : "text-destructive"}`}
          >
            {preview.message}
          </div>
        )}
        {result && (
          <p role="alert" className="text-xs text-destructive">
            {result}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            type="button"
            disabled={pending || !templates.length}
            onClick={(e) => {
              const f = new FormData(e.currentTarget.form!);
              start(() => run(f, true));
            }}
          >
            <Eye />
            {pending ? "Working…" : "Preview recipients"}
          </Button>
          <Button
            type="submit"
            disabled={pending || !preview?.ok || !preview.count}
          >
            <Send />
            Schedule campaign
          </Button>
        </div>
      </Card>
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <MessageCircle size={18} className="text-primary" />
          Message template
        </div>
        <div className="rounded-xl rounded-tl-none border border-primary/15 bg-primary/5 p-3 text-sm leading-relaxed">
          {template?.body ||
            "No approved announcement templates available. Connect WhatsApp and sync templates in Settings."}
        </div>
      </Card>
    </form>
  );
}
