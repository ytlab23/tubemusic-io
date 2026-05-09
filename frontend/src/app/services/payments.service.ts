import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../../enviroments/enviroment';

export interface PaymentsStatus {
  provider: string;
  enabled: boolean;
  monthly_usd: number;
  yearly_usd: number;
}

export interface CheckoutResponse {
  url: string;
  method: 'whop';
  plan: 'monthly' | 'yearly';
  sessionId?: string | null;
}

export interface ConfirmResponse {
  activated: boolean;
  alreadyPro?: boolean;
  pending?: boolean;
  premium_until?: string;
  premium_plan?: string | null;
  message?: string;
}

export interface MeResponse {
  email: string;
  username?: string;
  is_pro: boolean;
  premium_plan: 'monthly' | 'yearly' | null;
  premium_until: string | null;
  premium_source: string | null;
}

const PRO_FLAG_KEY = 'tubemusic-pro';
const PRO_DETAIL_KEY = 'tubemusic-pro-detail';

@Injectable({ providedIn: 'root' })
export class PaymentsService {
  private apiUrl = environment.apiUrl;

  /**
   * Reactive PRO entitlement. Components subscribe to render the gold star,
   * unlock PRO-only inputs, etc. Hydrated synchronously from localStorage so
   * the first paint isn't flickery, then refreshed from the server on app
   * boot, after sign-in, and after a successful checkout.
   */
  private proSubject = new BehaviorSubject<boolean>(this.readLocalProFlag());
  isPro$ = this.proSubject.asObservable();

  /** Last-known full entitlement detail (plan, until, source). */
  private detailSubject = new BehaviorSubject<MeResponse | null>(
    this.readLocalDetail()
  );
  detail$ = this.detailSubject.asObservable();

  constructor(private http: HttpClient) {}

  status(): Observable<{ success: boolean; data: PaymentsStatus }> {
    return this.http.get<{ success: boolean; data: PaymentsStatus }>(
      `${this.apiUrl}/payments/status`
    );
  }

  createCheckout(plan: 'monthly' | 'yearly'): Observable<CheckoutResponse> {
    const headers = this.authHeaders();
    return this.http.post<CheckoutResponse>(
      `${this.apiUrl}/payments/create-checkout`,
      { plan },
      headers ? { headers } : {}
    );
  }

  confirmCheckout(): Observable<ConfirmResponse> {
    const headers = this.authHeaders();
    return this.http
      .post<ConfirmResponse>(
        `${this.apiUrl}/payments/confirm-checkout`,
        {},
        headers ? { headers } : {}
      )
      .pipe(
        tap((res) => {
          if (res?.activated) {
            this.refreshEntitlement().subscribe();
          }
        })
      );
  }

  /**
   * Pulls the authed user's current PRO state from the DB and syncs it into
   * localStorage + the reactive subjects. Resolves to null if not signed in
   * or the request fails — never throws so callers can fire-and-forget.
   */
  refreshEntitlement(): Observable<MeResponse | null> {
    const headers = this.authHeaders();
    if (!headers) {
      this.writeLocalDetail(null);
      this.proSubject.next(false);
      return of(null);
    }
    return new Observable<MeResponse | null>((subscriber) => {
      this.http
        .get<{ success: boolean; data: MeResponse }>(
          `${this.apiUrl}/payments/me`,
          { headers }
        )
        .subscribe({
          next: (res) => {
            const detail = res?.data ?? null;
            this.writeLocalDetail(detail);
            this.proSubject.next(!!detail?.is_pro);
            subscriber.next(detail);
            subscriber.complete();
          },
          error: () => {
            subscriber.next(null);
            subscriber.complete();
          },
        });
    });
  }

  isProSync(): boolean {
    return this.proSubject.getValue();
  }

  private authHeaders(): HttpHeaders | null {
    if (typeof window === 'undefined') return null;
    const token = localStorage.getItem('token');
    if (!token) return null;
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  private readLocalProFlag(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(PRO_FLAG_KEY) === '1';
  }

  private readLocalDetail(): MeResponse | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(PRO_DETAIL_KEY);
      return raw ? (JSON.parse(raw) as MeResponse) : null;
    } catch {
      return null;
    }
  }

  private writeLocalDetail(detail: MeResponse | null): void {
    if (typeof window === 'undefined') return;
    try {
      if (detail?.is_pro) {
        localStorage.setItem(PRO_FLAG_KEY, '1');
        localStorage.setItem(PRO_DETAIL_KEY, JSON.stringify(detail));
      } else {
        localStorage.removeItem(PRO_FLAG_KEY);
        if (detail) {
          localStorage.setItem(PRO_DETAIL_KEY, JSON.stringify(detail));
        } else {
          localStorage.removeItem(PRO_DETAIL_KEY);
        }
      }
      this.detailSubject.next(detail);
    } catch {
      /* ignore quota */
    }
  }
}
