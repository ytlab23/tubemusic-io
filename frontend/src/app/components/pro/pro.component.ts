import { Component, OnDestroy, OnInit } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { PaymentsService } from '../../services/payments.service';
import { SignupService } from '../../services/signup.service';
import { ToastService } from '../../services/toast.service';

interface Feature {
  icon: string;
  title: string;
  detail: string;
  comingSoon?: boolean;
}

interface Group {
  id: string;
  number: string;
  title: string;
  description: string;
  features: Feature[];
}

interface FaqItem {
  q: string;
  a: string;
}

interface ComparisonRow {
  label: string;
  free: string;
  pro: string;
}

const MONTHLY_PRICE = 2.9;
const YEARLY_PRICE = 19.9;
const YEARLY_EQUIVALENT_MONTHLY = YEARLY_PRICE / 12;
const YEARLY_SAVINGS_PERCENT = Math.round(
  (1 - YEARLY_PRICE / (MONTHLY_PRICE * 12)) * 100
);

@Component({
  selector: 'app-pro',
  templateUrl: './pro.component.html',
  styleUrls: ['./pro.component.css'],
})
export class ProComponent implements OnInit, OnDestroy {
  monthlyPrice = MONTHLY_PRICE;
  yearlyPrice = YEARLY_PRICE;
  yearlyEquivMonthly = YEARLY_EQUIVALENT_MONTHLY;
  yearlySavingsPercent = YEARLY_SAVINGS_PERCENT;
  monthlyAnnualSavings = MONTHLY_PRICE * 12 - YEARLY_PRICE;

  billing: 'monthly' | 'yearly' = 'yearly';
  isLoggedIn = false;
  checkoutLoading = false;
  checkoutError = '';
  postCheckoutMessage = '';

  groups: Group[] = [
    {
      id: 'speed',
      number: '01',
      title: 'Speed & reliability',
      description:
        'No daily caps, no captcha gauntlet, no fake redirects. PRO downloads land in seconds.',
      features: [
        {
          icon: 'bolt',
          title: 'Unlimited MP3 downloads',
          detail:
            'Free is 2 per 24 hours. PRO removes the cap so you can convert an entire channel back-catalog without throttling.',
        },
        {
          icon: 'flag',
          title: 'Report wrong copyright results',
          detail:
            'Spotted a track our checker called wrong? PRO members can flag it and our team re-runs it by hand within 24 hours.',
        },
        {
          icon: 'rocket_launch',
          title: 'Long-form audio (up to 1h)',
          detail:
            'Free downloads are capped at 20 minutes. PRO transcodes full hour-long tracks, podcast clips, and DJ sets.',
        },
        {
          icon: 'autorenew',
          title: 'Retry on failed jobs',
          detail:
            'When the audio provider hiccups, PRO gets a one-click retry plus a Report button — free users see the error and have to start over.',
        },
        {
          icon: 'block',
          title: 'No ads, no malware, no shady redirects',
          detail:
            'Built-in for everyone — but PRO removes the captcha entirely so the flow is paste → click → save.',
        },
      ],
    },
    {
      id: 'creator',
      number: '02',
      title: 'Creator-grade tools',
      description:
        'Make original royalty-free music for your videos, find safe-to-use tracks, and never worry about strikes.',
      features: [
        {
          icon: 'auto_awesome',
          title: '10× AI music generations / month',
          detail:
            'Free is 1 lifetime generation. PRO unlocks 10 monthly Lyria 3 generations — text, lyrics, image, or seeded from a YouTube link.',
        },
        {
          icon: 'library_music',
          title: 'Full royalty-free music library',
          detail:
            'Hand-vetted catalog sorted by genre, mood, channel, and engagement. Every track is safe across YouTube, TikTok, Reels, and Shorts.',
        },
        {
          icon: 'verified',
          title: 'Tubepilot-grade copyright checker',
          detail:
            'Live YouTube Data v3 stats + the TubePilot copyright pipeline so you see views, channel, license flag, and similar safe tracks in one panel.',
        },
        {
          icon: 'favorite',
          title: 'Favorites that sync',
          detail:
            'Save any track to your account and access it from any device. Free saves are device-local — PRO saves persist server-side.',
        },
      ],
    },
    {
      id: 'exports',
      number: '03',
      title: 'Formats & integrations',
      description:
        'Move tracks straight into the editor your workflow already lives in.',
      features: [
        {
          icon: 'audiotrack',
          title: 'MP3 & M4A exports',
          detail:
            'Universal MP3 for max compatibility, or AAC/M4A for cleaner quality at the same bitrate. Pick what your editor handles best.',
        },
        {
          icon: 'closed_caption',
          title: 'Lyrics & metadata pass-through',
          detail:
            'When YouTube exposes lyrics, captions, and chapter markers, PRO downloads include them as ID3 tags so your DAW shows them.',
        },
        {
          icon: 'cloud_upload',
          title: 'Direct download links',
          detail:
            'PRO returns durable file URLs you can paste into Premiere, CapCut, Descript, or your podcast host without re-uploading.',
        },
      ],
    },
    {
      id: 'power',
      number: '04',
      title: 'Power & access',
      description:
        'Built for creators publishing more than a single track at a time.',
      features: [
        {
          icon: 'layers',
          title: 'Bulk import',
          detail:
            'Upload a list of YouTube links and process the full batch instead of doing them one by one.',
        },
        {
          icon: 'support_agent',
          title: 'Human support',
          detail:
            'Real humans replying to billing questions, refund requests, and any track that misbehaves on your uploads.',
        },
        {
          icon: 'star',
          title: 'Early access to new features',
          detail:
            'Image-seeded music, longer Lyria clips, podcast trailer maker — PRO users get them first.',
        },
        {
          icon: 'lock',
          title: 'Priority key pool',
          detail:
            'YouTube Data API rotated across 9 keys. PRO traffic is routed to the warmest pool first so you never see quota errors during peak hours.',
        },
      ],
    },
  ];

