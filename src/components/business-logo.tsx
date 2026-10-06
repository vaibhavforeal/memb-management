import Image from "next/image";
import { Ticket } from "lucide-react";
import { cn } from "@/lib/utils";

export function BusinessLogo({
  src,
  name,
  size = 32,
  className,
}: {
  src: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white p-1",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image
          src={src}
          alt={`${name} logo`}
          width={size}
          height={size}
          unoptimized
          loading="eager"
          className="h-full w-full object-contain"
        />
      ) : (
        <Ticket
          size={Math.round(size * 0.5)}
          aria-hidden="true"
          className="text-primary"
        />
      )}
    </span>
  );
}
