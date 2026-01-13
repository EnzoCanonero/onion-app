import { Link } from "react-router-dom";
import type { YM } from "../app/types";

interface EmptyMonthPanelProps {
  ym: YM;
  showCreateButton?: boolean;
}

export default function EmptyMonthPanel({ ym, showCreateButton = true }: EmptyMonthPanelProps) {
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
      border: "2px dashed #ccc",
      borderRadius: 8,
      background: "#f9f9f9",
      margin: "20px 0"
    }}>
      <p style={{ fontSize: 18, color: "#666", marginBottom: 20 }}>
        No plan yet for <strong>{monthName}</strong>. Create one to get started!
      </p>
      {showCreateButton && (
        <Link to={`/month/${ym}/setup`}>
          <button style={{
            padding: "10px 20px",
            fontSize: 16,
            background: "#007bff",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer"
          }}>
            ✨ Create Month Plan
          </button>
        </Link>
      )}
      {!showCreateButton && (
        <Link to={`/month/${ym}/setup`} style={{ color: "#007bff" }}>
          Go to Month Setup →
        </Link>
      )}
    </div>
  );
}
