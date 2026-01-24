import type { DateISO, MeetingEntry, MeetingRecurrence, YM } from "./types";

export type MeetingDraft = Omit<MeetingEntry, "id" | "createdAt">;

const LINE_BREAK = /\r\n|\n|\r/g;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function unescapeICSText(text: string): string {
  return text
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function unfoldLines(text: string): string[] {
  const lines = text.split(LINE_BREAK);
  const unfolded: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

function parseRRule(rule: string | undefined): MeetingRecurrence | undefined {
  if (!rule) return undefined;
  const parts = rule.split(";").reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split("=");
    if (key && value) acc[key.toUpperCase()] = value.toUpperCase();
    return acc;
  }, {});
  const freq = parts.FREQ;
  const interval = Number(parts.INTERVAL ?? "1");
  if (freq === "WEEKLY") return interval === 2 ? "BIWEEKLY" : "WEEKLY";
  if (freq === "MONTHLY") return "MONTHLY";
  return undefined;
}

function parseDurationMinutes(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/^P(T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)$/i);
  if (!match) return undefined;
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  return hours * 60 + minutes + Math.round(seconds / 60);
}

function formatICSDate(date: DateISO): string {
  return date.replace(/-/g, "");
}

function formatICSTimestamp(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = pad2(date.getUTCMonth() + 1);
  const dd = pad2(date.getUTCDate());
  const hh = pad2(date.getUTCHours());
  const min = pad2(date.getUTCMinutes());
  const ss = pad2(date.getUTCSeconds());
  return `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;
}

function formatTimeToICS(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return `${pad2(hours)}${pad2(minutes)}`;
}

function parseTimeFromICS(timePart: string): { hours: number; minutes: number; seconds: number } | null {
  const raw = timePart.trim();
  if (!raw) return null;
  const hh = Number(raw.slice(0, 2));
  const mm = Number(raw.slice(2, 4) || "0");
  const ss = Number(raw.slice(4, 6) || "0");
  if ([hh, mm, ss].some((value) => Number.isNaN(value))) return null;
  return { hours: hh, minutes: mm, seconds: ss };
}

function parseICSTimestamp(value: string): { date: DateISO; time?: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const isUtc = trimmed.endsWith("Z");
  const cleaned = isUtc ? trimmed.slice(0, -1) : trimmed;
  if (!cleaned.includes("T")) {
    if (cleaned.length !== 8) return null;
    const date = `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}` as DateISO;
    return { date };
  }
  const [datePart, timePart] = cleaned.split("T");
  if (datePart.length !== 8) return null;
  const timePieces = parseTimeFromICS(timePart);
  if (!timePieces) return null;
  const year = Number(datePart.slice(0, 4));
  const month = Number(datePart.slice(4, 6));
  const day = Number(datePart.slice(6, 8));
  if ([year, month, day].some((value) => Number.isNaN(value))) return null;
  const dateObj = isUtc
    ? new Date(Date.UTC(year, month - 1, day, timePieces.hours, timePieces.minutes, timePieces.seconds))
    : new Date(year, month - 1, day, timePieces.hours, timePieces.minutes, timePieces.seconds);
  const date = `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}` as DateISO;
  const time = `${pad2(dateObj.getHours())}:${pad2(dateObj.getMinutes())}`;
  return { date, time };
}

function addMinutesToTime(time: string, minutesToAdd: number): string | undefined {
  const [hours, minutes] = time.split(":").map(Number);
  if ([hours, minutes].some((value) => Number.isNaN(value))) return undefined;
  const totalMinutes = hours * 60 + minutes + minutesToAdd;
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const nextHours = Math.floor(normalized / 60);
  const nextMinutes = normalized % 60;
  return `${pad2(nextHours)}:${pad2(nextMinutes)}`;
}

export function exportMeetingsToICS(meetings: MeetingEntry[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FocusTree//EN",
    "CALSCALE:GREGORIAN",
  ];

  meetings.forEach((meeting) => {
    const [startRaw, endRaw] = meeting.time.split("-");
    const start = startRaw.trim();
    const end = endRaw?.trim();
    const dtStart = `${formatICSDate(meeting.date)}T${formatTimeToICS(start)}00`;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${meeting.id}`);
    lines.push(`DTSTAMP:${formatICSTimestamp(new Date(meeting.createdAt))}`);
    lines.push(`SUMMARY:${escapeICSText(meeting.title)}`);
    lines.push(`DTSTART:${dtStart}`);
    if (end) {
      const dtEnd = `${formatICSDate(meeting.date)}T${formatTimeToICS(end)}00`;
      lines.push(`DTEND:${dtEnd}`);
    }
    if (meeting.description) {
      lines.push(`DESCRIPTION:${escapeICSText(meeting.description)}`);
    }
    if (meeting.link) {
      lines.push(`URL:${escapeICSText(meeting.link)}`);
    }
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function parseICSMeetings(content: string): MeetingDraft[] {
  const lines = unfoldLines(content);
  const meetings: MeetingDraft[] = [];
  let currentEvent: Record<string, string> | null = null;

  const flushEvent = () => {
    if (!currentEvent) return;
    const rawStart = currentEvent.DTSTART;
    const summary = currentEvent.SUMMARY ? unescapeICSText(currentEvent.SUMMARY) : "Meeting";
    if (!rawStart) {
      currentEvent = null;
      return;
    }
    const parsedStart = parseICSTimestamp(rawStart);
    if (!parsedStart) {
      currentEvent = null;
      return;
    }

    let description = currentEvent.DESCRIPTION ? unescapeICSText(currentEvent.DESCRIPTION) : undefined;
    const link = currentEvent.URL ? unescapeICSText(currentEvent.URL) : undefined;
    const recurrence = parseRRule(currentEvent.RRULE);

    let time = parsedStart.time ?? "09:00";
    if (!parsedStart.time) {
      description = description ? `All-day event\n${description}` : "All-day event";
    }

    const parsedEnd = currentEvent.DTEND ? parseICSTimestamp(currentEvent.DTEND) : null;
    if (parsedEnd && parsedEnd.time && parsedEnd.date === parsedStart.date) {
      time = `${time}-${parsedEnd.time}`;
    } else if (currentEvent.DURATION) {
      const durationMinutes = parseDurationMinutes(currentEvent.DURATION);
      if (durationMinutes && parsedStart.time) {
        const endTime = addMinutesToTime(parsedStart.time, durationMinutes);
        if (endTime) {
          time = `${parsedStart.time}-${endTime}`;
        }
      }
    }

    const ym = parsedStart.date.slice(0, 7) as YM;
    meetings.push({
      date: parsedStart.date,
      ym,
      title: summary,
      time,
      link,
      description: description?.trim() || undefined,
      recurrence,
    });
    currentEvent = null;
  };

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      currentEvent = {};
      continue;
    }
    if (line === "END:VEVENT") {
      flushEvent();
      continue;
    }
    if (!currentEvent) continue;
    const [left, ...rest] = line.split(":");
    if (!left || rest.length === 0) continue;
    const value = rest.join(":").trim();
    const [key] = left.split(";");
    if (!key) continue;
    const upperKey = key.toUpperCase();
    if (!(upperKey in currentEvent)) {
      currentEvent[upperKey] = value;
    }
  }

  flushEvent();
  return meetings;
}
