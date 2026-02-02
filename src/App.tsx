import { useState } from "react";
import { NavLink, Navigate, Route, Routes, useParams } from "react-router-dom";
import { DateNavigationProvider, useDateNavigation } from "./contexts/DateNavigationContext";
import { useAppMode } from "./contexts/AppModeContext";
import { getTodayDate, loadState } from "./app/storage";
import { APP_MAIN_COLOR } from "./app/theme";
import GrandPlanPage from "./pages/GrandPlanPage";
import MonthSetupPage from "./pages/MonthSetupPage";
import DailyAgendaPage from "./pages/DailyAgendaPage";
import GetStartedPage from "./pages/GetStartedPage";
import DatePickerButton from "./components/DatePickerButton";
import DatePickerModal from "./components/DatePickerModal";
import VirtualClockToolbox from "./components/VirtualClockToolbox";
import GrandPlanTutorialWrapper from "./components/GrandPlanTutorialWrapper";
import MonthSetupTutorialWrapper from "./components/MonthSetupTutorialWrapper";
import DailyAgendaTutorialWrapper from "./components/DailyAgendaTutorialWrapper";
import onionGraphic from "./assets/onion.svg";

function MonthSetupRoute() {
  const { date } = useParams();
  return <MonthSetupPage key={date?.slice(0, 7) ?? "month"} />;
}

function DailyAgendaRoute() {
  const { date } = useParams();
  return <DailyAgendaPage key={date ?? "day"} />;
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

function Header() {
  const { selectedDate, setSelectedDate } = useDateNavigation();
  const { isDeveloper } = useAppMode();
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
      {/* Virtual Clock Toolbox (only in developer mode) */}
      {isDeveloper && <VirtualClockToolbox />}

      {/* Spacer for macOS window controls */}
      <div style={{ height: 36 }} />

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
          position: "relative",
        }}
      >
        <DatePickerButton
          currentDate={selectedDate}
          onClick={() => setShowDatePicker(true)}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <img
            src={onionGraphic}
            alt="OnionOps"
            style={{ width: 42, height: 42, objectFit: "contain" }}
          />
        </div>
        <nav style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <NavLink to="/grand-plan" style={({ isActive }) => navLinkStyle(isActive)}>
            Grand Plan
          </NavLink>
          <NavLink to={`/month/${selectedDate}/setup`} style={({ isActive }) => navLinkStyle(isActive)}>
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

function RootRedirect() {
  const state = loadState();
  const hasData =
    state.grandPlan ||
    Object.keys(state.months).length > 0 ||
    Object.keys(state.days).length > 0;
  return <Navigate to={hasData ? `/month/${getTodayDate()}/setup` : "/get-started"} replace />;
}

export default function App() {
  return (
    <DateNavigationProvider>
      <Routes>
        <Route path="/get-started" element={<GetStartedPage />} />
        <Route path="/grand-plan/tutorial" element={<GrandPlanTutorialWrapper />} />
        <Route path="/month-setup/tutorial" element={<MonthSetupTutorialWrapper />} />
        <Route path="/daily-agenda/tutorial" element={<DailyAgendaTutorialWrapper />} />
        <Route
          path="*"
          element={
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
                <Route path="/" element={<RootRedirect />} />
                <Route path="/grand-plan" element={<GrandPlanPage />} />
                <Route path="/month/:date/setup" element={<MonthSetupRoute />} />
                <Route path="/day/:date" element={<DailyAgendaRoute />} />
                <Route path="*" element={<div>Not found.</div>} />
              </Routes>
            </div>
          }
        />
      </Routes>
    </DateNavigationProvider>
  );
}
