import { useRef, useState } from "react";
import type { DateISO, MeetingEntry, YM } from "../app/types";
import { formatDateDisplay, getTodayDate } from "../app/storage";
import { APP_MAIN_COLOR } from "../app/theme";

interface CalendarGridProps {
  currentMonth: YM;
  selectedDate: DateISO;
  onDayClick: (date: DateISO, event: React.MouseEvent) => void;
  onMonthChange: (direction: "prev" | "next") => void;
  /** Returns true if the date is fully restricted (no navigation allowed) */
  isDateRestricted?: (date: DateISO) => boolean;
  /** Returns true if the date is future (meetings only, navigation blocked) */
  isDateMeetingsOnly?: (date: DateISO) => boolean;
  meetingsByDate?: Record<DateISO, MeetingEntry[]>;
}

interface DayCell {
  date: DateISO;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
}

function generateCalendarGrid(ym: YM, selectedDate: DateISO): DayCell[] {
  const [year, month] = ym.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);

  // Find Sunday before first day
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());

  // Generate 42 days (6 weeks)
  const cells: DayCell[] = [];
  const today = getTodayDate();

  for (let i = 0; i < 42; i++) {
    const current = new Date(startDate);
    current.setDate(startDate.getDate() + i);

    // Format date manually to avoid timezone issues with toISOString()
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const dateISO = `${y}-${m}-${d}` as DateISO;

    cells.push({
      date: dateISO,
      dayOfMonth: current.getDate(),
      isCurrentMonth: current.getMonth() === month - 1,
      isToday: dateISO === today,
      isSelected: dateISO === selectedDate,
    });
  }

  return cells;
}

