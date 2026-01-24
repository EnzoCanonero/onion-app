import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { DateISO, YM } from "../app/types";

const STORAGE_KEY = "focustree.virtualClock";
const DEV_MODE_KEY = "focustree.developerMode";

interface VirtualClockState {
  enabled: boolean;
  baseTimestamp: number; // Virtual "now" anchor (ms since epoch)
  realAnchor: number; // Real time when base was set (ms since epoch)
  speed: number; // 0 = paused, 1 = normal, 10, 100, 1000
  isRunning: boolean;
}

interface VirtualClockContextValue {
  // State
  state: VirtualClockState;
  // Computed values
  virtualNow: Date;
  virtualTodayDate: DateISO;
  virtualCurrentYM: YM;
  // Actions
  setVirtualTime: (date: Date) => void;
  setSpeed: (speed: number) => void;
  toggleRunning: () => void;
  resetToRealTime: () => void;
  // For real-time updates
  refreshNow: () => void;
}

const VirtualClockContext = createContext<VirtualClockContextValue | null>(null);

// --- Standalone utility functions (can be called from non-React code) ---

function loadVirtualClockState(): VirtualClockState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VirtualClockState;
  } catch {
    return null;
  }
}

function saveVirtualClockState(state: VirtualClockState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

function isDeveloperMode(): boolean {
  return localStorage.getItem(DEV_MODE_KEY) === "true";
}

function calculateVirtualNow(state: VirtualClockState): Date {
  if (!state.enabled || !state.isRunning) {
    // If paused or disabled, return the base timestamp directly
    return new Date(state.baseTimestamp);
  }
  // virtualNow = baseTimestamp + (realNow - realAnchor) * speed
  const realNow = Date.now();
  const elapsed = (realNow - state.realAnchor) * state.speed;
  return new Date(state.baseTimestamp + elapsed);
}

function getDefaultState(): VirtualClockState {
  const now = Date.now();
  return {
    enabled: true,
    baseTimestamp: now,
    realAnchor: now,
    speed: 1,
    isRunning: true,
  };
}

// --- Exported utility functions for non-React code ---

/**
 * Get the current virtual "now" Date.
 * If not in developer mode, returns real time.
 * Can be called from anywhere (React or non-React code).
 */
export function getVirtualNow(): Date {
  if (!isDeveloperMode()) {
    return new Date();
  }
  const state = loadVirtualClockState();
  if (!state || !state.enabled) {
    return new Date();
  }
  return calculateVirtualNow(state);
}

/**
 * Get the virtual "today" date as DateISO.
 * If not in developer mode, returns real today.
 */
export function getVirtualTodayDate(): DateISO {
  const now = getVirtualNow();
  return now.toISOString().slice(0, 10) as DateISO;
}

/**
 * Get the virtual current year-month as YM.
 * If not in developer mode, returns real current month.
 */
export function getVirtualCurrentYM(): YM {
  return getVirtualTodayDate().slice(0, 7) as YM;
}

/**
 * Get the virtual timestamp as ISO string.
 * Use this for storing createdAt, startedAt, etc.
 */
export function getVirtualTimestamp(): string {
  return getVirtualNow().toISOString();
}

// --- React Provider ---

export function VirtualClockProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<VirtualClockState>(() => {
    const saved = loadVirtualClockState();
    if (saved) {
      // If we were running, update the base to account for time passed while page was closed
      if (saved.isRunning && saved.speed > 0) {
        const realNow = Date.now();
        const elapsed = (realNow - saved.realAnchor) * saved.speed;
        return {
          ...saved,
          baseTimestamp: saved.baseTimestamp + elapsed,
          realAnchor: realNow,
        };
      }
      return saved;
    }
    return getDefaultState();
  });

  // Ticker state to force re-renders for real-time display
  const [, setTick] = useState(0);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    saveVirtualClockState(state);
  }, [state]);

  // Tick every second to update virtualNow for display
  useEffect(() => {
    if (!state.isRunning || state.speed === 0) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [state.isRunning, state.speed]);

  const virtualNow = calculateVirtualNow(state);
  const virtualTodayDate = virtualNow.toISOString().slice(0, 10) as DateISO;
  const virtualCurrentYM = virtualTodayDate.slice(0, 7) as YM;

  const setVirtualTime = useCallback((date: Date) => {
    const realNow = Date.now();
    setState((prev) => ({
      ...prev,
      baseTimestamp: date.getTime(),
      realAnchor: realNow,
    }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    setState((prev) => {
      // When changing speed, we need to "checkpoint" the current virtual time
      const currentVirtual = calculateVirtualNow(prev);
      const realNow = Date.now();
      return {
        ...prev,
        baseTimestamp: currentVirtual.getTime(),
        realAnchor: realNow,
        speed,
        isRunning: speed > 0,
      };
    });
  }, []);

  const toggleRunning = useCallback(() => {
    setState((prev) => {
      if (prev.isRunning) {
        // Pausing: checkpoint the current virtual time
        const currentVirtual = calculateVirtualNow(prev);
        return {
          ...prev,
          baseTimestamp: currentVirtual.getTime(),
          isRunning: false,
        };
      } else {
        // Resuming: update real anchor to now
        const realNow = Date.now();
        return {
          ...prev,
          realAnchor: realNow,
          isRunning: true,
        };
      }
    });
  }, []);

  const resetToRealTime = useCallback(() => {
    const realNow = Date.now();
    setState({
      enabled: true,
      baseTimestamp: realNow,
      realAnchor: realNow,
      speed: 1,
      isRunning: true,
    });
  }, []);

  const refreshNow = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  const value: VirtualClockContextValue = {
    state,
    virtualNow,
    virtualTodayDate,
    virtualCurrentYM,
    setVirtualTime,
    setSpeed,
    toggleRunning,
    resetToRealTime,
    refreshNow,
  };

  return (
    <VirtualClockContext.Provider value={value}>
      {children}
    </VirtualClockContext.Provider>
  );
}

export function useVirtualClock(): VirtualClockContextValue {
  const context = useContext(VirtualClockContext);
  if (!context) {
    throw new Error("useVirtualClock must be used within VirtualClockProvider");
  }
  return context;
}

/**
 * Hook that returns the current virtual "now" and updates every second.
 * Use this in components that need real-time updates (like DailyTimeline).
 */
export function useVirtualNow(): Date {
  const { virtualNow, refreshNow, state } = useVirtualClock();

  useEffect(() => {
    if (!state.isRunning || state.speed === 0) return;
    const interval = setInterval(refreshNow, 1000);
    return () => clearInterval(interval);
  }, [state.isRunning, state.speed, refreshNow]);

  return virtualNow;
}
