import { useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { DateNavigationProvider, useDateNavigation } from "./contexts/DateNavigationContext";
import { getCurrentYM } from "./app/storage";
import MonthSetupPage from "./pages/MonthSetupPage";
import DailyAgendaPage from "./pages/DailyAgendaPage";
import MonthlyReportPage from "./pages/MonthlyReportPage";
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
          <Link to={`/month/${selectedMonth}/setup`}>Month Setup</Link>
          <Link to={`/day/${selectedDate}`}>Daily</Link>
          <Link to={`/month/${selectedMonth}/report`}>Report</Link>
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
      <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "0 auto", padding: 16 }}>
        <Header />
        <hr style={{ margin: "16px 0" }} />

        <Routes>
          <Route path="/" element={<Navigate to={`/month/${getCurrentYM()}/setup`} replace />} />
          <Route path="/month/:ym/setup" element={<MonthSetupPage />} />
          <Route path="/day/:date" element={<DailyAgendaPage />} />
          <Route path="/month/:ym/report" element={<MonthlyReportPage />} />
          <Route path="*" element={<div>Not found.</div>} />
        </Routes>
      </div>
    </DateNavigationProvider>
  );
}
