import {
  Component,
  OnInit,
  Output,
  EventEmitter,
  Input,
  ViewChild,
  ElementRef,
  OnDestroy,
} from '@angular/core';
import { NgForm } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { MusicCheckerService } from '../../services/music-checker.service';
import { ToastService } from '../../services/toast.service';
import { SignupService } from '../../services/signup.service';
import { FavoritesService } from '../../services/favorites.service';
import { MusicDialogComponent } from '../music-dialog/music-dialog.component';

@Component({
  selector: 'app-music-checker',
  templateUrl: './music-checker.component.html',
  styleUrls: ['./music-checker.component.css'],
})
export class MusicCheckerComponent implements OnInit, OnDestroy {
  @Output() resultsChange = new EventEmitter<any[]>();
  @ViewChild('targetElement') targetElement!: ElementRef;

  @Input() heading1 = 'Check Your Music Rights Now!';
  @Input() content1 =
    'Get instant copyright verification for hassle-free uploads. Try it now for free!';
  @Input() action1 = 'Check';

  textinputPlaceholder = 'Enter YouTube Link (e.g., https://youtube.com/...)';

  search_query = '';
  results: any[] = [];
  clicked = false;
  isLogged = false;
  checkButtonText = 'Check';
  lastChecked: any = [];
  relatedVideos: any[] = [];
  searchTime: number | null = null;
  copied = false;
  copyrightData: any = null;
  richVideoInfo: any = null;
  loadingRichInfo = false;
  flagDialogOpen = false;
  flagReason = '';
  flagSubmitting = false;
  flaggedThisResult = false;

  private currentSearchSub: Subscription | null = null;

  constructor(
    private musicService: MusicCheckerService,
    private toastService: ToastService,
    private dialog: MatDialog,
    private sanitizer: DomSanitizer,
    private userService: SignupService,
    private router: Router,
    private route: ActivatedRoute,
    private favorites: FavoritesService
  ) {}

  ngOnInit(): void {
    this.isAuth();
    this.getLastChecked(8);
    this.route.queryParams.subscribe((params) => {
      const incoming = params['url'];
      if (incoming && this.search_query !== incoming) {
        this.search_query = incoming;
        if (this.isYouTubeUrl(incoming)) {
          this.searchByUrl();
        }
      }
    });
  }

  ngOnDestroy(): void {
    // cleanup subscription if component destroyed
    if (this.currentSearchSub) {
      this.currentSearchSub.unsubscribe();
      this.currentSearchSub = null;
    }
  }

  showCopiedMessage(): void {
    if (!this.results || !this.results.length) {
      this.toastService.showToast('info', 'No result to copy');
      return;
    }
    navigator.clipboard
      .writeText(
        this.results[0].title + '\nChecked on the website: https://tubemusic.io'
      )
      .then(() => {
        this.copied = true;
        setTimeout(() => (this.copied = false), 1000);
      })
      .catch(() => {
        this.toastService.showToast('error', 'Failed to copy to clipboard');
      });
  }