function formatMonthYear(ym: YM): string {
  const [year, month] = ym.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function withHexAlpha(color: string, alphaHex: string): string {
  const normalizedAlpha = /^[0-9a-fA-F]{2}$/.test(alphaHex) ? alphaHex : "10";
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

export default function CalendarGrid({
  currentMonth,
  selectedDate,
  onDayClick,
  onMonthChange,
  isDateRestricted,
  isDateMeetingsOnly,
  meetingsByDate,
}: CalendarGridProps) {
  const cells = generateCalendarGrid(currentMonth, selectedDate);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [hoverCard, setHoverCard] = useState<{
    date: DateISO;
    meetings: MeetingEntry[];
    x: number;
    y: number;
  } | null>(null);

  return (
    <div style={{ width: "100%" }}>
      {/* Month Header with Navigation */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 18,
          padding: "0 4px",
        }}
      >
        <button
          onClick={() => onMonthChange("prev")}
          style={{
            padding: "8px 12px",
            fontSize: 20,
            backgroundColor: "white",
            border: "2px solid #eee",
            borderRadius: 12,
            cursor: "pointer",
            fontWeight: 900,
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
          title="Previous month"
        >
          ‹
        </button>

        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#333" }}>
          {formatMonthYear(currentMonth)}
        </h3>

        <button
          onClick={() => onMonthChange("next")}
          style={{
            padding: "8px 12px",
            fontSize: 20,
            backgroundColor: "white",
            border: "2px solid #eee",
            borderRadius: 12,
            cursor: "pointer",
            fontWeight: 900,
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
          title="Next month"
        >
          ›
        </button>
      </div>

      {/* Weekday Labels */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
          marginBottom: 8,
        }}
      >
        {weekdays.map((day) => (
          <div
            key={day}
            style={{
              textAlign: "center",
              fontSize: 12,
              fontWeight: 900,
              color: "#666",
              padding: "10px 0",
              letterSpacing: 0.5,
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div
        ref={gridRef}
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 6,
        }}
      >
        {cells.map((cell) => {
          const isRestricted = isDateRestricted?.(cell.date) ?? false;
          const isMeetingsOnly = isDateMeetingsOnly?.(cell.date) ?? false;
          const highlightBg = withHexAlpha(APP_MAIN_COLOR, "12");
          const meetings = meetingsByDate?.[cell.date] ?? [];
          const meetingCount = meetings.length;

          const baseStyle: React.CSSProperties = {
            position: "relative",
            height: 58,
            textAlign: "center",
            cursor: isRestricted ? "not-allowed" : "pointer",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: cell.isCurrentMonth ? 900 : 700,
            color: isRestricted
              ? "#bbb"
              : cell.isCurrentMonth
              ? "#222"
              : "#999",
            opacity: isRestricted ? 0.5 : 1,
            backgroundColor: cell.isSelected ? highlightBg : "rgba(255,255,255,0.92)",
            border: cell.isSelected
              ? `2px solid ${APP_MAIN_COLOR}`
              : cell.isToday
              ? `2px solid ${APP_MAIN_COLOR}`
              : "1px solid #e6e6e6",
            boxShadow: cell.isSelected
              ? `0 10px 22px ${withHexAlpha(APP_MAIN_COLOR, "1a")}`
              : "0 1px 0 rgba(0,0,0,0.04)",
            transform: "translateY(0px)",
            transition: "transform 120ms ease, background-color 120ms ease, box-shadow 120ms ease, border-color 120ms ease",
          };

          const hoverStyle: React.CSSProperties = isRestricted
            ? {}
            : {
                backgroundColor: cell.isSelected ? withHexAlpha(APP_MAIN_COLOR, "18") : "rgba(0,0,0,0.03)",
                transform: "translateY(-1px)",
                boxShadow: "0 8px 18px rgba(0,0,0,0.12)",
              };

          const titleText = isRestricted
            ? `${cell.date} (restricted)`
            : isMeetingsOnly
            ? `${cell.date} (meetings only)`
            : cell.date;

          return (
            <div
              key={cell.date}
              onClick={(e) => onDayClick(cell.date, e)}
              style={baseStyle}
              onMouseEnter={(e) => {
                if (!isRestricted) {
                  Object.assign(e.currentTarget.style, hoverStyle);
                }
                if (meetingCount > 0 && gridRef.current) {
                  const gridRect = gridRef.current.getBoundingClientRect();
                  const cellRect = e.currentTarget.getBoundingClientRect();
                  setHoverCard({
                    date: cell.date,
                    meetings,
                    x: cellRect.left - gridRect.left + cellRect.width / 2,
                    y: cellRect.top - gridRect.top + cellRect.height + 8,
                  });
                }
              }}
              onMouseLeave={(e) => {
                Object.assign(e.currentTarget.style, baseStyle);
                setHoverCard(null);
              }}
              title={titleText}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                {cell.dayOfMonth}
              </div>
              {meetingCount > 0 ? (
                <div
                  style={{
                    position: "absolute",
                    right: 6,
                    bottom: 6,
                    minWidth: 18,
                    height: 18,
                    padding: "0 6px",
                    borderRadius: 999,
                    backgroundColor: "#ef4444",
                    color: "white",
                    fontSize: 10,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 4px 10px rgba(0,0,0,0.18)",
                  }}
                >
                  {meetingCount}
                </div>
              ) : null}
            </div>
          );
        })}

        {hoverCard ? (
          <div
            style={{
              position: "absolute",
              left: hoverCard.x,
              top: hoverCard.y,
              transform: "translateX(-50%)",
              width: 240,
              backgroundColor: "white",
              border: "1px solid #e4e4e7",
              borderRadius: 12,
              padding: "10px 12px",
              boxShadow: "0 12px 28px rgba(15, 23, 42, 0.2)",
              zIndex: 10,
              pointerEvents: "none",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 900, color: "#111", marginBottom: 6 }}>
              {formatDateDisplay(hoverCard.date)}
            </div>
            <div style={{ display: "grid", gap: 6, maxHeight: 180, overflowY: "auto" }}>
              {hoverCard.meetings.map((meeting) => (
                <div key={meeting.id} style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: "#4b5563" }}>{meeting.time}</div>
                  <div style={{ fontSize: 12, color: "#111", fontWeight: 600 }}>{meeting.title}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
