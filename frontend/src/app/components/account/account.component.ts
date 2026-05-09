import { Component, OnDestroy, OnInit } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { MusicCheckerService } from '../../services/music-checker.service';
import { SignupService } from '../../services/signup.service';
import { ToastService } from '../../services/toast.service';
import {
  FavoriteItem,
  FavoritesService,
} from '../../services/favorites.service';

interface ProfileSummary {
  username?: string;
  email?: string;
  isPro: boolean;
  freeAiUsedAt: string | null;
  downloadsToday: number;
  downloadsLimit: number;
}

type AccountTab = 'profile' | 'favorites' | 'ai-music' | 'subscription';

@Component({
  selector: 'app-account',
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.css'],
})
export class AccountComponent implements OnInit, OnDestroy {
  activeTab: AccountTab = 'profile';
  profile: ProfileSummary = {
    username: undefined,
    email: undefined,
    isPro: false,
    freeAiUsedAt: null,
    downloadsToday: 0,
    downloadsLimit: 2,
  };

  favorites: FavoriteItem[] = [];
  loadingFavorites = false;
  loadError = '';
  private favSub: Subscription | null = null;

  generations: any[] = [];

  constructor(
    private titleService: Title,
    private metaService: Meta,
    private musicService: MusicCheckerService,
    private userService: SignupService,
    private router: Router,
    private toastService: ToastService,
    private favService: FavoritesService
  ) {}

  ngOnDestroy(): void {
    this.favSub?.unsubscribe();
  }

  ngOnInit(): void {
    this.titleService.setTitle('Your Account | TubeMusic.io');
    this.metaService.updateTag({
      name: 'description',
      content:
        'Manage your TubeMusic.io account: saved favorites, AI music history, downloads, and your PRO subscription.',
    });

    if (typeof window === 'undefined') {
      return;
    }

    this.hydrateProfile();
    this.loadFavorites();
    this.loadGenerationsLocal();
  }

  isLoggedIn(): boolean {
    return this.userService.isAuth();
  }

  switchTab(tab: AccountTab): void {
    this.activeTab = tab;
    if (tab === 'favorites') {
      this.loadFavorites();
    }
  }

  goToSignIn(): void {
    this.router.navigate(['/sign-in'], { queryParams: { redirect: '/account' } });
  }

  private hydrateProfile(): void {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.profile.username = payload?.username;
        this.profile.email = payload?.email;
      } catch {
        /* ignore */
      }
    }
    if (typeof window !== 'undefined') {
      this.profile.isPro = localStorage.getItem('tubemusic-pro') === '1';
      this.profile.freeAiUsedAt = localStorage.getItem('aiMusicFreeUsedAt');
      const dlMeta = localStorage.getItem('mp3-downloads');
      if (dlMeta) {
        try {
          const parsed = JSON.parse(dlMeta);
          if (parsed?.day === new Date().toISOString().slice(0, 10)) {
            this.profile.downloadsToday = parsed?.count ?? 0;
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  private loadFavorites(): void {
    this.loadingFavorites = true;
    this.loadError = '';
    if (!this.favSub) {
      this.favSub = this.favService.list$.subscribe((list) => {
        this.favorites = list;
      });
    }
    this.favService.load().subscribe({
      next: () => {
        this.loadingFavorites = false;
      },
      error: () => {
        this.loadingFavorites = false;
        this.loadError = 'Could not load server favorites — showing device-local saves.';
      },
    });
  }

  removeFavorite(item: FavoriteItem): void {
    this.favService.unsave(item.videoId).subscribe(() => {
      this.toastService.showToast('info', 'Removed from favorites');
    });
  }

  private loadGenerationsLocal(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('aiMusicHistory');
      this.generations = raw ? JSON.parse(raw) : [];
    } catch {
      this.generations = [];
    }
  }

  signOut(): void {
    this.userService.deleteToken();
    this.toastService.showToast('success', 'Signed out');
    setTimeout(() => this.router.navigate(['/']), 800);
  }

  goPro(): void {
    this.router.navigate(['/pro']);
  }

  formatDate(value?: string | Date | null): string {
    if (!value) return '';
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return '';
    }
  }
}
