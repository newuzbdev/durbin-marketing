import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, POST_TYPE_MEDIA, type PostType } from '@durbin/shared';
import { uz } from '@/messages/uz';

const e = uz.content.errors;
/** Instagram feed rasmi: 4:5 (0.8) dan 1.91:1 gacha */
const MIN_RATIO = 0.8;
const MAX_RATIO = 1.91;
const MAX_SIDE = 2048;
const VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
const DURATION: Record<PostType, [number, number]> = { IMAGE: [0, 0], VIDEO: [3, 900], REEL: [3, 900], STORY: [3, 60] };

export class MediaError extends Error {}

/**
 * Faylni Instagram talablariga tekshiradi va kerak bo'lsa tayyorlaydi:
 * rasm JPEG'ga o'tkaziladi (API faqat JPEG qabul qiladi), juda katta bo'lsa kichraytiriladi.
 */
export async function prepareMedia(file: File, type: PostType): Promise<File> {
  const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null;
  if (!kind) throw new MediaError(e.unsupported);
  if (!POST_TYPE_MEDIA[type].includes(kind)) throw new MediaError(e.wrongKind[type]);
  return kind === 'image' ? prepareImage(file, type) : prepareVideo(file, type);
}

async function prepareImage(file: File, type: PostType): Promise<File> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new MediaError(e.unsupported); // masalan HEIC — Chrome ocha olmaydi
  });
  try {
    const ratio = bitmap.width / bitmap.height;
    if (type === 'IMAGE' && (ratio < MIN_RATIO - 0.005 || ratio > MAX_RATIO + 0.005)) {
      throw new MediaError(e.imageRatio(`${bitmap.width}×${bitmap.height}`));
    }
    const needsResize = Math.max(bitmap.width, bitmap.height) > MAX_SIDE;
    if (file.type === 'image/jpeg' && file.size <= MAX_IMAGE_BYTES && !needsResize) return file;

    const scale = needsResize ? MAX_SIDE / Math.max(bitmap.width, bitmap.height) : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; // PNG shaffofligi JPEG'da qora bo'lib qolmasin
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) throw new MediaError(e.unsupported);
    if (blob.size > MAX_IMAGE_BYTES) throw new MediaError(e.imageTooBig);
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}

async function prepareVideo(file: File, type: PostType): Promise<File> {
  if (!VIDEO_TYPES.includes(file.type)) throw new MediaError(e.unsupported);
  if (file.size > MAX_VIDEO_BYTES) throw new MediaError(e.videoTooBig);
  const duration = await videoDuration(file);
  const [min, max] = DURATION[type];
  // Davomiylikni o'qib bo'lmasa (ba'zi MOV kodeklar) — tekshiruvni Instagram'ga qoldiramiz
  if (duration !== null && (duration < min || duration > max)) throw new MediaError(e.videoDuration(min, max));
  return file;
}

function videoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}
