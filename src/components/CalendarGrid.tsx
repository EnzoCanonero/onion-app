import type { DateISO, YM } from "../app/types";
import { getTodayDate } from "../app/storage";

interface CalendarGridProps {
  currentMonth: YM;
  selectedDate: DateISO;
  onDayClick: (date: DateISO, event: React.MouseEvent) => void;
  onMonthChange: (direction: "prev" | "next") => void;
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

export default function CalendarGrid({
  currentMonth,
  selectedDate,
  onDayClick,
  onMonthChange,
}: CalendarGridProps) {
  const cells = generateCalendarGrid(currentMonth, selectedDate);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div style={{ width: "100%" }}>
      {/* Month Header with Navigation */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          padding: "0 8px",
        }}
      >
        <button
          onClick={() => onMonthChange("prev")}
          style={{
            padding: "8px 12px",
            fontSize: 18,
            backgroundColor: "white",
            border: "1px solid #ddd",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          ‹
        </button>

        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
          {formatMonthYear(currentMonth)}
        </h3>

        <button
          onClick={() => onMonthChange("next")}
          style={{
            padding: "8px 12px",
            fontSize: 18,
            backgroundColor: "white",
            border: "1px solid #ddd",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 600,
          }}
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
              fontWeight: 600,
              color: "#666",
              padding: "8px 0",
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
        }}
      >
        {cells.map((cell) => {
          const baseStyle: React.CSSProperties = {
            padding: "10px",
            textAlign: "center",
            cursor: "pointer",
            borderRadius: 6,
            fontSize: 14,
            fontWeight: cell.isCurrentMonth ? 500 : 400,
            color: cell.isCurrentMonth ? "#000" : "#999",
            backgroundColor: cell.isSelected ? "#e3f2fd" : "white",
            border: cell.isToday ? "2px solid #2196f3" : "1px solid #e0e0e0",
            transition: "background-color 0.2s",
          };

          const hoverStyle: React.CSSProperties = {
            backgroundColor: cell.isSelected ? "#e3f2fd" : "#f5f5f5",
          };

          return (
            <div
              key={cell.date}
              onClick={(e) => onDayClick(cell.date, e)}
              style={baseStyle}
              onMouseEnter={(e) => {
                Object.assign(e.currentTarget.style, hoverStyle);
              }}
              onMouseLeave={(e) => {
                Object.assign(e.currentTarget.style, baseStyle);
              }}
            >
              {cell.dayOfMonth}
            </div>
          );
        })}
      </div>
    </div>
  );
}
