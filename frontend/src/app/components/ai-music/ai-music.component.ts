import { Component, OnInit } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import {
  AiMusicCatalogue,
  AiMusicMode,
  AiMusicService,
  AiMusicStatus,
} from '../../services/ai-music.service';
import { ToastService } from '../../services/toast.service';

interface ModeOption {
  id: AiMusicMode;
  label: string;
  hint: string;
  icon: string;
}

@Component({
  selector: 'app-ai-music',
  templateUrl: './ai-music.component.html',
  styleUrls: ['./ai-music.component.css'],
})
export class AiMusicComponent implements OnInit {
  modes: ModeOption[] = [
    {
      id: 'builder',
      label: 'Builder',
      hint: 'Pick genre, mood, instruments — no prompt-writing required',
      icon: 'tune',
    },
    {
      id: 'prompt',
      label: 'From a prompt',
      hint: 'Describe the vibe, instruments, or mood',
      icon: 'edit_note',
    },
    {
      id: 'lyrics',
      label: 'From lyrics',
      hint: 'Paste lyrics and we’ll arrange a track around them',
      icon: 'lyrics',
    },
    {
      id: 'image',
      label: 'From an image',
      hint: 'Drop an image URL — we’ll match its mood',
      icon: 'image',
    },
    {
      id: 'music_video',
      label: 'From a YouTube video',
      hint: 'Paste a YouTube link — we’ll seed from its metadata',
      icon: 'movie',
    },
  ];
  activeMode: AiMusicMode = 'builder';

  // Free-text modes
  prompt = '';
  lyrics = '';
  imageUrl = '';
  videoUrl = '';
  language = 'instrumental';
  durationSeconds = 30;
  loading = false;
  derivedPrompt = '';
  status: AiMusicStatus | null = null;
  catalogue: AiMusicCatalogue | null = null;
  showProModal = false;
  freeUsed = false;
  pendingMessage = '';
  blockedMessage = '';

  // Builder state
  builderGenre = '';
  builderMood = '';
  builderEnergy: 'low' | 'medium' | 'high' | '' = '';
  builderEra = '';
  builderVocals: 'instrumental' | 'vocals' | 'vocal_chops' = 'instrumental';
  builderInstruments: string[] = [];
  builderInspiredBy = '';
  builderArtistFilter = '';
  builderBpm: number | null = null;
  builderCustomNotes = '';
  builderUniqueSuffix = true;

  // Quality
  modelSlug: 'lyria-3-clip-preview' | 'lyria-3-pro-preview' =
    'lyria-3-clip-preview';
  isPro = false;

  // Live prompt preview
  previewedPrompt = '';
  previewLoading = false;
  private previewDebounce: any = null;

  result: {
    dataUrl: string;
    mimeType: string;
    bytes: number;
    caption: string | null;
    prompt: string;
    mode: string;
    fileName: string;
    model?: string;
    createdAt: string;
  } | null = null;

  constructor(
    private titleService: Title,
    private metaService: Meta,
    private aiMusic: AiMusicService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.titleService.setTitle('Free AI Music Generator | TubeMusic.io');
    this.metaService.updateTag({
      name: 'description',
      content:
        'Generate original royalty-free music with AI — pick genre, mood, instruments, even an artist vibe. 1 free generation, then go PRO for max quality.',
    });
    if (typeof window !== 'undefined') {
      this.freeUsed = this.aiMusic.hasUsedFreeGeneration();
      this.isPro = localStorage.getItem('tubemusic-pro') === '1';
    }
    this.aiMusic.getStatus().subscribe({
      next: (res) => (this.status = res?.data ?? null),
      error: () => (this.status = null),
    });
    this.aiMusic.getCatalogue().subscribe({
      next: (res) => {
        this.catalogue = res?.data ?? null;
        this.refreshPreview();
      },
      error: () => (this.catalogue = null),
    });
  }

  selectMode(mode: AiMusicMode): void {
    this.activeMode = mode;
    this.derivedPrompt = '';
    this.previewedPrompt = '';
    this.refreshPreview();
  }

  // ---------------------- Builder helpers ----------------------
  toggleInstrument(slug: string): void {
    const idx = this.builderInstruments.indexOf(slug);
    if (idx === -1) {
      if (this.builderInstruments.length >= 5) {
        this.toast.showToast('info', 'Pick up to 5 instruments — keep it focused');
        return;
      }
      this.builderInstruments.push(slug);
    } else {
      this.builderInstruments.splice(idx, 1);
    }
    this.refreshPreview();
  }

