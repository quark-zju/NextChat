import { EmojiStyle } from "emoji-picker-react";
import { showToast } from "./components/ui-lib";
import { getLang } from "./locales";

export function trimTopic(topic: string) {
  return topic.replace(/[，。！？”“"、,.!?]*$/, "");
}

export async function copyToClipboard(text: string) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(err => {
      console.error('Failed to copy: ', err);
    });
  } else {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      console.log('Text copied to clipboard');
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
    document.body.removeChild(textArea);
  }
}

export function downloadAs(text: string, filename: string) {
  const element = document.createElement("a");
  element.setAttribute(
    "href",
    "data:text/plain;charset=utf-8," + encodeURIComponent(text),
  );
  element.setAttribute("download", filename);

  element.style.display = "none";
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}

export function isIOS() {
  const userAgent = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}

export function isMobileScreen() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.innerWidth <= 600;
}

export function selectOrCopy(el: HTMLElement, content: string) {
  const currentSelection = window.getSelection();

  if (currentSelection?.type === "Range") {
    return false;
  }

  copyToClipboard(content);

  return true;
}

export function queryMeta(key: string, defaultValue?: string): string {
  let ret: string;
  if (document) {
    const meta = document.head.querySelector(
      `meta[name='${key}']`,
    ) as HTMLMetaElement;
    ret = meta?.content ?? "";
  } else {
    ret = defaultValue ?? "";
  }

  return ret;
}

let currentId: string;
export function getCurrentVersion() {
  if (currentId) {
    return currentId;
  }

  currentId = queryMeta("version");

  return currentId;
}

export function getEmojiUrl(unified: string, style: EmojiStyle) {
  return `https://cdn.staticfile.org/emoji-datasource-apple/14.0.0/img/${style}/64/${unified}.png`;
}

type DayPeriod = "morning" | "noon" | "evening";

function getDayPeriod(date: Date): DayPeriod {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "noon";
  return "evening";
}

function getPeriodLabel(period: DayPeriod, isChinese: boolean) {
  if (isChinese) {
    if (period === "morning") return "早上";
    if (period === "noon") return "中午";
    return "晚上";
  }
  if (period === "morning") return "morning";
  if (period === "noon") return "noon";
  return "evening";
}

function getWeekdayLabel(date: Date, isChinese: boolean) {
  if (isChinese) {
    return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
      date.getDay()
    ];
  }
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
}

function getDayDiff(from: Date, to: Date) {
  const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const diff = fromDay.getTime() - toDay.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function formatAbsoluteDate(date: Date, isChinese: boolean) {
  if (isChinese) {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${hh}:${mm}`;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function parseDateLike(input: string | Date) {
  if (input instanceof Date) return input;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatRelativeDateTime(input: string | Date, now = new Date()) {
  const date = parseDateLike(input);
  if (!date) {
    return typeof input === "string" ? input : "";
  }

  const lang = getLang();
  const isChinese = lang === "cn";
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMinutes = Math.floor(diffMs / (60 * 1000));

  if (diffMs <= 2 * 60 * 1000) {
    return isChinese ? "刚刚" : "just now";
  }

  if (diffMs < 60 * 60 * 1000) {
    if (isChinese) {
      return `${Math.max(1, diffMinutes)} 分钟前`;
    }
    const minutes = Math.max(1, diffMinutes);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const period = getPeriodLabel(getDayPeriod(date), isChinese);
  const dayDiff = getDayDiff(now, date);

  if (dayDiff === 0 && diffMs < 24 * 60 * 60 * 1000) {
    return isChinese ? `今天${period}` : `this ${period}`;
  }

  if (dayDiff === 1) {
    return isChinese ? `昨天${period}` : `yesterday ${period}`;
  }

  if (dayDiff === 2) {
    return isChinese ? `前天${period}` : `the day before yesterday ${period}`;
  }

  if (dayDiff > 2 && dayDiff < 7) {
    const weekday = getWeekdayLabel(date, isChinese);
    return isChinese ? `${weekday}${period}` : `${weekday} ${period}`;
  }

  return formatAbsoluteDate(date, isChinese);
}
