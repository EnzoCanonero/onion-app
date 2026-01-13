import { createContext, useContext, useMemo, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { DateISO, YM } from "../app/types";
import { ymFromDate, getTodayDate, isValidDateISO } from "../app/storage";

interface DateNavigationContextValue {
  selectedDate: DateISO;
  selectedMonth: YM;
  setSelectedDate: (date: DateISO) => void;
  goToToday: () => void;
}

const DateNavigationContext = createContext<DateNavigationContextValue | null>(null);

export function DateNavigationProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Maintain selected date in state to persist across route changes
  const [persistedDate, setPersistedDate] = useState<DateISO>(getTodayDate());

  // Extract date from URL params
  const selectedDate = useMemo(() => {
    // Parse /day/:date or /month/:ym routes
    const match = location.pathname.match(/\/(day|month)\/([^/]+)/);
    if (match) {
      const param = match[2];
      // If it's a date (YYYY-MM-DD), use it and update persisted date
      if (param.length === 10 && isValidDateISO(param)) {
        return param as DateISO;
      }
      // If it's a month (YYYY-MM), use the persisted date if it's in the same month
      if (param.length === 7) {
        const persistedMonth = ymFromDate(persistedDate);
        if (persistedMonth === param) {
          return persistedDate;
        }
        // Otherwise use first day of the month and update persisted date
        return `${param}-01` as DateISO;
      }
    }
    // Default to today
    return getTodayDate();
  }, [location.pathname, persistedDate]);

  // Update persisted date when selectedDate changes
  useEffect(() => {
    setPersistedDate(selectedDate);
  }, [selectedDate]);

  const selectedMonth = useMemo(() => ymFromDate(selectedDate), [selectedDate]);

  const setSelectedDate = (date: DateISO) => {
    if (!isValidDateISO(date)) {
      console.warn("Invalid date:", date);
      return;
    }
    navigate(`/day/${date}`);
  };

  const goToToday = () => {
    setSelectedDate(getTodayDate());
  };

  const value = { selectedDate, selectedMonth, setSelectedDate, goToToday };

  return <DateNavigationContext.Provider value={value}>{children}</DateNavigationContext.Provider>;
}

export function useDateNavigation() {
  const context = useContext(DateNavigationContext);
  if (!context) {
    throw new Error("useDateNavigation must be used within DateNavigationProvider");
  }
  return context;
}
