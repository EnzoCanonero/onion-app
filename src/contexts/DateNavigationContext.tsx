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

  // Extract initial date from URL params (for deep linking)
  const initialDate = useMemo(() => {
    if (location.pathname === "/") return getTodayDate();

    const match = location.pathname.match(/\/(day|month)\/([^/]+)/);
    if (match) {
      const kind = match[1];
      const param = match[2];

      if (kind === "day" && param.length === 10 && isValidDateISO(param)) {
        return param as DateISO;
      }

      if (kind === "month") {
        if (param.length === 10 && isValidDateISO(param)) {
          return param as DateISO;
        }
        if (param.length === 7) {
          const today = getTodayDate();
          if (today.slice(0, 7) === param) {
            return today;
          }
          return `${param}-01` as DateISO;
        }
      }
    }

    return getTodayDate();
  }, []); // Only run on mount

  // Context state is now the primary source of truth
  const [selectedDate, setSelectedDateState] = useState<DateISO>(initialDate);
  const [selectedMonth, setSelectedMonthState] = useState<YM>(ymFromDate(initialDate));

  // Update URL to match context state (for deep linking / bookmarking)
  useEffect(() => {
    const currentPath = location.pathname;

    if (currentPath.startsWith('/day/')) {
      // On daily page, keep URL in sync with selected date
      const expectedPath = `/day/${selectedDate}`;
      if (currentPath !== expectedPath) {
        navigate(expectedPath, { replace: true });
      }
    } else if (currentPath.includes('/month/')) {
      // On month page, keep URL in sync with selected date (YYYY-MM-DD)
      const pageType = currentPath.endsWith('/setup') ? 'setup' : 'report';
      const expectedPath = `/month/${selectedDate}/${pageType}`;
      if (currentPath !== expectedPath) {
        navigate(expectedPath, { replace: true });
      }
    }
  }, [selectedDate, selectedMonth, location.pathname, navigate]);

  const setSelectedDate = (date: DateISO) => {
    if (!isValidDateISO(date)) {
      console.warn("Invalid date:", date);
      return;
    }
    setSelectedDateState(date);

    // Update selected month to match the new date
    const newMonth = date.slice(0, 7) as YM;
    setSelectedMonthState(newMonth);

    // NO NAVIGATION - just state update
  };

  const goToToday = () => {
    const today = getTodayDate();
    setSelectedDate(today);  // Now just updates state
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