  comparisonRows: ComparisonRow[] = [
    { label: 'MP3 downloads / 24h', free: '2', pro: 'Unlimited' },
    { label: 'Max audio length', free: '20 min', pro: 'Up to 1h' },
    { label: 'AI music generations', free: '1 lifetime', pro: '10 / month' },
    { label: 'Captcha required', free: 'Yes', pro: 'No' },
    { label: 'Royalty-free library', free: 'Limited', pro: 'Full' },
    { label: 'Retry failed downloads', free: '—', pro: 'Included' },
    { label: 'Report wrong results', free: '—', pro: 'Priority manual repair' },
    { label: 'Favorites sync', free: 'Device-local', pro: 'Cross-device' },
    { label: 'Copyright checker depth', free: 'Basic', pro: 'Tubepilot-grade' },
    { label: 'Audio formats', free: 'MP3', pro: 'MP3 · M4A' },
    { label: 'Bulk import', free: '—', pro: 'Included' },
    { label: 'Human support', free: '—', pro: 'Included' },
  ];

  faqs: FaqItem[] = [
    {
      q: 'Why is it so cheap?',
      a: "We're at launch pricing while we grow. Early subscribers lock in this rate forever — even as we add bigger features like image-seeded AI music and longer clips.",
    },
    {
      q: 'What payment methods do you accept?',
      a: 'Card payments (Apple Pay, Google Pay, credit/debit) through Whop. Cancel anytime from your Whop dashboard.',
    },
    {
      q: 'Can I cancel anytime?',
      a: "Yes. Cancel from your Whop dashboard and you'll stay PRO until the end of your billing period, then return to the free plan — no questions asked.",
    },
    {
      q: 'What if a download fails or a copyright check is wrong?',
      a: 'Free users see an error. PRO members get a one-click retry plus a Report button — our team re-runs the job by hand and emails you when it works.',
    },
    {
      q: 'Will free features get removed if I don’t upgrade?',
      a: 'Never. The free plan stays free and keeps the copyright checker, library browsing, and 2 daily MP3 downloads. PRO adds creator tools on top.',
    },
    {
      q: 'How do refunds work?',
      a: 'If PRO doesn’t work for you, we refund your last billed month — even on day 29. See our refund policy for details.',
    },
  ];

