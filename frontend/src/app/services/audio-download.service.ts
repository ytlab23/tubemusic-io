import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../enviroments/enviroment';

export interface AudioInfo {
  videoId: string;
  title: string;
  channelTitle: string;
  durationSeconds: number;
  duration: string;
  thumbnail: string;
  viewCount: number;
  likeCount: number;
}

export interface AudioQuota {
  used: number;
  limit: number | null;
  remaining: number | null;
  pro: boolean;
  free_max_duration_seconds: number;
  pro_max_duration_seconds: number;
  resetsAt: string;
}

export interface AudioStatus {
  provider: string;
  enabled: boolean;
  free_daily_limit: number;
  free_max_duration_seconds: number;
  pro_max_duration_seconds: number;
  formats: ('mp3' | 'm4a')[];
}

export interface AudioDownloadResult {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  durationSeconds: number;
  ext: 'mp3' | 'm4a';
  directDownload: boolean;
  downloadUrl: string;
  progressUrl: string;
  streamUrl: string;
  pro: boolean;
}

@Injectable({ providedIn: 'root' })
export class AudioDownloadService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  status(): Observable<{ success: boolean; data: AudioStatus }> {
    return this.http.get<{ success: boolean; data: AudioStatus }>(
      `${this.apiUrl}/audio/status`
    );
  }

  quota(deviceId?: string): Observable<{ success: boolean; data: AudioQuota }> {
    let params = new HttpParams();
    if (deviceId) params = params.set('device', deviceId);
    return this.http.get<{ success: boolean; data: AudioQuota }>(
      `${this.apiUrl}/audio/quota`,
      { params }
    );
  }

  info(url: string): Observable<{ success: boolean; data: AudioInfo }> {
    return this.http.post<{ success: boolean; data: AudioInfo }>(
      `${this.apiUrl}/audio/info`,
      { url }
    );
  }

  download(payload: {
    url: string;
    ext?: 'mp3' | 'm4a';
    device_id?: string;
  }): Observable<{ success: boolean; data: AudioDownloadResult }> {
    return this.http.post<{ success: boolean; data: AudioDownloadResult }>(
      `${this.apiUrl}/audio/download`,
      payload
    );
  }

  /**
   * Or load a stable per-browser device id; used for the IP+device rate limit.
   */
  ensureDeviceId(): string {
    if (typeof window === 'undefined') return 'ssr';
    const KEY = 'tubemusic-device-id';
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? (crypto as any).randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(KEY, fresh);
    return fresh;
  }
}
