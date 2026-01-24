import { useEffect, useState } from "react";
import { APP_MAIN_COLOR } from "../app/theme";

type TitleDescriptionModalProps = {
  title: string;
  subtitle?: string;
  accentColor?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  titleLabel?: string;
  descriptionLabel?: string;
  titlePlaceholder?: string;
  descriptionPlaceholder?: string;
  initialTitle?: string;
  initialDescription?: string;
  onConfirm: (title: string, description: string) => void;
  onCancel: () => void;
};

export default function TitleDescriptionModal({
  title,
  subtitle,
  accentColor = APP_MAIN_COLOR,
  confirmLabel = "Add",
  cancelLabel = "Cancel",
  titleLabel = "Title",
  descriptionLabel = "Description",
  titlePlaceholder = "Write a short title...",
  descriptionPlaceholder = "Add a description (optional)...",
  initialTitle = "",
  initialDescription = "",
  onConfirm,
  onCancel,
}: TitleDescriptionModalProps) {
  const [draftTitle, setDraftTitle] = useState(initialTitle);
  const [draftDescription, setDraftDescription] = useState(initialDescription);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = draftTitle.trim().length > 0;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        if (!canSubmit) return;
        onConfirm(draftTitle.trim(), draftDescription);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [canSubmit, draftDescription, draftTitle, onCancel, onConfirm]);

  const submit = () => {
    const nextTitle = draftTitle.trim();
    if (!nextTitle) {
      setError("Title is required.");
      return;
    }
    onConfirm(nextTitle, draftDescription);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2500,
        padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          backgroundColor: "white",
          borderRadius: 14,
          border: "1px solid #eee",
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "18px 20px",
            borderBottom: "1px solid #eee",
            background:
              "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(250,250,250,1) 100%)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#111" }}>{title}</div>
              {subtitle && (
                <div style={{ marginTop: 6, fontSize: 13, color: "#666", lineHeight: 1.4 }}>
                  {subtitle}
                </div>
              )}
            </div>
            <button
              onClick={onCancel}
              style={{
                padding: "6px 10px",
                fontSize: 14,
                fontWeight: 900,
                backgroundColor: "white",
                border: "1px solid #ddd",
                borderRadius: 10,
                cursor: "pointer",
                color: "#666",
              }}
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#555", marginBottom: 6 }}>
              {titleLabel} <span style={{ color: "#f44336" }}>*</span>
            </label>
            <input
              type="text"
              value={draftTitle}
              onChange={(e) => {
                setDraftTitle(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                submit();
              }}
              placeholder={titlePlaceholder}
              autoFocus
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 14,
                borderRadius: 10,
                border: `1px solid ${error ? "#f44336" : "#ddd"}`,
                boxSizing: "border-box",
                outline: "none",
              }}
            />
            {error && <div style={{ marginTop: 6, fontSize: 12, color: "#f44336" }}>{error}</div>}
            <div style={{ marginTop: 6, fontSize: 12, color: "#888" }}>
              Tip: press <strong>Ctrl/⌘ + Enter</strong> to submit
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#555", marginBottom: 6 }}>
              {descriptionLabel}
            </label>
            <textarea
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
              placeholder={descriptionPlaceholder}
              rows={4}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 14,
                borderRadius: 10,
                border: "1px solid #ddd",
                boxSizing: "border-box",
                resize: "vertical",
                outline: "none",
                lineHeight: 1.5,
              }}
            />
          </div>
        </div>

        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid #eee",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            backgroundColor: "#fafafa",
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: "10px 14px",
              fontSize: 14,
              fontWeight: 700,
              backgroundColor: "white",
              border: "1px solid #ddd",
              borderRadius: 10,
              cursor: "pointer",
              color: "#555",
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            style={{
              padding: "10px 14px",
              fontSize: 14,
              fontWeight: 900,
              backgroundColor: canSubmit ? accentColor : "#ddd",
              color: "white",
              border: "none",
              borderRadius: 10,
              cursor: canSubmit ? "pointer" : "not-allowed",
              boxShadow: canSubmit ? "0 10px 22px rgba(0,0,0,0.10)" : "none",
              transition: "transform 120ms ease, box-shadow 120ms ease",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

