import { getContext, currentUser } from "@/lib/context";
import { db } from "@/lib/db";
import { Shell } from "@/components/shell";
import { manualWhatsApp } from "@/lib/whatsapp-mode";
import { workspaceAccess } from "@/lib/workspace-access";
import { businessLogoUrl } from "@/lib/business-logo-utils";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getContext({ allowExpired: true });
  const [business, user] = await Promise.all([
    db.business.findUniqueOrThrow({
      where: { id: ctx.businessId },
      include: {
        connection: { select: { status: true } },
        logo: { select: { version: true } },
      },
    }),
    currentUser(),
  ]);
  return (
    <Shell
      business={{
        name: business.name,
        city: business.city,
        logoUrl: businessLogoUrl(business.logo?.version),
        connectionStatus: business.connection?.status ?? "DISCONNECTED",
      }}
      user={{
        name: user.name,
        email: user.email,
        platformAdmin: user.platformAdmin,
      }}
      role={ctx.role}
      support={ctx.support}
      dryRun={process.env.WHATSAPP_DRY_RUN === "true"}
      manual={manualWhatsApp()}
      trialEndsAt={
        workspaceAccess(business) === "TRIAL"
          ? business.trialEndsAt?.toISOString()
          : undefined
      }
      date={new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }).format(new Date())}
    >
      {children}
    </Shell>
  );
}
