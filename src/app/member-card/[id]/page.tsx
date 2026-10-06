import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { readMembershipCard } from "@/lib/member-documents";
import { MembershipCardDocument } from "@/components/member-document";
import { DocumentPreview } from "@/components/document-preview";

export const metadata = {
  title: "Membership card",
  robots: { index: false, follow: false },
};
export default async function MemberCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getContext(),
    { id } = await params;
  const card = await readMembershipCard(ctx, id);
  if (!card) notFound();
  return (
    <main className="document-page mx-auto max-w-6xl px-4 py-8">
      <Link
        href={`/members/${id}`}
        className="no-print mb-5 inline-block text-sm text-muted-foreground"
      >
        ← Back to member
      </Link>
      <DocumentPreview
        kind="card"
        width={1080}
        filename={`${card.code}-membership-card`}
      >
        <MembershipCardDocument card={card} />
      </DocumentPreview>
    </main>
  );
}
