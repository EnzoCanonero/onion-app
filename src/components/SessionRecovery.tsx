import { useEffect, useState } from "react";
import type { ProductivitySession, FocusTemplate } from "../app/types";
import { formatTime } from "../app/storage";

type SessionRecoveryProps = {
  activeSession: ProductivitySession | undefined;
  templates: FocusTemplate[];
  onEnd: () => void;
  onDiscard: () => void;
};

export default function SessionRecovery({ activeSession, templates, onEnd, onDiscard }: SessionRecoveryProps) {
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!activeSession) return;

    const startTime = Date.parse(activeSession.startedAt);
    const now = Date.now();
    const elapsed = Math.floor((now - startTime) / 60000);

    setElapsedMinutes(elapsed);

    // Auto-discard if session is > 12 hours old
    const TWELVE_HOURS = 12 * 60;
    if (elapsed > TWELVE_HOURS) {
      alert(
        `Session started ${elapsed} minutes ago (${formatTime(activeSession.startedAt)}). Auto-discarding stale session.`
      );
      onDiscard();
      return;
    }

    // Update elapsed time every minute
    const interval = setInterval(() => {
      const currentElapsed = Math.floor((Date.now() - startTime) / 60000);
      setElapsedMinutes(currentElapsed);
    }, 60000);

    return () => clearInterval(interval);
  }, [activeSession, onDiscard]);

  if (!activeSession || dismissed) return null;

  const template = templates.find((t) => t.id === activeSession.templateId);
  const templateName = template?.title ?? "Unknown Template";

  return (
    <div
      style={{
        backgroundColor: "#fff3cd",
        border: "2px solid #ffc107",
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
          ⚠️ Active Session Detected
        </div>
        <div style={{ fontSize: 14 }}>
          <strong>{templateName}</strong> started at {formatTime(activeSession.startedAt)}
        </div>
        <div style={{ fontSize: 13, marginTop: 4, opacity: 0.8 }}>
          Elapsed: {elapsedMinutes} minutes
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => {
            onEnd();
            setDismissed(true);
          }}
          style={{
            backgroundColor: "#28a745",
            color: "white",
            border: "none",
            padding: "8px 16px",
            borderRadius: 4,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          End Session
        </button>
        <button
          onClick={() => {
            if (confirm("Discard this session without recording? This cannot be undone.")) {
              onDiscard();
              setDismissed(true);
            }
          }}
          style={{
            backgroundColor: "#dc3545",
            color: "white",
            border: "none",
            padding: "8px 16px",
            borderRadius: 4,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
