import { Link } from "react-router-dom";

/**
 * Panel shown in Month Setup page when no Grand Plan exists.
 * Redirects user to create a Grand Plan.
 */
export default function NoGrandPlanPanel() {
  return (
    <div style={{
      padding: 48,
      textAlign: "center",
      border: "2px dashed #ddd",
      borderRadius: 12,
      backgroundColor: "#fafafa",
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
      <p style={{ fontSize: 18, marginBottom: 12 }}>
        No Grand Plan yet
      </p>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
        Create a Grand Plan to start organizing your long-term goals.
      </p>
      <Link to="/grand-plan">
        <button style={{
          padding: "12px 24px",
          fontSize: 16,
          fontWeight: 600,
          background: "#4caf50",
          color: "white",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
        }}>
          🎯 Go to Grand Plan
        </button>
      </Link>
    </div>
  );
}
