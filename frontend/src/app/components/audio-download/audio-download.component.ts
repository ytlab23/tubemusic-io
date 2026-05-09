import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import {
  AudioDownloadService,
  AudioInfo,
  AudioQuota,
  AudioDownloadResult,
} from '../../services/audio-download.service';
import { ToastService } from '../../services/toast.service';
import { SignupService } from '../../services/signup.service';
import { FavoritesService } from '../../services/favorites.service';

type Step = 'input' | 'info' | 'downloading' | 'completed' | 'error';

interface MathCaptcha {
  a: number;
  b: number;
  answer: string;
  solved: boolean;
}

interface FaqItem {
  q: string;
  a: string;
  open?: boolean;
}

@Component({
  selector: 'app-audio-download',
  templateUrl: './audio-download.component.html',
  styleUrls: ['./audio-download.component.css'],
})
export class AudioDownloadComponent implements OnInit, OnDestroy {
  url = '';
  step: Step = 'input';
  isLoadingInfo = false;
  isDownloading = false;
  videoInfo: AudioInfo | null = null;
  result: AudioDownloadResult | null = null;
  errorMessage = '';
  errorCode = '';
  progress = 0;
  progressLabel = '';
  isPro = false;

  ext: 'mp3' | 'm4a' = 'mp3';
  formats: ('mp3' | 'm4a')[] = ['mp3', 'm4a'];

  quota: AudioQuota | null = null;
  showProModal = false;

  captcha: MathCaptcha = this.makeCaptcha();
  captchaInput = '';

  private deviceId = '';
  private sse: EventSource | null = null;

  faq: FaqItem[] = [
    {
      q: 'Is this really free?',
      a: 'Yes — every visitor gets 2 free MP3 downloads every 24 hours. No signup required. PRO unlocks unlimited downloads, plus longer files (up to 1h) and AI music.',
    },
    {
      q: 'Why MP3 vs M4A?',
      a: 'Both are great. MP3 is the universal format that plays everywhere. M4A (AAC) keeps better quality at the same bitrate and is the default on Apple devices. Pick whichever your editor handles cleanest.',
    },
    {
      q: 'Why captcha for everyone, even PRO?',
      a: 'Bots constantly try to scrape this endpoint. The captcha keeps the service fast and free for real humans. It’s a single click — never an interstitial.',
    },
    {
      q: 'My download failed. What now?',
      a: 'Hit Retry. Free users get one retry, PRO users get unlimited retries plus a Report button so our team can investigate the specific track.',
    },
    {
      q: 'Are downloads safe?',
      a: 'Yes. We never inject ads, redirect to malware sites, or repackage the audio. Files come straight from our audio provider over HTTPS.',
    },
  ];

  constructor(
    private audioService: AudioDownloadService,
    private toast: ToastService,
    private route: ActivatedRoute,
    private router: Router,
    private titleService: Title,
    private metaService: Meta,
    private signup: SignupService,
    private favorites: FavoritesService
  ) {}

  isSaved(): boolean {
    const id = this.result?.videoId || this.videoInfo?.videoId;
    return !!id && this.favorites.isSaved(id);
  }

  toggleSave(): void {
    const id = this.result?.videoId || this.videoInfo?.videoId;
    if (!id) {
      this.toast.showToast('error', 'Load a video first');
      return;
    }
    const title = this.result?.title || this.videoInfo?.title;
    const thumbnail = this.result?.thumbnail || this.videoInfo?.thumbnail;
    this.favorites
      .toggle({
        videoId: id,
        title,
        thumbnail,
        url: `https://youtube.com/watch?v=${id}`,
        source: 'audio-download',
      })
      .subscribe((saved) => {
        this.toast.showToast(
          saved ? 'success' : 'info',
          saved
            ? this.favorites.isLoggedIn()
              ? 'Saved to your favorites'
              : 'Saved on this device'
            : 'Removed from favorites'
        );
      });
  }

  ngOnInit(): void {
    this.titleService.setTitle(
      'YouTube to MP3 — Fast, Free, Safe | TubeMusic.io'
    );
    this.metaService.updateTag({
      name: 'description',
      content:
        'Convert YouTube videos to MP3 in seconds. No ads, no malware, no fake redirects. 2 free downloads per day — go PRO for unlimited.',
    });
    this.metaService.updateTag({
      name: 'keywords',
      content:
        'youtube to mp3, youtube audio download, free mp3 converter, no ads mp3, safe youtube downloader',
    });

    if (typeof window === 'undefined') return;
    this.deviceId = this.audioService.ensureDeviceId();
    this.isPro = localStorage.getItem('tubemusic-pro') === '1';
    this.loadQuota();

    this.route.queryParams.subscribe((params) => {
      const incoming = params['url'];
      if (incoming && incoming !== this.url) {
        this.url = incoming;
      }
    });
  }

  ngOnDestroy(): void {
    this.disconnectSse();
  }

  private loadQuota(): void {
    this.audioService.quota(this.deviceId).subscribe({
      next: (res) => (this.quota = res?.data ?? null),
      error: () => (this.quota = null),
    });
  }

  private makeCaptcha(): MathCaptcha {
    const a = Math.floor(Math.random() * 8) + 2;
    const b = Math.floor(Math.random() * 8) + 2;
    return { a, b, answer: '', solved: false };
  }

  refreshCaptcha(): void {
    this.captcha = this.makeCaptcha();
    this.captchaInput = '';
  }

  isCaptchaValid(): boolean {
    return Number(this.captchaInput) === this.captcha.a + this.captcha.b;
  }

