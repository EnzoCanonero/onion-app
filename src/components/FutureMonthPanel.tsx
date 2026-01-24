import type { YM } from "../app/types";

interface FutureMonthPanelProps {
  ym: YM;
}

/**
 * Panel shown when navigating to a future month (blocked in normal mode).
 */
export default function FutureMonthPanel({ ym }: FutureMonthPanelProps) {
  const [year, month] = ym.split("-");
  const formattedMonth = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div
      style={{
        padding: 48,
        textAlign: "center",
        border: "2px dashed #ddd",
        borderRadius: 12,
        backgroundColor: "#fafafa",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔮</div>
      <p style={{ fontSize: 18, marginBottom: 12 }}>Future month</p>
      <p style={{ color: "#666", marginBottom: 8, fontSize: 14 }}>
        {formattedMonth}
      </p>
      <p style={{ color: "#888", fontSize: 13 }}>
        This month is in the future. Come back when it's time!
      </p>
    </div>
  );
}
