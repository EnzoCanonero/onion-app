import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

const STORAGE_KEY = "focustree.developerMode";

interface AppModeContextValue {
  isDeveloper: boolean;
  toggleDeveloperMode: () => void;
}

const AppModeContext = createContext<AppModeContextValue | null>(null);

// Extend window for global dev mode functions
declare global {
  interface Window {
    __enableDevMode: () => void;
    __disableDevMode: () => void;
  }
}

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [isDeveloper, setIsDeveloper] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === "true";
  });

  const toggleDeveloperMode = () => {
    const newValue = !isDeveloper;
    if (newValue) {
      localStorage.setItem(STORAGE_KEY, "true");
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    setIsDeveloper(newValue);
  };

  // Expose global functions for console access
  useEffect(() => {
    window.__enableDevMode = () => {
      localStorage.setItem(STORAGE_KEY, "true");
      setIsDeveloper(true);
      console.log("Developer mode enabled. Refresh the page to apply all changes.");
    };

    window.__disableDevMode = () => {
      localStorage.removeItem(STORAGE_KEY);
      setIsDeveloper(false);
      console.log("Developer mode disabled. Refresh the page to apply all changes.");
    };

    return () => {
      // Cleanup is optional since these are meant to persist
    };
  }, []);

  const value: AppModeContextValue = {
    isDeveloper,
    toggleDeveloperMode,
  };

  return (
    <AppModeContext.Provider value={value}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode(): AppModeContextValue {
  const context = useContext(AppModeContext);
  if (!context) {
    throw new Error("useAppMode must be used within AppModeProvider");
  }
  return context;
}
