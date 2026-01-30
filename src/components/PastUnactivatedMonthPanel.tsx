import type { YM } from "../app/types";

interface PastUnactivatedMonthPanelProps {
  ym: YM;
}

/**
 * Panel shown when navigating to a past month that was never set up.
 */
export default function PastUnactivatedMonthPanel({ ym }: PastUnactivatedMonthPanelProps) {
  const [year, month] = ym.split("-");
  const formattedMonth = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div
      style={{
        padding: 40,
        textAlign: "center",
        backgroundColor: "white",
        borderRadius: 16,
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
      <p style={{ fontSize: 18, marginBottom: 12 }}>Nothing to see here</p>
      <p style={{ color: "#666", marginBottom: 8, fontSize: 14 }}>
        {formattedMonth}
      </p>
      <p style={{ color: "#888", fontSize: 13 }}>
        This month was never set up. ✨
      </p>
    </div>
  );
}
