import { useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { DateNavigationProvider, useDateNavigation } from "./contexts/DateNavigationContext";
import { getCurrentYM } from "./app/storage";
import GrandPlanPage from "./pages/GrandPlanPage";
import MonthSetupPage from "./pages/MonthSetupPage";
import DailyAgendaPage from "./pages/DailyAgendaPage";
import DatePickerButton from "./components/DatePickerButton";
import DatePickerModal from "./components/DatePickerModal";

function Header() {
  const { selectedDate, selectedMonth, setSelectedDate } = useDateNavigation();
  const [showDatePicker, setShowDatePicker] = useState(false);

  return (
    <>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <DatePickerButton
          currentDate={selectedDate}
          onClick={() => setShowDatePicker(true)}
        />
        <nav style={{ display: "flex", gap: 12 }}>
          <Link to="/grand-plan">Grand Plan</Link>
          <Link to={`/month/${selectedMonth}/setup`}>Month Setup</Link>
          <Link to={`/day/${selectedDate}`}>Daily</Link>
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
      <div style={{ fontFamily: "system-ui, sans-serif", width: "100%", margin: 0, padding: 16, boxSizing: "border-box" }}>
        <Header />
        <hr style={{ margin: "16px 0" }} />

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
