import { getContext, ownerOnly } from "@/lib/context";
import { ImportMembers } from "@/components/import-members";
import { PageHeading } from "@/components/page-heading";
export default async function ImportPage() {
  ownerOnly(await getContext());
  return (
    <>
      <PageHeading title="Import members" />
      <div className="max-w-4xl">
        <ImportMembers />
      </div>
    </>
  );
}
