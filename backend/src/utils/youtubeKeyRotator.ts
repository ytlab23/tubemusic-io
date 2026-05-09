import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";

const COOLDOWN_MS = 60 * 60 * 1000;

interface KeyState {
  key: string;
  cooldownUntil: number;
  lastError?: string;
}

export class YouTubeKeyRotator {
  private readonly states: KeyState[];
  private cursor = 0;

  constructor(keys: string[]) {
    const cleaned = keys.map((k) => k.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      throw new Error(
        "YouTubeKeyRotator: no API keys provided. Set YOUTUBE_API_KEYS (comma-separated) or YOUTUBE_API_KEY."
      );
    }
    this.states = cleaned.map((key) => ({ key, cooldownUntil: 0 }));
  }

  static fromEnv(): YouTubeKeyRotator {
    const multi = process.env.YOUTUBE_API_KEYS;
    const single = process.env.YOUTUBE_API_KEY;
    const list = multi
      ? multi.split(",")
      : single
      ? [single]
      : [];
    return new YouTubeKeyRotator(list);
  }

  size(): number {
    return this.states.length;
  }

  async request<T = any>(
    url: string,
    config: AxiosRequestConfig = {}
  ): Promise<AxiosResponse<T>> {
    const total = this.states.length;
    let lastError: unknown = null;
    const triedAll = new Set<number>();

    while (triedAll.size < total) {
      const idx = this.pickAvailable(triedAll);
      if (idx === -1) break;
      triedAll.add(idx);

      const state = this.states[idx];
      const params = { ...(config.params ?? {}), key: state.key };

      try {
        const response = await axios.request<T>({
          ...config,
          url,
          params,
        });
        return response;
      } catch (err) {
        lastError = err;
        const exhausted = this.shouldRotate(err);
        if (exhausted) {
          state.cooldownUntil = Date.now() + COOLDOWN_MS;
          state.lastError = this.errorReason(err);
          console.warn(
            `[YouTubeKeyRotator] key #${idx} cooled down (${state.lastError}); rotating.`
          );
          continue;
        }
        throw err;
      }
    }

    throw lastError ?? new Error("YouTubeKeyRotator: all keys exhausted.");
  }

  private pickAvailable(skip: Set<number>): number {
    const total = this.states.length;
    const now = Date.now();
    for (let i = 0; i < total; i++) {
      const idx = (this.cursor + i) % total;
      if (skip.has(idx)) continue;
      if (this.states[idx].cooldownUntil <= now) {
        this.cursor = (idx + 1) % total;
        return idx;
      }
    }
    let earliest = -1;
    let earliestUntil = Number.POSITIVE_INFINITY;
    for (let i = 0; i < total; i++) {
      if (skip.has(i)) continue;
      if (this.states[i].cooldownUntil < earliestUntil) {
        earliestUntil = this.states[i].cooldownUntil;
        earliest = i;
      }
    }
    if (earliest !== -1) {
      this.cursor = (earliest + 1) % total;
    }
    return earliest;
  }

  private shouldRotate(err: unknown): boolean {
    if (!axios.isAxiosError(err)) return false;
    const e = err as AxiosError<any>;
    const status = e.response?.status;
    if (status === 403 || status === 429) return true;
    const errorObj = e.response?.data?.error;
    const reasons = new Set<string>();
    if (errorObj?.status) reasons.add(String(errorObj.status));
    if (Array.isArray(errorObj?.errors)) {
      for (const it of errorObj.errors) {
        if (it?.reason) reasons.add(String(it.reason));
      }
    }
    if (Array.isArray(errorObj?.details)) {
      for (const it of errorObj.details) {
        if (it?.reason) reasons.add(String(it.reason));
      }
    }
    const rotateOn = [
      "quotaExceeded",
      "rateLimitExceeded",
      "userRateLimitExceeded",
      "dailyLimitExceeded",
      "RESOURCE_EXHAUSTED",
      "API_KEY_INVALID",
      "keyInvalid",
      "keyExpired",
      "ipRefererBlocked",
      "accessNotConfigured",
      "forbidden",
      "PERMISSION_DENIED",
    ];
    return rotateOn.some((r) => reasons.has(r));
  }

  private errorReason(err: unknown): string {
    if (axios.isAxiosError(err)) {
      const e = err as AxiosError<any>;
      const status = e.response?.status ?? "?";
      const reason =
        e.response?.data?.error?.errors?.[0]?.reason ||
        e.response?.data?.error?.message ||
        e.message;
      return `${status} ${reason ?? ""}`.trim();
    }
    return (err as Error)?.message ?? String(err);
  }

  status(): { total: number; available: number; cooledDown: number } {
    const now = Date.now();
    let available = 0;
    for (const s of this.states) {
      if (s.cooldownUntil <= now) available++;
    }
    return {
      total: this.states.length,
      available,
      cooledDown: this.states.length - available,
    };
  }
}

let singleton: YouTubeKeyRotator | null = null;

export function getYouTubeKeyRotator(): YouTubeKeyRotator {
  if (!singleton) singleton = YouTubeKeyRotator.fromEnv();
  return singleton;
}
