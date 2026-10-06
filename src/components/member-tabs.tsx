"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

export function MemberTabs({
  sections,
}: {
  sections: { value: string; label: string; content: ReactNode }[];
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const requested = params.get("tab");
  const value = sections.some((section) => section.value === requested)
    ? requested!
    : "memberships";
  function selectTab(tab: string) {
    const query = new URLSearchParams(params.toString());
    query.set("tab", tab);
    window.history.pushState(null, "", `${pathname}?${query}`);
  }
  return (
    <Tabs.Root value={value} onValueChange={selectTab} className="min-w-0">
      <div className="mb-3 overflow-x-auto border-b">
        <Tabs.List
          aria-label="Member sections"
          className="flex w-max min-w-full gap-1"
        >
          {sections.map((section) => (
            <Tabs.Trigger
              key={section.value}
              value={section.value}
              className="min-h-10 shrink-0 border-b-2 border-transparent px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary data-[state=active]:border-primary data-[state=active]:text-primary sm:min-h-9"
            >
              {section.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </div>
      {sections.map((section) => (
        <Tabs.Content
          key={section.value}
          value={section.value}
          forceMount
          className="min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-primary data-[state=inactive]:hidden"
        >
          {section.content}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
