import type { Metadata } from "next";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "./globals.css";
function metadataBase() {
  try {
    return new URL(process.env.BETTER_AUTH_URL ?? "");
  } catch {
    return undefined;
  }
}
export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title: {
    default: "membrr · Memberships, made simple",
    template: "%s · membrr",
  },
  description:
    "A little less admin. A lot more community. Membership operations for gyms and sports arenas.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