  fetchInfo(): void {
    if (!this.url?.trim()) {
      this.toast.showToast('error', 'Paste a YouTube URL first');
      return;
    }
    this.isLoadingInfo = true;
    this.errorMessage = '';
    this.errorCode = '';
    this.videoInfo = null;
    this.result = null;
    this.audioService.info(this.url.trim()).subscribe({
      next: (res) => {
        this.isLoadingInfo = false;
        this.videoInfo = res?.data ?? null;
        if (this.videoInfo) {
          this.step = 'info';
        }
      },
      error: (err) => {
        this.isLoadingInfo = false;
        this.toast.showToast(
          'error',
          err?.error?.message || 'Could not read that video'
        );
      },
    });
  }

  startDownload(): void {
    if (!this.videoInfo) {
      this.toast.showToast('error', 'Load video info first');
      return;
    }
    if (!this.isCaptchaValid()) {
      this.toast.showToast(
        'error',
        'Please solve the captcha to confirm you are human'
      );
      return;
    }
    if (
      !this.isPro &&
      this.quota &&
      this.quota.limit != null &&
      this.quota.remaining != null &&
      this.quota.remaining <= 0
    ) {
      this.showProModal = true;
      return;
    }
    if (
      !this.isPro &&
      this.quota &&
      this.videoInfo.durationSeconds > this.quota.free_max_duration_seconds
    ) {
      this.showProModal = true;
      return;
    }

    this.isDownloading = true;
    this.errorMessage = '';
    this.errorCode = '';
    this.step = 'downloading';
    this.progress = 0;
    this.progressLabel = 'Starting…';
    this.disconnectSse();

    this.audioService
      .download({
        url: this.url.trim(),
        ext: this.ext,
        device_id: this.deviceId,
      })
      .subscribe({
        next: (res) => {
          this.result = res?.data ?? null;
          if (!this.result) {
            this.fail('Provider returned no result', 'AUDIO_PROVIDER_FAILED');
            return;
          }
          this.attachProgressStream(this.result.progressUrl);
          this.refreshCaptcha();
          this.loadQuota();
        },
        error: (err) => {
          this.isDownloading = false;
          const code = err?.error?.code as string | undefined;
          const msg = err?.error?.message || 'Download failed';
          if (
            code === 'AUDIO_QUOTA_EXCEEDED' ||
            code === 'AUDIO_LENGTH_PRO_ONLY'
          ) {
            this.showProModal = true;
            this.step = 'info';
          } else if (code === 'AUDIO_PROVIDER_DISABLED') {
            this.fail(msg, code);
          } else {
            this.fail(msg, code || 'AUDIO_DOWNLOAD_ERROR');
          }
        },
      });
  }

  private attachProgressStream(progressUrl: string): void {
    if (!progressUrl) {
      this.progress = 100;
      this.progressLabel = 'Ready';
      this.step = 'completed';
      this.isDownloading = false;
      return;
    }
    this.sse = new EventSource(progressUrl);
    this.sse.addEventListener('progress', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        const pct = Number(data.progress ?? 0);
        if (!isNaN(pct)) {
          this.progress = Math.max(this.progress, pct);
          this.progressLabel =
            data.status === 'completed' ? 'Ready' : `Working… ${this.progress}%`;
        }
        if (data.status === 'completed' || pct >= 100) {
          this.progress = 100;
          this.progressLabel = 'Ready';
          this.step = 'completed';
          this.isDownloading = false;
          this.disconnectSse();
        }
        if (data.status === 'error') {
          this.fail('Provider reported an error', 'AUDIO_PROVIDER_ERROR');
          this.disconnectSse();
        }
      } catch {
        /* ignore malformed event */
      }
    });
    this.sse.onerror = () => {
      // Most failures here mean stream closed because we already finished;
      // only surface as a real error if we never reached 100%.
      if (this.progress < 100) {
        this.fail('Lost connection to the audio provider', 'SSE_ERROR');
      }
      this.disconnectSse();
    };
  }

  private disconnectSse(): void {
    if (this.sse) {
      try {
        this.sse.close();
      } catch {
        /* ignore */
      }
      this.sse = null;
    }
  }

  private fail(message: string, code: string): void {
    this.errorMessage = message;
    this.errorCode = code;
    this.step = 'error';
    this.isDownloading = false;
  }

  retry(): void {
    if (this.step === 'error') {
      this.startDownload();
    }
  }

  reportIssue(): void {
    if (!this.isPro) {
      this.showProModal = true;
      return;
    }
    this.toast.showToast(
      'success',
      'Thanks — our team will look into this track.'
    );
  }

  saveDownloadFile(): void {
    if (this.result?.downloadUrl) {
      const a = document.createElement('a');
      a.href = this.result.downloadUrl;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  resetForm(): void {
    this.url = '';
    this.videoInfo = null;
    this.result = null;
    this.step = 'input';
    this.isDownloading = false;
    this.isLoadingInfo = false;
    this.progress = 0;
    this.progressLabel = '';
    this.errorMessage = '';
    this.errorCode = '';
    this.refreshCaptcha();
    this.disconnectSse();
  }

  goPro(): void {
    this.router.navigate(['/pro']);
  }

  closeProModal(): void {
    this.showProModal = false;
  }

  toggleFaq(item: FaqItem): void {
    item.open = !item.open;
  }

  formatDuration(seconds: number): string {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  formatNumber(num: number): string {
    if (!num) return '0';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
    return String(num);
  }
}
