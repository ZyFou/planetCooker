const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

export function formatRelativeTime(value) {
  try {
    const target = typeof value === "number" ? value : new Date(value).getTime();
    if (Number.isNaN(target)) return "";
    const now = Date.now();
    const diff = Math.max(0, now - target);

    if (diff < MINUTE) return "Just now";
    if (diff < HOUR) {
      const mins = Math.round(diff / MINUTE);
      return `${mins} min${mins === 1 ? "" : "s"} ago`;
    }
    if (diff < DAY) {
      const hours = Math.round(diff / HOUR);
      return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    }
    if (diff < WEEK) {
      const days = Math.round(diff / DAY);
      return `${days} day${days === 1 ? "" : "s"} ago`;
    }
    if (diff < MONTH) {
      const weeks = Math.round(diff / WEEK);
      return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
    }
    const months = Math.round(diff / MONTH);
    return `${months} month${months === 1 ? "" : "s"} ago`;
  } catch {
    return "";
  }
}
