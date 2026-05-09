import { Component, OnInit } from '@angular/core';
import { AdminService } from '../services/admin.service';
import { MusicCheckerService } from '../services/music-checker.service';
import { ToastService } from '../services/toast.service';

type AdminTab = 'bulk' | 'logs' | 'keys';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css'],
})
export class AdminComponent implements OnInit {
  activeTab: AdminTab = 'bulk';

  // Bulk import
  youtubeLink = '';
  youtubeLinks: string[] = [];
  linkCount = 0;
  clicked = false;

  // Checker logs
  logs: any[] = [];
  logTotal = 0;
  loadingLogs = false;
  logError = '';
  logFilter = {
    page: 1,
    limit: 50,
    flagged: false,
    video_id: '',
  };
  flagTarget: any = null;
  flagReason = '';
  flagging = false;

  // Keys
  keyStatus: { total: number; available: number; cooledDown: number } | null =
    null;

  constructor(
    private adminService: AdminService,
    private musicService: MusicCheckerService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    /* default tab is bulk; lazy-load other tabs on switch */
  }

  switchTab(tab: AdminTab): void {
    this.activeTab = tab;
    if (tab === 'logs' && this.logs.length === 0) this.loadLogs(1);
    if (tab === 'keys' && !this.keyStatus) this.loadKeys();
  }

  // ---------- Bulk import ----------
  onFileSelected(event: any): void {
    const file: File = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target as FileReader).result as string;
      this.youtubeLinks = text
        .split('\n')
        .map((link) => link.trim())
        .filter((link) => link.length > 0);
      this.linkCount = this.youtubeLinks.length;
    };
    reader.readAsText(file);
  }

  processLinks(): void {
    this.clicked = true;
    if (this.youtubeLinks.length === 0 && !this.youtubeLink.trim()) {
      this.clicked = false;
      this.toast.showToast('error', 'Add at least one YouTube link first');
      return;
    }
    if (this.youtubeLink.trim()) {
      this.youtubeLinks.push(this.youtubeLink.trim());
      this.linkCount = this.youtubeLinks.length;
    }
    this.adminService.addMusicToDatabase(this.youtubeLinks).subscribe({
      next: (res: any) => {
        this.clicked = false;
        this.toast.showToast(
          'success',
          `Imported ${res?.num_created ?? 0} new tracks${
            res?.repeated?.length ? ` (${res.repeated.length} duplicates)` : ''
          }.`
        );
        this.youtubeLink = '';
        this.youtubeLinks = [];
        this.linkCount = 0;
      },
      error: () => {
        this.clicked = false;
        this.toast.showToast('error', 'Bulk import failed');
      },
    });
  }

  // ---------- Checker logs ----------
  loadLogs(page = this.logFilter.page): void {
    this.loadingLogs = true;
    this.logError = '';
    this.logFilter.page = Math.max(1, page);
    this.musicService
      .getCheckerLogs({
        page: this.logFilter.page,
        limit: this.logFilter.limit,
        flagged: this.logFilter.flagged,
        video_id: this.logFilter.video_id || undefined,
      })
      .subscribe({
        next: (res) => {
          this.loadingLogs = false;
          this.logs = res?.data ?? [];
          this.logTotal = res?.total ?? this.logs.length;
        },
        error: (err) => {
          this.loadingLogs = false;
          this.logError =
            err?.error?.message || 'You need to be signed in as an admin to view logs.';
        },
      });
  }

  openFlagDialog(log: any): void {
    this.flagTarget = log;
    this.flagReason = '';
  }

  closeFlagDialog(): void {
    this.flagTarget = null;
    this.flagReason = '';
    this.flagging = false;
  }

  submitFlag(): void {
    if (!this.flagTarget?._id) return;
    if (!this.flagReason.trim()) {
      this.toast.showToast('error', 'Add a short reason first');
      return;
    }
    this.flagging = true;
    this.musicService
      .flagCheck(this.flagTarget._id, this.flagReason.trim())
      .subscribe({
        next: () => {
          this.toast.showToast('success', 'Flagged. Thanks!');
          const idx = this.logs.findIndex((l) => l._id === this.flagTarget._id);
          if (idx !== -1) {
            this.logs[idx] = {
              ...this.logs[idx],
              flagged: true,
              flag_reason: this.flagReason.trim(),
            };
          }
          this.closeFlagDialog();
        },
        error: (err) => {
          this.flagging = false;
          this.toast.showToast(
            'error',
            err?.error?.message || 'Could not flag this result.'
          );
        },
      });
  }

  // ---------- Keys ----------
  loadKeys(): void {
    this.musicService.getYoutubeKeyStatus().subscribe({
      next: (res) => (this.keyStatus = res?.data ?? null),
      error: () => (this.keyStatus = null),
    });
  }
}
