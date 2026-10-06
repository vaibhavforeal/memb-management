import { requireConsoleAdmin } from "@/lib/console/guard";
import { ConsoleShell } from "@/components/console/console-shell";

export const dynamic = "force-dynamic";

export default async function ConsoleAuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireConsoleAdmin();
  return <ConsoleShell admin={admin}>{children}</ConsoleShell>;
}