  scrollToElement(): void {
    if (!this.targetElement) return;
    this.targetElement.nativeElement.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  isAuth(): boolean {
    this.isLogged = this.userService.isAuth();
    return this.isLogged;
  }

  private isYouTubeUrl(q: string): boolean {
    if (!q) return false;
    return /(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)/i.test(
      q
    );
  }

  // Extracts a video id from well-known YouTube URL patterns.
  private extractYouTubeId(url: string): string | null {
    if (!url) return null;
    // handle embed, watch?v=, youtu.be short urls
    const regex =
      /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;
    const m = url.match(regex);
    if (m && m[1]) return m[1];
    // fallback: try to read v= param
    try {
      const paramsPart = url.split('?')[1] || '';
      const params = new URLSearchParams(paramsPart);
      const v = params.get('v');
      if (v && v.length === 11) return v;
    } catch (e) {
      // ignore
    }
    return null;
  }

  private makeEmbedUrlFromAny(urlOrIdOrUrlLike: string): SafeResourceUrl {
    // if a full url, extract ID; if ID-like, use it as id
    let videoId: string | null = null;
    if (this.isYouTubeUrl(urlOrIdOrUrlLike)) {
      videoId = this.extractYouTubeId(urlOrIdOrUrlLike);
    } else if (/^[A-Za-z0-9_-]{11}$/.test(urlOrIdOrUrlLike)) {
      videoId = urlOrIdOrUrlLike;
    }
    if (!videoId) {
      // fallback: trust input as-is (sanitized)
      return this.sanitizer.bypassSecurityTrustResourceUrl(urlOrIdOrUrlLike);
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube.com/embed/${videoId}`
    );
  }

  private startSearchTimer(): number {
    return Date.now();
  }

  private finalizeSearch(start: number) {
    const elapsed = (Date.now() - start) / 1000;
    this.searchTime = Math.round(elapsed * 100) / 100;
  }



  searchByUrl(): void {
    if (!this.search_query || !this.search_query.trim()) {
      this.toastService.showToast('error', "Search query can't be empty");
      return;
    }

    if (!this.isYouTubeUrl(this.search_query)) {
      this.toastService.showToast('error', 'Please enter a valid YouTube URL');
      return;
    }

    const start = this.startSearchTimer();
    this.cancelOngoingSearch();
    this.clicked = true;
    this.checkButtonText = 'Checking...';

    this.currentSearchSub = this.musicService
      .checkCopyright(this.search_query.trim())
      .pipe(
        finalize(() => {
          this.finalizeSearch(start);
          this.clicked = false;
          this.checkButtonText = 'Check';
        })
      )
      .subscribe(
        (response: any) => {
          if (response?.success && response?.data) {
            this.copyrightData = response.data;
            this.results = [this.copyrightData];
            this.flaggedThisResult = false;
            this.emitResults('results');
            this.loadRichVideoInfo(this.search_query.trim());
          } else {
            this.toastService.showToast('error', 'Failed to check copyright');
          }
        },
        (error: any) => {
          this.toastService.showToast(
            'error',
            'Failed to check copyright, please try again'
          );
          console.error('searchByUrl error:', error);
        }
      );
  }

  private loadRichVideoInfo(urlOrId: string): void {
    this.loadingRichInfo = true;
    this.richVideoInfo = null;
    this.musicService.getVideoInfo(urlOrId).subscribe({
      next: (res: any) => {
        this.richVideoInfo = res?.data ?? null;
        this.loadingRichInfo = false;
      },
      error: () => {
        this.loadingRichInfo = false;
      },
    });
  }

  private cancelOngoingSearch(): void {
    if (this.currentSearchSub) {
      this.currentSearchSub.unsubscribe();
      this.currentSearchSub = null;
    }
  }

  emitResults(source: string): void {
    // Emit the results array so parent components can react
    this.resultsChange.emit(this.results);
  }

  submitForm(form: NgForm): void {
    this.results = [];
    this.copyrightData = null;

    if (!this.search_query || !this.search_query.trim()) {
      this.toastService.showToast('error', "Search query can't be empty");
      return;
    }

    this.searchByUrl();
  }

  likeVideo(videoId: string): void {
    this.musicService.likeVideo(videoId).subscribe((response: any) => {
      if (response?.success) {
        this.toastService.showToast('success', 'Video liked successfully');
      } else {
        this.toastService.showToast('error', 'Failed to like video');
      }
    });
  }

  isSaved(track: any): boolean {
    return this.favorites.isSaved(track?.video_id);
  }

  saveMusic(track: any): void {
    const videoId = track?.video_id;
    if (!videoId) {
      this.toastService.showToast('error', 'Missing video id');
      return;
    }
    const payload = {
      videoId,
      title: track.name || track.title,
      thumbnail: track.thumbnail,
      url: track.url || `https://youtube.com/watch?v=${videoId}`,
      tags: [track.genre, track.mood].filter(Boolean),
      source: 'checker' as const,
    };
    this.favorites.toggle(payload).subscribe(
      (saved) => {
        if (saved) {
          this.toastService.showToast(
            'success',
            this.isLogged ? 'Saved to your favorites' : 'Saved on this device'
          );
        } else {
          this.toastService.showToast('info', 'Removed from favorites');
        }
      },
      (error: any) => {
        if (
          error?.status === 400 &&
          (error?.error?.message || '').toLowerCase().includes('already exists')
        ) {
          this.toastService.showToast('error', 'Already saved');
        } else {
          console.error('An error occurred while saving music:', error);
          this.toastService.showToast(
            'error',
            'An error occurred while saving music'
          );
        }
      }
    );
  }

  playSong(url: string) {
    const embedUrl = this.makeEmbedUrlFromAny(url);
    this.dialog.open(MusicDialogComponent, {
      data: { url: embedUrl },
      width: '50%',
      height: '55%',
    });
  }

  openLastCheckedModal(item: any): void {
    const embedUrl = item?.url ? this.makeEmbedUrlFromAny(item.url) : null;

    this.dialog.open(MusicDialogComponent, {
      data: {
        url: embedUrl,
        title: item.title,
        thumbnail: item.thumbnail,
        tags: item.tags || [],
        license: item.license || null,
        description: item.description || null,
        duration: item.duration || null,
      },
      width: '80%',
      maxWidth: '800px',
      height: '80%',
    });
  }

  getLastChecked(n: number): void {
    this.musicService
      .getLastChecked(n)
      .subscribe((response: any) => (this.lastChecked = response || []));
  }

  safePipe(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  navigateToDownload(videoId: string): void {
    const url = `https://youtube.com/watch?v=${videoId}`;
    this.router.navigate(['/audio-download'], { queryParams: { url } });
  }

  formatNumber(num: number): string {
    if (!num) return '0';
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  /**
   * Resolves a checked-at timestamp from a Music doc. Uses createdAt/updatedAt
   * if present, otherwise decodes the timestamp from the Mongo ObjectId
   * (first 8 hex chars = unix seconds).
   */
  getCheckedAt(item: any): Date | null {
    if (!item) return null;
    if (item.createdAt) return new Date(item.createdAt);
    if (item.updatedAt) return new Date(item.updatedAt);
    const id: string | undefined = item._id;
    if (id && typeof id === 'string' && id.length >= 8) {
      const seconds = parseInt(id.substring(0, 8), 16);
      if (!isNaN(seconds)) return new Date(seconds * 1000);
    }
    return null;
  }

  moveUp() {
    this.emitResults('input-clicked');
  }

  openFlagDialog(): void {
    if (!this.copyrightData?.checker_log_id) {
      this.toastService.showToast(
        'info',
        'This result does not have a flag id yet — re-run the check.'
      );
      return;
    }
    if (this.flaggedThisResult) {
      this.toastService.showToast('info', 'You already flagged this result.');
      return;
    }
    this.flagReason = '';
    this.flagDialogOpen = true;
  }

  closeFlagDialog(): void {
    this.flagDialogOpen = false;
    this.flagReason = '';
    this.flagSubmitting = false;
  }

  submitFlag(): void {
    const id = this.copyrightData?.checker_log_id;
    if (!id) return;
    if (!this.flagReason.trim()) {
      this.toastService.showToast('error', 'Add a short reason first');
      return;
    }
    this.flagSubmitting = true;
    this.musicService.flagCheck(id, this.flagReason.trim()).subscribe({
      next: () => {
        this.toastService.showToast('success', 'Thanks — flagged for review.');
        this.flaggedThisResult = true;
        this.closeFlagDialog();
      },
      error: (err: any) => {
        this.flagSubmitting = false;
        this.toastService.showToast(
          'error',
          err?.error?.message || 'Could not flag this result. Sign in first.'
        );
      },
    });
  }
}
