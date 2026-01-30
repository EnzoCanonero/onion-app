import { Link } from "react-router-dom";
import type { DateISO, YM } from "../app/types";

interface EmptyMonthPanelProps {
  date: DateISO;
}

/**
 * Panel shown in Daily page when no Month Plan exists.
 * Redirects user to create a Month Plan.
 */
export default function EmptyMonthPanel({ date }: EmptyMonthPanelProps) {
  const ym = date.slice(0, 7) as YM;
  // Format YM as "Month Year" (e.g., "December 2025")
  const [year, month] = ym.split('-');
  const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });

  return (
    <div style={{
      padding: 40,
      textAlign: "center",
      backgroundColor: "white",
      borderRadius: 16,
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
      <p style={{ fontSize: 18, marginBottom: 12 }}>
        No Month Plan for <strong>{monthName}</strong>
      </p>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
        Set up your month to start planning your days. ✨
      </p>
      <Link to={`/month/${date}/setup`}>
        <button style={{
          padding: "12px 24px",
          fontSize: 16,
          fontWeight: 600,
          background: "#673ab7",
          color: "white",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
        }}>
          📅 Go to Month Setup
        </button>
      </Link>
    </div>
  );
}
