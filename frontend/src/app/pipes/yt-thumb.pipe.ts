import { Pipe, PipeTransform } from '@angular/core';

type YouTubeThumbQuality =
  | 'default'
  | 'mqdefault'
  | 'hqdefault'
  | 'sddefault'
  | 'maxresdefault';

@Pipe({ name: 'ytThumb', standalone: false })
export class YtThumbPipe implements PipeTransform {
  transform(
    url: string | null | undefined,
    quality: YouTubeThumbQuality = 'sddefault'
  ): string {
    if (!url) return '';
    if (!/i\.ytimg\.com\/vi\//.test(url)) return url;
    return url.replace(
      /\/(default|mqdefault|hqdefault|sddefault|maxresdefault)\.jpg/,
      `/${quality}.jpg`
    );
  }
}
