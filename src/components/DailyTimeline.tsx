import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DateISO, MeetingEntry, ProductivitySession } from "../app/types";
import { APP_MAIN_COLOR } from "../app/theme";
import { getVirtualNow } from "../contexts/VirtualClockContext";

type ScheduledFocusTemplate = {
  id: string;
  title: string;
  plannedStart: string; // "HH:MM"
  plannedEnd: string; // "HH:MM"
  color: string;
};

type DailyTimelineProps = {
  date: DateISO;
  meetings: MeetingEntry[];
  scheduledTemplates: ScheduledFocusTemplate[];
  sessions: ProductivitySession[];
  matchHeightPx?: number;
};

const HOUR_HEIGHT = 56 * 2.5;
const LABEL_WIDTH = 56;
const TOTAL_MINUTES = 24 * 60;
const ACTIVE_SESSION_GOLD = "#ffecb3";
const FOCUS_LABEL_GOLD = "#b8860b";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseTimeToMinutes(time: string): number | null {
  const parts = time.split(":").map((x) => Number(x));
  if (parts.length !== 2) return null;
  const [hours, minutes] = parts;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23) return null;
  if (minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function parseTimeRangeToMinutes(input: string): { start: number; end: number } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.includes("-")) {
    const [a, b] = trimmed.split("-").map((x) => x.trim());
    const start = parseTimeToMinutes(a);
    const end = parseTimeToMinutes(b);
    if (start == null || end == null) return null;
    if (end <= start) return null;
    return { start, end };
  }

  const start = parseTimeToMinutes(trimmed);
  if (start == null) return null;
  const end = Math.min(TOTAL_MINUTES, start + 60);
  return { start, end };
}

function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return 0;
  return Math.max(0, Math.min(TOTAL_MINUTES, minutes));
}

function minutesToY(minutes: number): number {
  return (minutes / 60) * HOUR_HEIGHT;
}

function minutesFromIso(iso: string | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 + d.getMilliseconds() / 60000;
}