  isInstrumentSelected(slug: string): boolean {
    return this.builderInstruments.includes(slug);
  }

  setGenre(slug: string): void {
    this.builderGenre = this.builderGenre === slug ? '' : slug;
    // Auto-toggle suffix off for repetitive genres if user hasn't manually set it
    const g = this.catalogue?.genres.find((g) => g.slug === slug);
    if (g?.repetitive) {
      // Soft suffix is applied server-side automatically; we leave the toggle on
    }
    this.refreshPreview();
  }

  setMood(slug: string): void {
    this.builderMood = this.builderMood === slug ? '' : slug;
    this.refreshPreview();
  }

  setEnergy(slug: 'low' | 'medium' | 'high'): void {
    this.builderEnergy = this.builderEnergy === slug ? '' : slug;
    this.refreshPreview();
  }

  setEra(slug: string): void {
    this.builderEra = this.builderEra === slug ? '' : slug;
    this.refreshPreview();
  }

  setVocals(slug: 'instrumental' | 'vocals' | 'vocal_chops'): void {
    this.builderVocals = slug;
    this.refreshPreview();
  }

  setInspiredBy(slug: string): void {
    this.builderInspiredBy = this.builderInspiredBy === slug ? '' : slug;
    this.refreshPreview();
  }

  filteredArtists(): { slug: string; label: string; genreHint: string | null }[] {
    const list = this.catalogue?.artists || [];
    const q = this.builderArtistFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((a) => a.label.toLowerCase().includes(q));
  }

  refreshPreview(): void {
    if (typeof window === 'undefined') return;
    if (this.previewDebounce) clearTimeout(this.previewDebounce);
    this.previewDebounce = setTimeout(() => this.runPreview(), 250);
  }

  private runPreview(): void {
    if (this.activeMode !== 'builder') return;
    const payload = this.buildBuilderPayload();
    if (!payload) {
      this.previewedPrompt = '';
      return;
    }
    this.previewLoading = true;
    this.aiMusic.previewPrompt(payload).subscribe({
      next: (res) => {
        this.previewedPrompt = res?.data?.prompt || '';
        this.previewLoading = false;
      },
      error: () => {
        this.previewedPrompt = '';
        this.previewLoading = false;
      },
    });
  }

  private buildBuilderPayload() {
    const hasAnything =
      this.builderGenre ||
      this.builderMood ||
      this.builderInspiredBy ||
      this.builderCustomNotes;
    if (!hasAnything) return null;
    return {
      mode: 'builder' as const,
      genre: this.builderGenre || undefined,
      mood: this.builderMood || undefined,
      energy: (this.builderEnergy || undefined) as
        | 'low'
        | 'medium'
        | 'high'
        | undefined,
      bpm: this.builderBpm || undefined,
      era: this.builderEra || undefined,
      vocals: this.builderVocals,
      language: this.builderVocals === 'instrumental' ? undefined : this.language,
      instruments: this.builderInstruments.length
        ? this.builderInstruments
        : undefined,
      inspiredBy: this.builderInspiredBy || undefined,
      customNotes: this.builderCustomNotes?.trim() || undefined,
      durationSeconds: this.durationSeconds,
      appendUniqueSuffix: this.builderUniqueSuffix,
    };
  }

  // ---------------------- Existing modes ----------------------
  primeFromVideo(): void {
    if (!this.videoUrl?.trim()) {
      this.toast.showToast('error', 'Paste a YouTube link first');
      return;
    }
    this.loading = true;
    this.aiMusic.promptFromVideo(this.videoUrl.trim()).subscribe({
      next: (res) => {
        this.derivedPrompt = res?.data?.derivedPrompt || '';
        this.toast.showToast('success', 'Prompt built from the video');
        this.loading = false;
      },
      error: (err) => {
        this.toast.showToast(
          'error',
          err?.error?.message || 'Could not read that video'
        );
        this.loading = false;
      },
    });
  }

