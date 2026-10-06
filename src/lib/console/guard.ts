import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../auth";

export type ConsoleAccess = "anonymous" | "forbidden" | "ok";

/** Pure decision used by requireConsoleAdmin(). */
export function consoleAccess(
  user: { platformAdmin?: boolean } | null,
): ConsoleAccess {
  if (!user) return "anonymous";
  return user.platformAdmin ? "ok" : "forbidden";
}

export async function requireConsoleAdmin(): Promise<{
  id: string;
  name: string;
  email: string;
}> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  const access = consoleAccess(session?.user ?? null);
  if (access === "anonymous" || !session) redirect("/login");
  if (access === "forbidden") {
    await auth.api.signOut({ headers: requestHeaders });
    redirect("/login?error=not_admin");
  }
  const { id, name, email } = session.user;
  return { id, name, email };
}
