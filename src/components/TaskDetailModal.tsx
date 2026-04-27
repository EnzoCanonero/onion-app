import { useState, type CSSProperties } from "react";
import TaskSubtasksSection, { type TaskSubtaskItem } from "./TaskSubtasksSection";

type TaskDetailModalProps = {
  accentColor: string;
  titleValue: string;
  notesValue: string;
  readOnly: boolean;
  titleReadOnly?: boolean;
  notesReadOnly?: boolean;
  errorMessage?: string | null;
  onTitleChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onClose: () => void;
  onSave?: () => void;
  subtasks: TaskSubtaskItem[];
  canAddSubtask?: boolean;
  showSubtaskComposer?: boolean;
  onAddSubtask?: (title: string) => void;
  autoFocusTitle?: boolean;
};

function withHexAlpha(color: string, alphaHex: string): string {
  const normalizedAlpha = /^[0-9a-fA-F]{2}$/.test(alphaHex) ? alphaHex : "18";
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    const r = color[1];
    const g = color[2];
    const b = color[3];
    return `#${r}${r}${g}${g}${b}${b}${normalizedAlpha}`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}${normalizedAlpha}`;
  if (/^#[0-9a-fA-F]{8}$/.test(color)) return `${color.slice(0, 7)}${normalizedAlpha}`;
  return color;
}

export default function TaskDetailModal({
  accentColor,
  titleValue,
  notesValue,
  readOnly,
  titleReadOnly = false,
  notesReadOnly = false,
  errorMessage,
  onTitleChange,
  onNotesChange,
  onClose,
  onSave,
  subtasks,
  canAddSubtask = false,
  showSubtaskComposer = true,
  onAddSubtask,
  autoFocusTitle = false,
}: TaskDetailModalProps) {
  const [focusedField, setFocusedField] = useState<"title" | "notes" | null>(null);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const isTitleReadOnly = readOnly || titleReadOnly;
  const isNotesReadOnly = readOnly || notesReadOnly;

  const accentTint = withHexAlpha(accentColor, "16");
  const accentBorder = withHexAlpha(accentColor, "46");
  const accentGlow = withHexAlpha(accentColor, "28");
  const mutedBorder = "#e5e7eb";
  const mutedText = "#64748b";
  const canSubmitSubtask = canAddSubtask && subtaskDraft.trim().length > 0;

  const handleSubtaskSubmit = () => {
    const nextTitle = subtaskDraft.trim();
    if (!canAddSubtask || !onAddSubtask || !nextTitle) return;
    onAddSubtask(nextTitle);
    setSubtaskDraft("");
  };

  const sectionStyle: CSSProperties = {
    padding: 18,
    borderRadius: 18,
    border: "1px solid #e8ecf2",
    backgroundColor: "#fcfcfd",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.95)",
  };

  const getFieldStyle = (
    field: "title" | "notes",
    multiline: boolean,
    fieldReadOnly: boolean
  ): React.CSSProperties => ({
    width: "100%",
    padding: multiline ? "12px 14px" : "11px 14px",
    fontSize: multiline ? 14 : 15,
    fontWeight: multiline ? 400 : 600,
    lineHeight: multiline ? 1.65 : 1.35,
    color: "#0f172a",
    backgroundColor: fieldReadOnly ? "#f8fafc" : "#ffffff",
    border: `1px solid ${focusedField === field ? accentBorder : mutedBorder}`,
    borderRadius: 14,
    boxSizing: "border-box",
    outline: "none",
    boxShadow: focusedField === field ? `0 0 0 4px ${accentTint}` : "none",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
    resize: "none",
    fontFamily: "inherit",
    cursor: fieldReadOnly ? "default" : "text",
    minHeight: multiline ? 152 : undefined,
    overflowY: multiline ? "auto" : undefined,
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.42)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1200,
        padding: 16,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 620,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#ffffff",
          borderRadius: 24,
          border: "1px solid rgba(15,23,42,0.08)",
          boxShadow: "0 28px 80px rgba(15,23,42,0.18), 0 10px 28px rgba(15,23,42,0.10)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "22px 24px 18px",
            borderBottom: "1px solid #eef2f7",
            backgroundColor: "#ffffff",
          }}
        >
          <div
            style={{
              width: 44,
              height: 6,
              borderRadius: 999,
              backgroundColor: accentColor,
              boxShadow: `0 0 0 7px ${accentTint}`,
              marginBottom: 16,
            }}
          />
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#0f172a", letterSpacing: -0.3 }}>
                Task Details
              </h3>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                backgroundColor: "#ffffff",
                color: "#475569",
                cursor: "pointer",
                fontSize: 18,
                lineHeight: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 10px rgba(15,23,42,0.05)",
                flexShrink: 0,
              }}
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            background:
              "linear-gradient(180deg, rgba(248,250,252,0.8) 0%, rgba(255,255,255,0.98) 12%, rgba(255,255,255,1) 100%)",
          }}
        >
          <div style={{ ...sectionStyle, display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: 8,
                  fontSize: 11,
                  fontWeight: 800,
                  color: mutedText,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
              >
                Title
              </label>
              <input
                type="text"
                value={titleValue}
                onChange={(event) => onTitleChange(event.target.value)}
                readOnly={isTitleReadOnly}
                autoFocus={autoFocusTitle && !isTitleReadOnly}
                onFocus={() => setFocusedField("title")}
                onBlur={() => setFocusedField((current) => (current === "title" ? null : current))}
                style={getFieldStyle("title", false, isTitleReadOnly)}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: 8,
                  fontSize: 11,
                  fontWeight: 800,
                  color: mutedText,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
              >
                Notes
              </label>
              <textarea
                value={notesValue}
                onChange={(event) => onNotesChange(event.target.value)}
                readOnly={isNotesReadOnly}
                rows={6}
                onFocus={() => setFocusedField("notes")}
                onBlur={() => setFocusedField((current) => (current === "notes" ? null : current))}
                style={getFieldStyle("notes", true, isNotesReadOnly)}
              />
            </div>
          </div>

          <div style={sectionStyle}>
            <TaskSubtasksSection
              subtasks={subtasks}
              accentColor={accentColor}
              canAddSubtask={canAddSubtask}
              showAddSubtaskComposer={showSubtaskComposer}
              addSubtaskValue={subtaskDraft}
              onAddSubtaskValueChange={setSubtaskDraft}
              onAddSubtaskSubmit={handleSubtaskSubmit}
              canSubmitSubtask={canSubmitSubtask}
              variant="modal"
            />
          </div>

          {errorMessage ? (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid #fecaca",
                backgroundColor: "#fff5f5",
                color: "#dc2626",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {errorMessage}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: readOnly ? "flex-end" : "space-between",
            gap: 12,
            padding: "18px 24px 24px",
            borderTop: "1px solid #eef2f7",
            backgroundColor: "#ffffff",
          }}
        >
          <button
            onClick={onClose}
            style={{
              minWidth: 104,
              padding: "11px 16px",
              fontSize: 13,
              fontWeight: 800,
              backgroundColor: "#ffffff",
              color: "#475569",
              border: "1px solid #d7dee8",
              borderRadius: 14,
              cursor: "pointer",
            }}
          >
            {readOnly ? "Close" : "Cancel"}
          </button>

          {!readOnly && onSave ? (
            <button
              onClick={onSave}
              style={{
                minWidth: 104,
                padding: "11px 18px",
                fontSize: 13,
                fontWeight: 900,
                backgroundColor: accentColor,
                color: "#ffffff",
                border: "none",
                borderRadius: 14,
                cursor: "pointer",
                boxShadow: `0 12px 24px ${accentGlow}`,
              }}
            >
              Save
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
