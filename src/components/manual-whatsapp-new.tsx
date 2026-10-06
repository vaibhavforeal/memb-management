import Link from "next/link";
import { getContext } from "@/lib/context";
import { manualComposer } from "@/lib/manual-whatsapp";
import { listSharedFiles, shareLinkConfig } from "@/lib/shared-files";
import { PageHeading } from "./page-heading";
import { ManualComposer } from "./manual-composer";
import { Input, NativeSelect } from "./ui/input";
import { Button } from "./ui/button";
export type ManualParams = {
  memberId?: string;
  kind?: string;
  referenceId?: string;
  segment?: string;
  q?: string;
  page?: string;
};
export default async function ManualWhatsAppNew({
  searchParams,
}: {
  searchParams: Promise<ManualParams>;
}) {
  const ctx = await getContext();
  const params = await searchParams;
  const [data, files] = await Promise.all([
    manualComposer(ctx, params),
    listSharedFiles(ctx),
  ]);
  const url = (page: number) =>
    `/whatsapp/new?${new URLSearchParams({ segment: data.segment, q: params.q ?? "", page: String(page) })}`;
  return (
    <>
      <Link
        className="mb-3 inline-block text-xs text-muted-foreground"
        href="/whatsapp"
      >
        ← WhatsApp follow-ups
      </Link>
      <PageHeading
        title={
          data.kind === "ANNOUNCEMENT"
            ? "An update, one chat at a time"
            : "Send a personal message"
        }
      />
      {!params.memberId && (
        <form className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
          <label className="field">
            Audience
            <NativeSelect name="segment" defaultValue={data.segment}>
              <option value="active">Active members</option>
              <option value="all">All members</option>
              <option value="expiring">Expiring this week</option>
              <option value="expired">Expired memberships</option>
            </NativeSelect>
          </label>
          <label className="field flex-1">
            Search members
            <Input
              name="q"
              defaultValue={params.q}
              placeholder="Name, phone or member ID"
            />
          </label>
          <Button variant="secondary">Find recipients</Button>
          <p className="w-full text-xs text-muted-foreground">
            {data.total} members · Up to 50 per page
          </p>
        </form>
      )}
      <ManualComposer
        key={
          params.memberId
            ? `${params.memberId}:${data.kind}:${params.referenceId ?? ""}`
            : "announcement"
        }
        recipients={data.recipients}
        kind={data.kind}
        business={data.business}
        files={files}
        localFileLinks={shareLinkConfig().localOnly}
      />
      {!params.memberId && (
        <div className="mt-4 flex justify-end gap-3 text-sm">
          {data.page > 1 && (
            <Link href={url(data.page - 1)}>Previous recipients</Link>
          )}
          {data.page * 50 < data.total && (
            <Link href={url(data.page + 1)}>Next recipients</Link>
          )}
        </div>
      )}
    </>
  );
}
