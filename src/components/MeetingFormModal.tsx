import { useEffect, useState } from "react";
import type { DateISO, MeetingEntry, MeetingRecurrence } from "../app/types";
import { formatDateDisplay } from "../app/storage";
import { APP_MAIN_COLOR } from "../app/theme";

interface MeetingFormModalProps {
  date: DateISO;
  meeting?: MeetingEntry;
  onSave: (meeting: Omit<MeetingEntry, "id" | "createdAt">) => void;
  onCancel: () => void;
}

interface FormState {
  title: string;
  startTime: string;
  endTime: string;
  link: string;
  description: string;
  recurrence: MeetingRecurrence;
}

interface ValidationErrors {
  title?: string;
  startTime?: string;
  endTime?: string;
  link?: string;
}

const TIME_VALUE_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const RANGE_VALUE_REGEX = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/;

function parseTimeToMinutes(time: string): number | null {
  if (!TIME_VALUE_REGEX.test(time)) return null;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function addMinutesToTime(time: string, extraMinutes: number): string | null {
  const startMinutes = parseTimeToMinutes(time);
  if (startMinutes == null) return null;

  const endMinutes = startMinutes + extraMinutes;
  if (endMinutes >= 24 * 60) return null;
  return minutesToTime(endMinutes);
}

function parseMeetingTime(time: string | undefined): Pick<FormState, "startTime" | "endTime"> {
  if (time && RANGE_VALUE_REGEX.test(time)) {
    const [startTime, endTime] = time.split("-");
    return { startTime, endTime };
  }

  if (time && TIME_VALUE_REGEX.test(time)) {
    return {
      startTime: time,
      endTime: addMinutesToTime(time, 60) ?? "10:00",
    };
  }

  return { startTime: "09:00", endTime: "10:00" };
}

function buildMeetingTime(form: FormState): string {
  return `${form.startTime}-${form.endTime}`;
}

function validateMeetingForm(form: FormState): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!form.title.trim()) {
    errors.title = "Title is required";
  }

  const startMinutes = parseTimeToMinutes(form.startTime);
  if (startMinutes == null) {
    errors.startTime = "Choose a valid start time";
  }

  const endMinutes = parseTimeToMinutes(form.endTime);
  if (endMinutes == null) {
    errors.endTime = "Choose a valid end time";
  } else if (startMinutes != null && endMinutes <= startMinutes) {
    errors.endTime = "End time must be after start time";
  }

  const trimmedLink = form.link.trim();
  if (trimmedLink && !trimmedLink.startsWith("http://") && !trimmedLink.startsWith("https://")) {
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
  const initialTimeState = parseMeetingTime(meeting?.time);
  const [form, setForm] = useState<FormState>({
    title: meeting?.title ?? "",
    startTime: initialTimeState.startTime,
    endTime: initialTimeState.endTime,
    link: meeting?.link ?? "",
    description: meeting?.description ?? "",
    recurrence: meeting?.recurrence ?? "NONE",
  });
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const nextTimeState = parseMeetingTime(meeting?.time);
    setForm({
      title: meeting?.title ?? "",
      startTime: nextTimeState.startTime,
      endTime: nextTimeState.endTime,
      link: meeting?.link ?? "",
      description: meeting?.description ?? "",
      recurrence: meeting?.recurrence ?? "NONE",
    });
    setErrors({});
    setTouched({});
  }, [meeting, date]);

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

  const handleStartTimeChange = (value: string) => {
    setForm((prev) => {
      const nextStartMinutes = parseTimeToMinutes(value);
      const currentEndMinutes = parseTimeToMinutes(prev.endTime);
      if (
        nextStartMinutes != null &&
        (currentEndMinutes == null || currentEndMinutes <= nextStartMinutes)
      ) {
        return {
          ...prev,
          startTime: value,
          endTime: addMinutesToTime(value, 60) ?? prev.endTime,
        };
      }

      return { ...prev, startTime: value };
    });
    setTouched((prev) => ({ ...prev, startTime: true }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validateMeetingForm(form);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length === 0) {
      const ym = date.slice(0, 7) as any;
      onSave({
        date,
        ym,
        title: form.title.trim(),
        time: buildMeetingTime(form),
        link: form.link.trim() || undefined,
        description: form.description.trim() || undefined,
        recurrence: form.recurrence === "NONE" ? undefined : form.recurrence,
      });
    }
  };

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
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: "white",
            borderRadius: 12,
            padding: 24,
            maxWidth: 560,
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

            <div style={{ marginBottom: 16 }}>
              <label
                style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 600 }}
              >
                Time <span style={{ color: "#f44336" }}>*</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 20px 1fr", gap: 10, alignItems: "start" }}>
                <div>
                  <label
                    htmlFor="meeting-start-time"
                    style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: "#475569" }}
                  >
                    Start
                  </label>
                  <input
                    id="meeting-start-time"
                    type="time"
                    step={300}
                    value={form.startTime}
                    onChange={(e) => handleStartTimeChange(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: 14,
                      fontWeight: 600,
                      border: `1px solid ${errors.startTime ? "#f44336" : "#cbd5e1"}`,
                      borderRadius: 10,
                      boxSizing: "border-box",
                      backgroundColor: "white",
                    }}
                  />
                  {errors.startTime && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#f44336" }}>
                      {errors.startTime}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    paddingTop: 33,
                    textAlign: "center",
                    fontSize: 14,
                    color: "#94a3b8",
                    fontWeight: 700,
                  }}
                >
                  →
                </div>

                <div>
                  <label
                    htmlFor="meeting-end-time"
                    style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: "#475569" }}
                  >
                    End
                  </label>
                  <input
                    id="meeting-end-time"
                    type="time"
                    step={300}
                    value={form.endTime}
                    onChange={(e) => handleChange("endTime", e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: 14,
                      fontWeight: 600,
                      border: `1px solid ${errors.endTime ? "#f44336" : "#cbd5e1"}`,
                      borderRadius: 10,
                      boxSizing: "border-box",
                      backgroundColor: "white",
                    }}
                  />
                  {errors.endTime && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#f44336" }}>
                      {errors.endTime}
                    </div>
                  )}
                </div>
              </div>

            </div>

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
                  backgroundColor: hasErrors ? "#ccc" : APP_MAIN_COLOR,
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
