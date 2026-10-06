import { Badge } from "@/components/ui/badge";

const stats = [
  { label: "Active members", value: "248" },
  { label: "Collected this month", value: "₹1,84,500" },
  { label: "Dues pending", value: "₹23,400" },
];

const rows = [
  { name: "Arjun Mehta", plan: "Annual", due: "12 Nov", status: "Active" },
  { name: "Priya Nair", plan: "Quarterly", due: "02 Nov", status: "Expiring" },
  { name: "Rohan Iyer", plan: "Monthly", due: "28 Oct", status: "Expired" },
  { name: "Sneha Kulkarni", plan: "Annual", due: "19 Jan", status: "Active" },
];

// Static trend line so the landing page ships no chart JavaScript.
const trend = [38, 46, 43, 58, 66, 79];
const points = trend.map(
  (v, i) => `${(i / (trend.length - 1)) * 300},${100 - v}`,
);
const line = `M${points.join(" L")}`;
const area = `${line} L300,100 L0,100 Z`;

export function ProductMockup() {
  return (
    <div
      className="rounded-2xl border border-white/20 bg-card text-card-foreground shadow-[0_30px_80px_-20px_rgba(2,12,40,0.6)]"
      role="img"
      aria-label="Preview of the membrr dashboard with sample data: active members, monthly collections, pending dues and a list of members with their membership status."
    >
      <div aria-hidden>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Overview</span>
          <Badge>Demo data</Badge>
        </div>
        <div className="grid grid-cols-3 gap-px bg-border">
          {stats.map((s) => (
            <div key={s.label} className="bg-card px-4 py-3">
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight sm:text-xl">
                {s.value}
              </p>
            </div>
          ))}
        </div>
        <div className="border-t px-4 pb-2 pt-4">
          <p className="mb-1 text-[11px] text-muted-foreground">
            Collections, last 6 months
          </p>
          <svg
            viewBox="0 0 300 100"
            className="h-24 w-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="mock-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#mock-fill)" />
            <path
              d={line}
              fill="none"
              stroke="#1d4ed8"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="table-wrap border-t">
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Plan</th>
                <th>Renews</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td className="font-medium">{r.name}</td>
                  <td className="text-muted-foreground">{r.plan}</td>
                  <td className="text-muted-foreground">{r.due}</td>
                  <td>
                    <Badge>{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