  constructor(
    private titleService: Title,
    private metaService: Meta,
    private router: Router,
    private route: ActivatedRoute,
    private payments: PaymentsService,
    private userService: SignupService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.titleService.setTitle('Go PRO | TubeMusic.io');
    this.metaService.updateTag({
      name: 'description',
      content:
        'TubeMusic PRO: unlimited YouTube to MP3 downloads, AI music generation, full royalty-free library, and human support — for $2.90/month. Cancel anytime.',
    });

    if (typeof window === 'undefined') return;

    this.isLoggedIn = this.userService.isAuth();
    window.addEventListener('storage', this.onStorageChange);

    this.route.queryParams.subscribe((params) => {
      if (params['success'] === '1') {
        this.handleSuccessReturn();
      } else if (params['canceled'] === '1') {
        this.toast.showToast('info', 'Checkout canceled.');
      }
    });
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', this.onStorageChange);
    }
  }

  private onStorageChange = (event: StorageEvent) => {
    if (!event || event.key === 'token' || event.key === null) {
      this.isLoggedIn = this.userService.isAuth();
    }
  };

  get currentPrice(): number {
    return this.billing === 'yearly' ? this.yearlyPrice : this.monthlyPrice;
  }

  get currentUnit(): string {
    return this.billing === 'yearly' ? '/ year' : '/ month';
  }

  setBilling(billing: 'monthly' | 'yearly'): void {
    this.billing = billing;
  }

  handleGetPro(): void {
    if (this.checkoutLoading) return;
    this.checkoutError = '';
    if (!this.isLoggedIn) {
      this.router.navigate(['/sign-in'], {
        queryParams: { redirect: '/pro' },
      });
      return;
    }
    this.checkoutLoading = true;
    this.payments.createCheckout(this.billing).subscribe({
      next: (res) => {
        if (!res?.url) {
          this.checkoutError = 'Failed to start checkout (no URL returned).';
          this.checkoutLoading = false;
          return;
        }
        window.location.href = res.url;
      },
      error: (err) => {
        this.checkoutLoading = false;
        const msg =
          err?.error?.error ||
          err?.error?.message ||
          'Failed to start checkout';
        this.checkoutError = msg;
        if (
          typeof msg === 'string' &&
          (msg.toLowerCase().includes('not configured') ||
            msg.includes('whop_not_configured'))
        ) {
          this.toast.showToast(
            'error',
            'Checkout is not yet configured on the server. Add WHOP_API_KEY and try again.'
          );
        } else {
          this.toast.showToast('error', this.checkoutError);
        }
      },
    });
  }

  private handleSuccessReturn(): void {
    if (!this.isLoggedIn) {
      this.postCheckoutMessage =
        'Sign in with the same email you used for checkout — your PRO will activate on the next visit.';
      return;
    }
    this.payments.confirmCheckout().subscribe({
      next: (res) => {
        if (res?.activated) {
          this.postCheckoutMessage = res.alreadyPro
            ? 'You’re already PRO — enjoy the full toolkit.'
            : 'Welcome to PRO! Everything is unlocked.';
          this.toast.showToast('success', this.postCheckoutMessage);
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('tubemusic-pro', '1');
          }
        } else if (res?.pending) {
          this.postCheckoutMessage =
            res.message ||
            'Payment received — finishing activation. Refresh in a few seconds.';
          this.toast.showToast('info', this.postCheckoutMessage);
        }
      },
      error: () => {
        this.postCheckoutMessage =
          'Could not confirm activation. If you completed payment, refresh in a minute.';
      },
    });
  }
}
