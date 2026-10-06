import { Users } from "lucide-react";
export function Empty({
  title = "No records",
  description,
  children,
}: {
  title?: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <div className="mb-1 rounded-xl border bg-muted p-3 text-muted-foreground">
        <Users size={24} />
      </div>
      <h3 className="font-medium">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {children}
    </div>
  );
}
