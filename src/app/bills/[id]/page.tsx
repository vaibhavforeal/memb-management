import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { readMemberBill } from "@/lib/member-documents";
import { BillDocument } from "@/components/member-document";
import { DocumentPreview } from "@/components/document-preview";

export const metadata = {
  title: "Membership bill",
  robots: { index: false, follow: false },
};
export default async function BillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getContext(),
    { id } = await params;
  const bill = await readMemberBill(ctx, id);
  if (!bill) notFound();
  return (
    <main className="document-page mx-auto max-w-4xl px-4 py-8">
      <Link
        href={`/members/${bill.memberId}?tab=payments`}
        className="no-print mb-5 inline-block text-sm text-muted-foreground"
      >
        ← Back to member
      </Link>
      <DocumentPreview
        kind="bill"
        width={1000}
        filename={`${bill.member.code}-bill-${bill.id}`}
      >
        <BillDocument bill={bill} />
      </DocumentPreview>
    </main>
  );
}
