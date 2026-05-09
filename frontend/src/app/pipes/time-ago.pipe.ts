import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'timeAgo', pure: false, standalone: false })
export class TimeAgoPipe implements PipeTransform {
  transform(value: string | number | Date | null | undefined): string {
    if (!value) return '';
    const date =
      value instanceof Date
        ? value
        : typeof value === 'number'
        ? new Date(value)
        : new Date(value);
    if (isNaN(date.getTime())) return '';

    const now = Date.now();
    const diffMs = now - date.getTime();
    if (diffMs < 0) return 'just now';

    const sec = Math.floor(diffMs / 1000);
    if (sec < 5) return 'just now';
    if (sec < 60) return `${sec}s ago`;

    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;

    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;

    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;

    const week = Math.floor(day / 7);
    if (week < 5) return `${week}w ago`;

    const month = Math.floor(day / 30);
    if (month < 12) return `${month}mo ago`;

    const year = Math.floor(day / 365);
    return `${year}y ago`;
  }
}
