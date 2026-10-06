import { getContext, ownerOnly } from "@/lib/context";
import { db } from "@/lib/db";
import { PageHeading } from "@/components/page-heading";
import { CampaignForm } from "@/components/campaign-form";
import { manualWhatsApp } from "@/lib/whatsapp-mode";
import ManualWhatsAppNew, {
  type ManualParams,
} from "@/components/manual-whatsapp-new";
export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<ManualParams>;
}) {
  if (manualWhatsApp())
    return <ManualWhatsAppNew searchParams={searchParams} />;
  const ctx = await getContext();
  ownerOnly(ctx);
  const [templates, members] = await Promise.all([
    db.messageTemplate.findMany({
      where: {
        businessId: ctx.businessId,
        status: "APPROVED",
        purpose: "ANNOUNCEMENT",
        category: { in: ["UTILITY", "MARKETING"] },
      },
    }),
    db.member.findMany({
      where: { businessId: ctx.businessId, archived: false },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <>
      <PageHeading title="A little update goes a long way" />
      <CampaignForm
        templates={templates.filter((t) => t.parameterKeys.every(Boolean))}
        members={members}
      />
    </>
  );
}
