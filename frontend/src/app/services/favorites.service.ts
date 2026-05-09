import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../enviroments/enviroment';

export interface FavoriteItem {
  /**
   * Stable identifier:
   *  - server-side rows use the Mongo `_id`
   *  - local rows use `local:<videoId>`
   */
  id: string;
  videoId: string;
  url: string;
  title?: string;
  thumbnail?: string;
  tags?: string[];
  source: 'checker' | 'gallery' | 'audio-download' | 'ai-music' | 'manual';
  /** ISO timestamp when the row was saved. */
  savedAt: string;
  /** True if the row lives only in localStorage (not synced to a logged-in account). */
  local: boolean;
}

const LOCAL_KEY = 'tubemusic-favorites';
const LOCAL_CAP = 500;

function nowIso(): string {
  return new Date().toISOString();
}

function readLocal(): FavoriteItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as FavoriteItem[];
  } catch {
    return [];
  }
}

function writeLocal(list: FavoriteItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = list.slice(0, LOCAL_CAP);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore quota errors */
  }
}

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private apiUrl = environment.apiUrl;

  /** Reactive list — emits whenever a save/unsave/load happens. */
  private subject = new BehaviorSubject<FavoriteItem[]>([]);
  list$ = this.subject.asObservable();

  /** Cached video-ids for synchronous `isSaved` lookups in templates. */
  private savedIds = new Set<string>();

  constructor(private http: HttpClient) {
    if (typeof window !== 'undefined') {
      const local = readLocal();
      this.subject.next(local);
      local.forEach((it) => this.savedIds.add(it.videoId));
    }
  }

  isLoggedIn(): boolean {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem('token');
  }

  isSaved(videoId: string): boolean {
    return !!videoId && this.savedIds.has(videoId);
  }

  current(): FavoriteItem[] {
    return this.subject.getValue();
  }

  /**
   * Load favorites: merges local with server-side when logged in, returns
   * local-only otherwise. Always emits via `list$`.
   */
  load(): Observable<FavoriteItem[]> {
    const local = readLocal();
    if (!this.isLoggedIn()) {
      this.emit(local);
      return of(local);
    }
    const headers = this.authHeaders();
    return this.http
      .get<any>(`${this.apiUrl}/music/user`, {
        params: { limit: '200', page: '1' },
        headers,
      })
      .pipe(
        map((res) => {
          const items: any[] = Array.isArray(res) ? res : res?.data || [];
          const server: FavoriteItem[] = items.map((m) => ({
            id: String(m._id || `srv:${m.video_id}`),
            videoId: m.video_id,
            url: m.url || `https://youtube.com/watch?v=${m.video_id}`,
            title: m.title,
            thumbnail: m.thumbnail,
            tags: m.tags,
            source: 'manual',
            savedAt: m.createdAt || m.updatedAt || new Date().toISOString(),
            local: false,
          }));
          return this.merge(server, local);
        }),
        tap((merged) => this.emit(merged)),
        catchError(() => {
          this.emit(local);
          return of(local);
        })
      );
  }

  /**
   * Save a track. Logged-in users hit the server; anonymous users get a
   * localStorage row. Always returns success — never blocks the user.
   */
  save(payload: {
    videoId: string;
    title?: string;
    thumbnail?: string;
    url?: string;
    tags?: string[];
    source: FavoriteItem['source'];
  }): Observable<FavoriteItem> {
    if (!payload?.videoId) {
      return of(this.toLocalItem(payload));
    }
    if (this.isSaved(payload.videoId)) {
      return of(
        this.current().find((it) => it.videoId === payload.videoId) ||
          this.toLocalItem(payload)
      );
    }
    const url =
      payload.url || `https://youtube.com/watch?v=${payload.videoId}`;
    if (this.isLoggedIn()) {
      const headers = this.authHeaders();
      const body = {
        videoId: payload.videoId,
        video_id: payload.videoId,
        title: payload.title,
        thumbnail: payload.thumbnail,
        url,
        tags: payload.tags || [],
      };
      return this.http
        .post<any>(`${this.apiUrl}/music`, body, { headers })
        .pipe(
          map((row) => {
            const item: FavoriteItem = {
              id: String(row?._id || `srv:${payload.videoId}`),
              videoId: payload.videoId,
              url,
              title: payload.title || row?.title,
              thumbnail: payload.thumbnail || row?.thumbnail,
              tags: payload.tags || row?.tags || [],
              source: payload.source,
              savedAt:
                row?.createdAt ||
                row?.updatedAt ||
                nowIso(),
              local: false,
            };
            this.upsertItem(item);
            return item;
          }),
          catchError((err) => {
            // 400 "Music already exists" → treat as already-saved success.
            const msg = (err?.error?.message || '').toLowerCase();
            if (
              err?.status === 400 &&
              msg.includes('already exists')
            ) {
              const item: FavoriteItem = {
                ...this.toLocalItem(payload, false),
                local: false,
              };
              this.upsertItem(item);
              return of(item);
            }
            // Otherwise fall back to localStorage so the click never feels
            // broken — the user can re-sync next time they're online.
            const item = this.toLocalItem(payload, true);
            this.upsertItem(item);
            return of(item);
          })
        );
    }
    const item = this.toLocalItem(payload, true);
    this.upsertItem(item);
    return of(item);
  }

  /**
   * Remove a saved track by videoId. Hits the server when logged in; always
   * removes the local copy.
   */
  unsave(videoId: string): Observable<boolean> {
    if (!videoId) return of(false);
    const next = this.current().filter((it) => it.videoId !== videoId);
    if (this.isLoggedIn()) {
      const headers = this.authHeaders();
      return this.http
        .delete<any>(`${this.apiUrl}/music/by-video/${encodeURIComponent(videoId)}`, {
          headers,
        })
        .pipe(
          map(() => true),
          tap(() => this.emit(next, /* persistLocal */ true)),
          catchError(() => {
            // Even if the server call fails, drop the local mirror so the
            // UI reflects the user's intent.
            this.emit(next, /* persistLocal */ true);
            return of(false);
          })
        );
    }
    this.emit(next, true);
    return of(true);
  }

  /**
   * After a fresh sign-in, copy any device-local favorites onto the user's
   * server account. Idempotent: server returns 400 "already exists" for
   * dupes, which we treat as a successful promotion. On success the local
   * row is upgraded to a server row; on hard failure the local row stays
   * so the user doesn't silently lose anything.
   */
  promoteLocalToServer(): Observable<{ promoted: number; failed: number }> {
    if (!this.isLoggedIn()) {
      return of({ promoted: 0, failed: 0 });
    }
    const local = readLocal();
    if (local.length === 0) {
      return of({ promoted: 0, failed: 0 });
    }
    return new Observable<{ promoted: number; failed: number }>(
      (subscriber) => {
        const headers = this.authHeaders();
        let promoted = 0;
        let failed = 0;
        let remaining = local.length;
        const survivors: FavoriteItem[] = [];
        const finish = () => {
          if (--remaining > 0) return;
          writeLocal(survivors);
          this.load().subscribe({
            next: () => {
              subscriber.next({ promoted, failed });
              subscriber.complete();
            },
            error: () => {
              subscriber.next({ promoted, failed });
              subscriber.complete();
            },
          });
        };
        for (const item of local) {
          const body = {
            videoId: item.videoId,
            video_id: item.videoId,
            title: item.title,
            thumbnail: item.thumbnail,
            url: item.url,
            tags: item.tags || [],
          };
          this.http
            .post<any>(`${this.apiUrl}/music`, body, headers ? { headers } : {})
            .subscribe({
              next: () => {
                promoted++;
                finish();
              },
              error: (err) => {
                const msg = (err?.error?.message || '').toLowerCase();
                if (err?.status === 400 && msg.includes('already exists')) {
                  promoted++;
                } else {
                  failed++;
                  survivors.push(item);
                }
                finish();
              },
            });
        }
      }
    );
  }

  /**
   * Toggle: returns true when the track ended up saved, false when removed.
   */
  toggle(payload: {
    videoId: string;
    title?: string;
    thumbnail?: string;
    url?: string;
    tags?: string[];
    source: FavoriteItem['source'];
  }): Observable<boolean> {
    if (this.isSaved(payload.videoId)) {
      return this.unsave(payload.videoId).pipe(map(() => false));
    }
    return this.save(payload).pipe(map(() => true));
  }

  private authHeaders(): HttpHeaders | undefined {
    if (typeof window === 'undefined') return undefined;
    const token = localStorage.getItem('token');
    return token
      ? new HttpHeaders().set('Authorization', `Bearer ${token}`)
      : undefined;
  }

  private toLocalItem(payload: any, asLocal: boolean = true): FavoriteItem {
    return {
      id: `local:${payload.videoId}`,
      videoId: payload.videoId,
      url:
        payload.url || `https://youtube.com/watch?v=${payload.videoId}`,
      title: payload.title,
      thumbnail: payload.thumbnail,
      tags: payload.tags || [],
      source: payload.source || 'manual',
      savedAt: nowIso(),
      local: asLocal,
    };
  }

  private upsertItem(item: FavoriteItem): void {
    const list = this.current().filter((it) => it.videoId !== item.videoId);
    list.unshift(item);
    this.emit(list, true);
  }

  private merge(
    server: FavoriteItem[],
    local: FavoriteItem[]
  ): FavoriteItem[] {
    const seen = new Set<string>();
    const out: FavoriteItem[] = [];
    for (const it of [...server, ...local]) {
      if (!it?.videoId || seen.has(it.videoId)) continue;
      seen.add(it.videoId);
      out.push(it);
    }
    out.sort(
      (a, b) =>
        new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
    );
    return out;
  }

  private emit(list: FavoriteItem[], persistLocal: boolean = false): void {
    this.subject.next(list);
    this.savedIds = new Set(list.map((it) => it.videoId));
    if (persistLocal) {
      const localOnly = list.filter((it) => it.local);
      writeLocal(localOnly);
    }
  }
}
