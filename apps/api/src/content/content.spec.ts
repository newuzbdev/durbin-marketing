import { uploadRequestSchema } from '@durbin/shared';
import { containerBody } from '../meta/graph-meta-client.js';
import { MetaApiError } from '../meta/meta-client.js';
import { publishErrorMessage } from './content-publisher.service.js';

describe('containerBody (Instagram Content Publishing)', () => {
  const base = { mediaUrl: 'https://cdn.test/a', caption: 'Salom' };

  it('rasm posti: image_url + caption, media_type yo‘q', () => {
    expect(containerBody({ ...base, postType: 'IMAGE', isVideo: false })).toEqual({
      image_url: 'https://cdn.test/a',
      caption: 'Salom',
    });
  });

  it('video va reel REELS sifatida, feed’da ham ko‘rinadi', () => {
    for (const postType of ['VIDEO', 'REEL'] as const) {
      expect(containerBody({ ...base, postType, isVideo: true })).toEqual({
        media_type: 'REELS',
        video_url: 'https://cdn.test/a',
        caption: 'Salom',
        share_to_feed: true,
      });
    }
  });

  it('story: STORIES, caption yuborilmaydi', () => {
    expect(containerBody({ ...base, postType: 'STORY', isVideo: false })).toEqual({
      media_type: 'STORIES',
      image_url: 'https://cdn.test/a',
    });
    expect(containerBody({ ...base, postType: 'STORY', isVideo: true })).toEqual({
      media_type: 'STORIES',
      video_url: 'https://cdn.test/a',
    });
  });
});

describe('publishErrorMessage', () => {
  it('token xatosi → qayta ulash', () => {
    expect(publishErrorMessage(new MetaApiError('x', 400, 190))).toContain('qayta ulang');
  });

  it('limit xatosi', () => {
    expect(publishErrorMessage(new MetaApiError('x', 400, 9))).toContain('limiti');
  });

  it('boshqa Meta xatosi matni saqlanadi', () => {
    expect(publishErrorMessage(new MetaApiError('Bad image', 400, 36003))).toBe('Instagram xatosi: Bad image');
  });
});

describe('uploadRequestSchema', () => {
  it('PNG rad etiladi (Instagram faqat JPEG qabul qiladi)', () => {
    expect(uploadRequestSchema.safeParse({ fileName: 'a.png', contentType: 'image/png', size: 10 }).success).toBe(false);
  });

  it('hajm turiga qarab cheklanadi', () => {
    const mb = 1024 * 1024;
    expect(uploadRequestSchema.safeParse({ fileName: 'a.jpg', contentType: 'image/jpeg', size: 9 * mb }).success).toBe(
      false,
    );
    expect(uploadRequestSchema.safeParse({ fileName: 'a.mp4', contentType: 'video/mp4', size: 9 * mb }).success).toBe(
      true,
    );
  });
});
