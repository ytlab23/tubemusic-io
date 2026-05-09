import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { resourceLimits } from 'worker_threads';
import { environment } from '../../enviroments/enviroment';

@Injectable({
  providedIn: 'root',
})
export class MusicCheckerService {
  apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  checkCopyright(youtubeUrl: string): Observable<any> {
    // return this.http.post<any>(
    //   `http://localhost:3000/youtube/copyright-check`,
    //   {
    //     youtube_url: youtubeUrl,
    //   }
    // );
    return this.http.post<any>(`${this.apiUrl}/youtube/copyright-check`, {
      youtube_url: youtubeUrl,
    });
  }

  likeVideo(videoId: string): Observable<any> {
    // return this.http.post<any>(`http://localhost:3000/youtube/music`, {
    //   video_id: videoId,
    // });
    return this.http.post<any>(`${this.apiUrl}/youtube/music`, {
      video_id: videoId,
    });
  }
  getMusics(limit: number, page: number): Observable<any> {
    // return this.http.get<any>(`http://localhost:3000/music/all`, {
    //   params: { limit: limit.toString(), page: page.toString() },
    // });
    return this.http.get<any>(`${this.apiUrl}/music/all`, {
      params: { limit: limit.toString(), page: page.toString() },
    });
  }
  createMusic(data: any): Observable<any> {
    // Retrieve the token from localStorage
    const token = localStorage.getItem('token');

    // Set up the headers with the Authorization token
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    // Make the POST request with the headers
    // return this.http.post<any>('http://localhost:3000/music', data, { headers });
    return this.http.post<any>(`${this.apiUrl}/music`, data, { headers });
  }
  getMusicsByUser(limit: number, page: number): Observable<any> {
    const token = localStorage.getItem('token');

    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
    // return this.http.get<any>(`http://localhost:3000/music/user`, {
    //   params: { limit: limit.toString(), page: page.toString() },
    //   headers,
    // });
    return this.http.get<any>(`${this.apiUrl}/music/user`, {
      params: { limit: limit.toString(), page: page.toString() },
      headers,
    });
  }

  getTags(): Observable<any> {
    // return this.http.get<any>(`http://localhost:3000/tags/top/10`);
    return this.http.get<any>(`${this.apiUrl}/tags/top/10`);
  }

  // get last checked musics
  getLastChecked(n: number): Observable<any> {
    // return this.http.get<any>(`http://localhost:3000/music/last-checked/${n}`);
    return this.http.get<any>(`${this.apiUrl}/music/last-checked/${n}`);
  }

  searchMusic(params: any): Observable<any> {
    // return this.http.post<any>(`http://localhost:3000/youtube/music-search`, params);
    return this.http.post<any>(`${this.apiUrl}/youtube/music-search`, params);
  }

  getGenres(): Observable<any> {
    // return this.http.get<any>(`http://localhost:3000/youtube/genres`);
    return this.http.get<any>(`${this.apiUrl}/youtube/genres`);
  }

  getMoodsApi(): Observable<any> {
    // return this.http.get<any>(`http://localhost:3000/youtube/moods`);
    return this.http.get<any>(`${this.apiUrl}/youtube/moods`);
  }

  getChannels(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/youtube/channels`);
  }

  /** Rich YouTube Data v3 metadata via the rotated key pool. */
  getVideoInfo(videoIdOrUrl: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/youtube/video-info`, {
      params: { url: videoIdOrUrl },
    });
  }

  /** Rotator status for admin diagnostics. */
  getYoutubeKeyStatus(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/youtube/keys-status`);
  }

  /** Admin: list checker logs. */
  getCheckerLogs(
    opts: {
      page?: number;
      limit?: number;
      flagged?: boolean;
      video_id?: string;
    } = {}
  ): Observable<any> {
    const params: any = {
      page: String(opts.page ?? 1),
      limit: String(opts.limit ?? 50),
    };
    if (opts.flagged) params.flagged = 'true';
    if (opts.video_id) params.video_id = opts.video_id;
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers = token
      ? new HttpHeaders().set('Authorization', `Bearer ${token}`)
      : undefined;
    return this.http.get<any>(`${this.apiUrl}/youtube/checks`, {
      params,
      headers,
    });
  }

  flagCheck(id: string, reason: string): Observable<any> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers = token
      ? new HttpHeaders().set('Authorization', `Bearer ${token}`)
      : undefined;
    return this.http.post<any>(
      `${this.apiUrl}/youtube/checks/${id}/flag`,
      { reason },
      { headers }
    );
  }
}
