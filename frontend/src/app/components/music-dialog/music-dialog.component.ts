import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { FavoritesService } from '../../services/favorites.service';
import { ToastService } from '../../services/toast.service';

interface DialogData {
  url: any;
  title?: string;
  thumbnail?: string;
  tags?: string[];
  description?: string;
  duration?: string;
  author?: string;
  views?: number;
  likes?: number;
  videoId?: string;
  video_id?: string;
  genre?: string;
  subGenre1?: string;
  subGenre2?: string;
  mood?: string;
  subMood1?: string;
  subMood2?: string;
  uploadDate?: string;
  channelName?: string;
}

@Component({
  selector: 'app-music-dialog',
  templateUrl: './music-dialog.component.html',
  styleUrls: ['./music-dialog.component.css'],
})
export class MusicDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<MusicDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private router: Router,
    private favorites: FavoritesService,
    private toast: ToastService
  ) {}

  get effectiveVideoId(): string | undefined {
    return this.data.videoId || this.data.video_id;
  }

  isSaved(): boolean {
    const id = this.effectiveVideoId;
    return !!id && this.favorites.isSaved(id);
  }

  toggleSave(): void {
    const id = this.effectiveVideoId;
    if (!id) {
      this.toast.showToast('error', 'Missing video id');
      return;
    }
    const tags = (this.data.tags && this.data.tags.length
      ? this.data.tags
      : [this.data.genre, this.data.mood]
    ).filter(Boolean) as string[];
    this.favorites
      .toggle({
        videoId: id,
        title: this.data.title,
        thumbnail: this.data.thumbnail,
        url: `https://youtube.com/watch?v=${id}`,
        tags,
        source: 'gallery',
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

  onClose(): void {
    this.dialogRef.close();
  }

  downloadAudio(): void {
    const url = `https://youtube.com/watch?v=${this.data.videoId}`;
    this.dialogRef.close();
    this.router.navigate(['/audio-download'], { queryParams: { url } });
  }

  checkThisSong(): void {
    const id = this.effectiveVideoId;
    const url = id ? `https://youtube.com/watch?v=${id}` : null;
    this.dialogRef.close();
    this.router.navigate(['/home'], url ? { queryParams: { url } } : {});
  }

  formatNumber(num: number): string {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString();
  }
}
