import { useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { DateNavigationProvider, useDateNavigation } from "./contexts/DateNavigationContext";
import { getCurrentYM } from "./app/storage";
import { APP_MAIN_COLOR } from "./app/theme";
import GrandPlanPage from "./pages/GrandPlanPage";
import MonthSetupPage from "./pages/MonthSetupPage";
import DailyAgendaPage from "./pages/DailyAgendaPage";
import DatePickerButton from "./components/DatePickerButton";
import DatePickerModal from "./components/DatePickerModal";

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

function Header() {
  const { selectedDate, selectedMonth, setSelectedDate } = useDateNavigation();
  const [showDatePicker, setShowDatePicker] = useState(false);

  const navLinkStyle = (isActive: boolean) => ({
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 900,
    textDecoration: "none",
    borderRadius: 999,
    backgroundColor: isActive ? withHexAlpha(APP_MAIN_COLOR, "12") : "white",
    color: "#333",
    border: isActive ? `2px solid ${APP_MAIN_COLOR}` : "1px solid #ddd",
    boxShadow: isActive ? `0 8px 18px ${withHexAlpha(APP_MAIN_COLOR, "26")}` : "0 2px 8px rgba(0,0,0,0.06)",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    transition: "background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease",
  }) as const;

  return (
    <>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          paddingBottom: 12,
          marginBottom: 12,
          borderBottom: "1px solid #eee",
        }}
      >
        <DatePickerButton
          currentDate={selectedDate}
          onClick={() => setShowDatePicker(true)}
        />
        <nav style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <NavLink to="/grand-plan" style={({ isActive }) => navLinkStyle(isActive)}>
            Grand Plan
          </NavLink>
          <NavLink to={`/month/${selectedMonth}/setup`} style={({ isActive }) => navLinkStyle(isActive)}>
            Month Setup
          </NavLink>
          <NavLink to={`/day/${selectedDate}`} style={({ isActive }) => navLinkStyle(isActive)}>
            Daily
          </NavLink>
        </nav>
      </header>

      {showDatePicker && (
        <DatePickerModal
          currentDate={selectedDate}
          onSelectDate={setSelectedDate}
          onClose={() => setShowDatePicker(false)}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <DateNavigationProvider>
      <div
        style={{
          fontFamily: "system-ui, sans-serif",
          width: "100%",
          maxWidth: 1280,
          margin: "0 auto",
          padding: "16px 32px",
          boxSizing: "border-box",
        }}
      >
        <Header />
        <div style={{ height: 12 }} />

        <Routes>
          <Route path="/" element={<Navigate to={`/month/${getCurrentYM()}/setup`} replace />} />
          <Route path="/grand-plan" element={<GrandPlanPage />} />
          <Route path="/month/:ym/setup" element={<MonthSetupPage />} />
          <Route path="/day/:date" element={<DailyAgendaPage />} />
          <Route path="*" element={<div>Not found.</div>} />
        </Routes>
      </div>
    </DateNavigationProvider>
  );
}