function colorWithAlpha(color: string, alpha: number): string {
  const trimmed = color.trim();
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(trimmed);
  if (!match) return `rgba(0,0,0,${alpha})`;

  let hex = match[1];
  if (hex.length === 3) hex = hex.split("").map((c) => `${c}${c}`).join("");
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function DailyTimeline({
  date,
  meetings,
  scheduledTemplates,
  sessions,
  matchHeightPx,
}: DailyTimelineProps) {
  const [now, setNow] = useState(() => getVirtualNow());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const [chromeHeightPx, setChromeHeightPx] = useState<number | null>(null);
  const [didAutoScrollToNow, setDidAutoScrollToNow] = useState(false);

  // Update "now" every second using virtual time
  useEffect(() => {
    const id = window.setInterval(() => setNow(getVirtualNow()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setDidAutoScrollToNow(false);
  }, [date]);

  const isToday = date === (now.toISOString().slice(0, 10) as DateISO);
  const currentMinutes =
    now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + now.getMilliseconds() / 60000;

  const meetingBlocks = useMemo(() => {
    return meetings
      .map((m) => {
        const range = parseTimeRangeToMinutes(m.time);
        if (!range) return null;
        return {
          id: m.id,
          title: m.title,
          start: range.start,
          end: range.end,
          attended: !!m.attended,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [meetings]);

  const templateBlocks = useMemo(() => {
    return scheduledTemplates
      .map((t) => {
        const start = parseTimeToMinutes(t.plannedStart);
        const end = parseTimeToMinutes(t.plannedEnd);
        if (start == null || end == null || end <= start) return null;
        return { ...t, start, end };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [scheduledTemplates]);

  const sessionBlocks = useMemo(() => {
    return sessions
      .filter((s) => s.date === date && s.startedAt)
      .map((s) => {
        const start = minutesFromIso(s.startedAt);
        if (start == null) return null;
        const endRaw = s.endedAt ? minutesFromIso(s.endedAt) : isToday ? currentMinutes : null;
        const end = endRaw == null ? start : endRaw;
        const safeStart = clampMinutes(start);
        const safeEnd = clampMinutes(Math.max(end, safeStart));
        return {
          id: s.id,
          templateId: s.templateId,
          start: safeStart,
          end: safeEnd,
          active: !s.endedAt,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [sessions, date, isToday, currentMinutes]);

  const templateColorById = useMemo(() => {
    return new Map(scheduledTemplates.map((t) => [t.id, t.color] as const));
  }, [scheduledTemplates]);

  const focusLabelColor = FOCUS_LABEL_GOLD;

  const timelineGridHeightPx = HOUR_HEIGHT * 24;

  useLayoutEffect(() => {
    const container = containerRef.current;
    const viewport = scrollViewportRef.current;
    if (!container || !viewport) return;

    const update = () => {
      const containerH = container.getBoundingClientRect().height;
      const viewportH = viewport.getBoundingClientRect().height;
      const delta = containerH - viewportH;
      if (!Number.isFinite(delta)) return;
      setChromeHeightPx(Math.max(0, Math.round(delta)));
    };

    update();

    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => update());
    ro.observe(container);
    ro.observe(viewport);
    return () => ro.disconnect();
  }, []);

  const desiredViewportHeightPx = useMemo(() => {
    if (typeof matchHeightPx !== "number" || !Number.isFinite(matchHeightPx)) return undefined;
    const chrome = chromeHeightPx ?? 120;
    const available = Math.max(0, matchHeightPx - chrome);
    return Math.min(available, timelineGridHeightPx);
  }, [matchHeightPx, chromeHeightPx, timelineGridHeightPx]);

  useLayoutEffect(() => {
    if (!isToday || didAutoScrollToNow) return;
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    const y = minutesToY(clampMinutes(currentMinutes));
    const target = y - viewport.clientHeight * 0.35;
    const nextScrollTop = Math.max(0, Math.min(viewport.scrollHeight - viewport.clientHeight, target));
    viewport.scrollTop = nextScrollTop;
    setDidAutoScrollToNow(true);
  }, [isToday, didAutoScrollToNow, currentMinutes, desiredViewportHeightPx]);

  return (
    <div
      ref={containerRef}
      style={{
        border: "2px solid #eee",
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.92)",
        overflow: "hidden",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ padding: "12px 14px", borderBottom: "1px solid #eee" }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: "#333" }}>Timeline</div>
        <div style={{ fontSize: 12, color: "#777", marginTop: 2 }}>
          Meetings · Focus
        </div>
      </div>

      <div style={{ padding: 12 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginBottom: 8,
            paddingLeft: LABEL_WIDTH + 8,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, color: APP_MAIN_COLOR, textAlign: "center" }}>MEETINGS</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: focusLabelColor, textAlign: "center" }}>FOCUS</div>
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 10, overflow: "hidden" }}>
          <div
            ref={scrollViewportRef}
            style={{
              height: typeof desiredViewportHeightPx === "number" ? desiredViewportHeightPx : undefined,
              maxHeight:
                typeof desiredViewportHeightPx === "number" ? desiredViewportHeightPx : "calc(100vh - 280px)",
              minHeight: typeof desiredViewportHeightPx === "number" ? 0 : 520,
              overflowY: "auto",
            }}
          >
            <div
              style={{
                position: "relative",
                height: HOUR_HEIGHT * 24,
                backgroundColor: "#fbfaf7",
              }}
            >
              {/* Hour grid */}
              {Array.from({ length: 25 }).map((_, h) => (
                <div
                  key={h}
                  style={{
                    position: "absolute",
                    top: minutesToY(h * 60),
                    left: 0,
                    right: 0,
                    borderTop: h === 0 ? "none" : "1px solid rgba(0,0,0,0.06)",
                  }}
                >
                  {h < 24 && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: -7,
                        width: LABEL_WIDTH - 8,
                        textAlign: "right",
                        fontSize: 11,
                        color: "#999",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {pad2(h)}:00
                    </div>
                  )}
                </div>
              ))}

              {/* Current time line */}
              {isToday && (
                <div
                  style={{
                    position: "absolute",
                    top: minutesToY(clampMinutes(currentMinutes)),
                    left: 0,
                    right: 0,
                    zIndex: 5,
                    pointerEvents: "none",
                  }}
                >
                  <div style={{ borderTop: "2px solid #e53935" }} />
                </div>
              )}

              {/* Lanes */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: LABEL_WIDTH + 8,
                  right: 8,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                {/* Meetings lane */}
                <div style={{ position: "relative" }}>
                  {meetingBlocks.map((m) => {
                    const top = minutesToY(m.start);
                    const height = Math.max(18, minutesToY(m.end) - minutesToY(m.start));
                    const mainColor = m.attended ? "#4caf50" : APP_MAIN_COLOR;
                    return (
                      <div
                        key={m.id}
                        style={{
                          position: "absolute",
                          top,
                          left: 0,
                          right: 0,
                          height,
                          backgroundColor: m.attended ? "rgba(76,175,80,0.18)" : colorWithAlpha(APP_MAIN_COLOR, 0.14),
                          border: `1px solid ${mainColor}`,
                          borderRadius: 8,
                          padding: "6px 8px",
                          boxSizing: "border-box",
                          overflow: "hidden",
                        }}
                        title={`${m.title} (${pad2(Math.floor(m.start / 60))}:${pad2(m.start % 60)}-${pad2(
                          Math.floor(m.end / 60)
                        )}:${pad2(m.end % 60)})`}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: m.attended ? "#2e7d32" : APP_MAIN_COLOR,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {m.attended ? "✓ " : ""}{m.title}
                        </div>
                        {height >= 28 && (
                          <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace" }}>
                            {pad2(Math.floor(m.start / 60))}:{pad2(m.start % 60)}-{pad2(Math.floor(m.end / 60))}:{pad2(m.end % 60)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Focus lane */}
                <div style={{ position: "relative" }}>
                  {templateBlocks.map((t) => {
                    const top = minutesToY(t.start);
                    const height = Math.max(18, minutesToY(t.end) - minutesToY(t.start));
                    return (
                      <div
                        key={t.id}
                        style={{
                          position: "absolute",
                          top,
                          left: 0,
                          right: 0,
                          height,
                          backgroundColor: `${t.color}22`,
                          border: `1px solid ${t.color}`,
                          borderRadius: 8,
                          padding: "6px 8px",
                          boxSizing: "border-box",
                          overflow: "hidden",
                        }}
                        title={`${t.title} (${t.plannedStart}-${t.plannedEnd})`}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: t.color,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {t.title}
                        </div>
                        {height >= 28 && (
                          <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace" }}>
                            {t.plannedStart}-{t.plannedEnd}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {sessionBlocks.map((s) => {
                    const top = minutesToY(s.start);
                    const height = Math.max(2, minutesToY(s.end) - minutesToY(s.start));
                    const showLabel = height >= 14;
                    const sessionColor = templateColorById.get(s.templateId) ?? APP_MAIN_COLOR;
                    const backgroundColor = ACTIVE_SESSION_GOLD;
                    return (
                      <div
                        key={s.id}
                        style={{
                          position: "absolute",
                          top,
                          left: 6,
                          right: 6,
                          height,
                          backgroundColor,
                          border: `${s.active ? 2 : 1}px solid ${sessionColor}`,
                          borderLeft: s.active ? `6px solid ${sessionColor}` : undefined,
                          borderRadius: 8,
                          padding: showLabel ? "4px 6px" : 0,
                          boxSizing: "border-box",
                          overflow: "hidden",
                          zIndex: 3,
                          boxShadow: s.active ? "0 12px 26px rgba(0,0,0,0.12)" : "none",
                        }}
                        title={s.active ? "Active focus session" : "Completed focus session"}
                      >
                        {showLabel ? (
                          <div style={{ fontSize: 10, fontWeight: 900, color: sessionColor }}>
                            {s.active ? "▶ Active" : "✓ Actual"}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
