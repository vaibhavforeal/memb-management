"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
export function CollectionsChart({
  data,
}: {
  data: { month: string; total: number }[];
}) {
  return (
    <div
      className="h-[205px] w-full"
      role="img"
      aria-label={`Monthly collections: ${data.map((d) => `${d.month} ₹${d.total}`).join(", ")}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 15, right: 12, left: -18, bottom: 0 }}
        >
          <defs>
            <linearGradient id="collection-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="#dde4f0"
            vertical={false}
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#55627a", fontSize: 10 }}
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#55627a", fontSize: 10 }}
            tickFormatter={(n) => (n >= 1000 ? `₹${n / 1000}k` : `₹${n}`)}
          />
          <Tooltip
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #dde4f0",
              boxShadow: "0 4px 14px #0b1f4b1a",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(v) => [
              `₹${Number(v).toLocaleString("en-IN")}`,
              "Collections",
            ]}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="#1d4ed8"
            strokeWidth={2}
            fill="url(#collection-fill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
