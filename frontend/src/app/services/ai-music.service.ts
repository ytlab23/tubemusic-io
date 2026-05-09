import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../enviroments/enviroment';

export interface AiMusicModelOption {
  slug: string;
  label: string;
  description: string;
  proOnly?: boolean;
}

export interface AiMusicStatus {
  enabled: boolean;
  model: string;
  models?: AiMusicModelOption[];
  modes: string[];
  free_generations_per_user: number;
  pro_generations_per_month: number;
  max_duration_seconds: number;
  languages: string[];
}

export type AiMusicMode =
  | 'prompt'
  | 'lyrics'
  | 'image'
  | 'music_video'
  | 'builder';

export interface AiMusicRequest {
  mode: AiMusicMode;
  prompt?: string;
  lyrics?: string;
  language?: string;
  durationSeconds?: number;
  videoId?: string;
  imageUrl?: string;
  // Builder fields
  genre?: string;
  mood?: string;
  energy?: 'low' | 'medium' | 'high';
  bpm?: number | null;
  era?: string;
  vocals?: 'instrumental' | 'vocals' | 'vocal_chops';
  instruments?: string[];
  inspiredBy?: string;
  customNotes?: string;
  appendUniqueSuffix?: boolean;
  // Quality toggle
  model?: string;
}

export interface AiMusicCatalogue {
  genres: {
    slug: string;
    label: string;
    bpmRange: [number, number];
    repetitive: boolean;
  }[];
  moods: { slug: string; label: string }[];
  eras: { slug: string; label: string }[];
  instruments: { slug: string; label: string }[];
  artists: { slug: string; label: string; genreHint: string | null }[];
  energies: { slug: string; label: string }[];
  vocals: { slug: string; label: string }[];
}

@Injectable({ providedIn: 'root' })
export class AiMusicService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getStatus(): Observable<{ success: boolean; data: AiMusicStatus }> {
    return this.http.get<{ success: boolean; data: AiMusicStatus }>(
      `${this.apiUrl}/ai-music/status`
    );
  }

  getCatalogue(): Observable<{ success: boolean; data: AiMusicCatalogue }> {
    return this.http.get<{ success: boolean; data: AiMusicCatalogue }>(
      `${this.apiUrl}/ai-music/catalogue`
    );
  }

  previewPrompt(req: AiMusicRequest): Observable<any> {
    return this.http.post<any>(
      `${this.apiUrl}/ai-music/preview-prompt`,
      req
    );
  }

  promptFromVideo(urlOrId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/ai-music/prompt-from-video`, {
      params: { url: urlOrId },
    });
  }

  generate(req: AiMusicRequest): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/ai-music/generate`, req);
  }

  /** Tracks free quota client-side. The server is the source of truth once wired. */
  hasUsedFreeGeneration(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('aiMusicFreeUsedAt') !== null;
  }

  markFreeGenerationUsed(): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('aiMusicFreeUsedAt', new Date().toISOString());
  }
}