  // ---------------------- Generation ----------------------
  generate(): void {
    if (this.freeUsed && !this.isPro) {
      this.showProModal = true;
      return;
    }
    if (!this.isInputValid()) {
      this.toast.showToast('error', 'Add at least one ingredient first');
      return;
    }
    this.loading = true;
    this.pendingMessage = '';
    this.blockedMessage = '';
    this.result = null;

    const base: any = {
      mode: this.activeMode,
      durationSeconds: this.durationSeconds,
      language: this.language,
      model: this.modelSlug,
    };

    let payload: any;
    if (this.activeMode === 'builder') {
      const builderPayload = this.buildBuilderPayload();
      if (!builderPayload) {
        this.loading = false;
        return;
      }
      payload = { ...base, ...builderPayload };
    } else if (this.activeMode === 'prompt') {
      payload = { ...base, prompt: this.prompt };
    } else if (this.activeMode === 'lyrics') {
      payload = { ...base, lyrics: this.lyrics };
    } else if (this.activeMode === 'image') {
      payload = { ...base, imageUrl: this.imageUrl };
    } else if (this.activeMode === 'music_video') {
      payload = { ...base, videoId: this.videoUrl };
    }

    this.aiMusic.generate(payload).subscribe({
      next: (res: any) => {
        this.loading = false;
        const data = res?.data;
        if (res?.code === 'GENERATED' && data?.dataUrl) {
          const mode = data.mode || this.activeMode;
          const created = new Date().toISOString();
          const ext = (data.mimeType || 'audio/mpeg').includes('mp4')
            ? 'm4a'
            : 'mp3';
          const fileName = `tubemusic-ai-${mode}-${Date.now()}.${ext}`;
          this.result = {
            dataUrl: data.dataUrl,
            mimeType: data.mimeType,
            bytes: data.bytes,
            caption: data.caption ?? null,
            prompt: data.prompt,
            mode,
            fileName,
            model: data.model,
            createdAt: created,
          };
          this.toast.showToast('success', 'Track ready 🎉');
          if (data.proModelRequested && !data.proModelUsed) {
            this.toast.showToast(
              'info',
              'Pro model needs a PRO subscription — used Standard instead.'
            );
          }
          if (!this.isPro) {
            this.aiMusic.markFreeGenerationUsed();
            this.freeUsed = true;
          }
          this.persistHistoryEntry({
            id: `${created}-${Math.random().toString(36).slice(2, 8)}`,
            mode,
            prompt: data.prompt,
            caption: data.caption ?? null,
            fileName,
            durationSeconds: this.durationSeconds,
            createdAt: created,
            bytes: data.bytes,
            model: data.model,
          });
        } else if (res?.code === 'PENDING_LYRIA_INTEGRATION') {
          this.pendingMessage =
            'Generation request accepted. Audio will appear here shortly.';
        } else {
          this.toast.showToast('success', 'Generation finished');
        }
      },
      error: (err) => {
        this.loading = false;
        const code = err?.error?.code;
        if (code === 'AI_MUSIC_DISABLED') {
          this.pendingMessage =
            'AI music is not yet enabled on this server. Once Gemini credentials are configured, retry from this page.';
        } else if (
          code === 'PROHIBITED_CONTENT' ||
          code === 'PROMPT_BLOCKED'
        ) {
          this.blockedMessage =
            err?.error?.message ||
            'The safety filter blocked this prompt. Try removing artist names or describing the style instead.';
          this.toast.showToast('error', 'Prompt blocked — see panel below');
        } else {
          this.toast.showToast(
            'error',
            err?.error?.message || 'Generation failed'
          );
        }
      },
    });
  }

  private persistHistoryEntry(entry: any): void {
    if (typeof window === 'undefined') return;
    try {
      const KEY = 'aiMusicHistory';
      const raw = localStorage.getItem(KEY);
      const list = raw ? JSON.parse(raw) : [];
      const next = [entry, ...list].slice(0, 100);
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore quota errors */
    }
  }

  downloadResult(): void {
    if (!this.result || typeof document === 'undefined') return;
    const a = document.createElement('a');
    a.href = this.result.dataUrl;
    a.download = this.result.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  startOver(): void {
    this.result = null;
    this.pendingMessage = '';
    this.blockedMessage = '';
    this.derivedPrompt = '';
    this.prompt = '';
    this.lyrics = '';
    this.imageUrl = '';
    this.videoUrl = '';
    this.builderCustomNotes = '';
  }

  private isInputValid(): boolean {
    switch (this.activeMode) {
      case 'prompt':
        return !!this.prompt.trim();
      case 'lyrics':
        return !!this.lyrics.trim();
      case 'image':
        return !!this.imageUrl.trim();
      case 'music_video':
        return !!this.videoUrl.trim();
      case 'builder':
        return !!(
          this.builderGenre ||
          this.builderMood ||
          this.builderInspiredBy ||
          this.builderCustomNotes?.trim()
        );
    }
  }

  closeProModal(): void {
    this.showProModal = false;
  }

  durations = [15, 20, 30];
}
