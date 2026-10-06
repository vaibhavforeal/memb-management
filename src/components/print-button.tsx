"use client";
import { Printer } from "lucide-react";
import { Button } from "./ui/button";
export function PrintButton({ label = "Print receipt" }: { label?: string }) {
  return (
    <Button onClick={() => window.print()}>
      <Printer />
      {label}
    </Button>
  );
}
