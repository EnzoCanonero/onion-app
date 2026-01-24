import { useState, useEffect } from "react";
import type { DateISO, MeetingEntry, MeetingRecurrence } from "../app/types";
import { formatDateDisplay } from "../app/storage";

interface MeetingFormModalProps {
  date: DateISO;
  meeting?: MeetingEntry;
  onSave: (meeting: Omit<MeetingEntry, "id" | "createdAt">) => void;
  onCancel: () => void;
}

interface FormState {
  title: string;
  time: string;
  link: string;
  description: string;
  recurrence: MeetingRecurrence;
}

interface ValidationErrors {
  title?: string;
  time?: string;
  link?: string;
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function validateMeetingForm(form: FormState): ValidationErrors {
  const errors: ValidationErrors = {};

  // Title validation
  if (!form.title.trim()) {
    errors.title = "Title is required";
  }

  // Time validation
  const singleTimeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const rangeRegex = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/;

  if (!singleTimeRegex.test(form.time) && !rangeRegex.test(form.time)) {
    errors.time = "Invalid time format. Use HH:MM or HH:MM-HH:MM";
  } else if (rangeRegex.test(form.time)) {
    // Validate time range (end > start)
    const [start, end] = form.time.split("-");
    const startMinutes = parseTimeToMinutes(start);
    const endMinutes = parseTimeToMinutes(end);

    if (endMinutes <= startMinutes) {
      errors.time = "End time must be after start time";
    }
  }

  // Link validation (basic URL check)
  if (form.link && !form.link.startsWith("http://") && !form.link.startsWith("https://")) {
    errors.link = "URL must start with http:// or https://";
  }

  return errors;
}

export default function MeetingFormModal({
  date,
  meeting,
  onSave,
  onCancel,
}: MeetingFormModalProps) {
  const [form, setForm] = useState<FormState>({
    title: meeting?.title ?? "",
    time: meeting?.time ?? "",
    link: meeting?.link ?? "",
    description: meeting?.description ?? "",
    recurrence: meeting?.recurrence ?? "NONE",
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const handleChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: field === "recurrence" ? (value as MeetingRecurrence) : value,
    }));
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validateMeetingForm(form);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length === 0) {
      const ym = date.slice(0, 7) as any; // YM type
      onSave({
        date,
        ym,
        title: form.title.trim(),
        time: form.time.trim(),
        link: form.link.trim() || undefined,
        description: form.description.trim() || undefined,
        recurrence: form.recurrence === "NONE" ? undefined : form.recurrence,
      });
    }
  };

  // Validate on change (only show errors for touched fields)
  useEffect(() => {
    const validationErrors = validateMeetingForm(form);
    const filteredErrors: ValidationErrors = {};

    Object.keys(validationErrors).forEach((key) => {
      if (touched[key]) {
        filteredErrors[key as keyof ValidationErrors] = validationErrors[key as keyof ValidationErrors];
      }
    });

    setErrors(filteredErrors);
  }, [form, touched]);

  const hasErrors = Object.keys(validateMeetingForm(form)).length > 0;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onCancel}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 3000,
        }}
      >
        {/* Modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: "white",
            borderRadius: 12,
            padding: 24,
            maxWidth: 500,
            width: "90%",
            boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 20 }}>
            {meeting ? "Edit Meeting" : "Add Meeting"}
          </h2>
          <p style={{ marginTop: 0, marginBottom: 20, fontSize: 14, color: "#666" }}>
            {formatDateDisplay(date)}
          </p>

          <form onSubmit={handleSubmit}>
            {/* Title Field */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="title"
                style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 600 }}
              >
                Title <span style={{ color: "#f44336" }}>*</span>
              </label>
              <input
                id="title"
                type="text"
                value={form.title}
                onChange={(e) => handleChange("title", e.target.value)}
                placeholder="Team standup, Client meeting..."
                maxLength={100}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 14,
                  border: `1px solid ${errors.title ? "#f44336" : "#ddd"}`,
                  borderRadius: 6,
                  boxSizing: "border-box",
                }}
              />
              {errors.title && (
                <div style={{ marginTop: 4, fontSize: 12, color: "#f44336" }}>
                  {errors.title}
                </div>
              )}
            </div>

            {/* Time Field */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="time"
                style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 600 }}
              >
                Time <span style={{ color: "#f44336" }}>*</span>
              </label>
              <input
                id="time"
                type="text"
                value={form.time}
                onChange={(e) => handleChange("time", e.target.value)}
                placeholder="14:30 or 14:30-15:30"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 14,
                  border: `1px solid ${errors.time ? "#f44336" : "#ddd"}`,
                  borderRadius: 6,
                  boxSizing: "border-box",
                }}
              />
              {errors.time ? (
                <div style={{ marginTop: 4, fontSize: 12, color: "#f44336" }}>
                  {errors.time}
                </div>
              ) : (
                <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
                  Enter single time (14:30) or range (14:30-15:30)
                </div>
              )}
            </div>

            {/* Link Field */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="link"
                style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 600 }}
              >
                Link (optional)
              </label>
              <input
                id="link"
                type="text"
                value={form.link}
                onChange={(e) => handleChange("link", e.target.value)}
                placeholder="https://zoom.us/..."
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 14,
                  border: `1px solid ${errors.link ? "#f44336" : "#ddd"}`,
                  borderRadius: 6,
                  boxSizing: "border-box",
                }}
              />
              {errors.link && (
                <div style={{ marginTop: 4, fontSize: 12, color: "#f44336" }}>
                  {errors.link}
                </div>
              )}
            </div>

            {/* Description Field */}
            <div style={{ marginBottom: 20 }}>
              <label
                htmlFor="description"
                style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 600 }}
              >
                Description (optional)
              </label>
              <textarea
                id="description"
                value={form.description}
                onChange={(e) => handleChange("description", e.target.value)}
                placeholder="Meeting notes, agenda, participants..."
                rows={4}
                maxLength={500}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 14,
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
              <div style={{ marginTop: 4, fontSize: 12, color: "#666", textAlign: "right" }}>
                {form.description.length}/500
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label
                htmlFor="recurrence"
                style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 600 }}
              >
                Recurrence
              </label>
              <select
                id="recurrence"
                value={form.recurrence}
                onChange={(e) => handleChange("recurrence", e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 14,
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  boxSizing: "border-box",
                  backgroundColor: "white",
                }}
              >
                <option value="NONE">One-off</option>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Bi-weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={onCancel}
                style={{
                  padding: "10px 20px",
                  fontSize: 14,
                  backgroundColor: "white",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={hasErrors}
                style={{
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  backgroundColor: hasErrors ? "#ccc" : "#2196f3",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: hasErrors ? "not-allowed" : "pointer",
                }}
              >
                Save Meeting
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
