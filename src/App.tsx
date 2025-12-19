import { Link, Navigate, Route, Routes } from "react-router-dom";
import MonthSetupPage from "./pages/MonthSetupPage";
import DailyAgendaPage from "./pages/DailyAgendaPage";
import MonthlyReportPage from "./pages/MonthlyReportPage";

export default function App() {
  const demoYM = "2025-12";
  const demoDate = "2025-12-17";

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ margin: 0 }}>FocusTree (v0)</h1>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link to={`/month/${demoYM}/setup`}>Month Setup</Link>
          <Link to={`/day/${demoDate}`}>Daily</Link>
          <Link to={`/month/${demoYM}/report`}>Report</Link>
        </nav>
      </header>

      <hr style={{ margin: "16px 0" }} />

      <Routes>
        <Route path="/" element={<Navigate to={`/month/${demoYM}/setup`} replace />} />
        <Route path="/month/:ym/setup" element={<MonthSetupPage />} />
        <Route path="/day/:date" element={<DailyAgendaPage />} />
        <Route path="/month/:ym/report" element={<MonthlyReportPage />} />
        <Route path="*" element={<div>Not found.</div>} />
      </Routes>
    </div>
  );
}
