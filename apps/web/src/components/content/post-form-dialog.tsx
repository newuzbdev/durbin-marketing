'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { addHours, format, isToday, startOfHour } from 'date-fns';
import { TriangleAlertIcon, UploadIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  CAPTION_MAX,
  mediaKind,
  POST_TYPE_MEDIA,
  POST_TYPES,
  type ContentPostDto,
  type MediaAssetDto,
  type PostType,
} from '@durbin/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DatePicker } from '@/components/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ApiError } from '@/lib/api';
import { MediaError, prepareMedia } from '@/lib/media';
import { uploadMedia, useCreatePost, useUpdatePost } from '@/lib/queries/content';
import { useInstagramConnection } from '@/lib/queries/instagram';
import { uz } from '@/messages/uz';
import { TYPE_ICON } from './post-chip';

const t = uz.content;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tahrirlash rejimi */
  post?: ContentPostDto | null;
  /** Yangi post uchun tanlangan kun */
  day?: Date | null;
}

function defaultTime(day: Date | null | undefined): Date {
  const base = day ?? new Date();
  if (isToday(base)) return startOfHour(addHours(new Date(), 1));
  const d = new Date(base);
  d.setHours(10, 0, 0, 0);
  return d;
}

export function PostFormDialog({ open, onOpenChange, post, day }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        {/* Har ochilishda forma yangidan boshlanadi */}
        {open && <PostForm post={post} day={day} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function PostForm({ post, day, onDone }: { post?: ContentPostDto | null; day?: Date | null; onDone: () => void }) {
  const ids = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const create = useCreatePost();
  const update = useUpdatePost();
  const instagram = useInstagramConnection();

  const initial = post ? new Date(post.scheduledAt) : defaultTime(day);
  const [type, setType] = useState<PostType>(post?.type ?? 'IMAGE');
  const [title, setTitle] = useState(post?.title ?? '');
  const [caption, setCaption] = useState(post?.caption ?? '');
  const [date, setDate] = useState(format(initial, 'yyyy-MM-dd'));
  const [time, setTime] = useState(format(initial, 'HH:mm'));
  const [autoPublish, setAutoPublish] = useState(post?.autoPublish ?? true);
  const [media, setMedia] = useState<MediaAssetDto | null>(post?.media ?? null);
  const [preview, setPreview] = useState<string | null>(post?.media?.url ?? null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lokal preview URL'ini tozalash
  useEffect(() => {
    return () => {
      if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const mediaMismatch = media && !POST_TYPE_MEDIA[type].includes(mediaKind(media.contentType));
  const saving = create.isPending || update.isPending;
  const uploading = progress !== null;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    // Tanlangan fayl turiga mos bo'lmasa, post turi o'zi almashadi: video → Reel, rasm → Rasm (Story ikkalasini oladi)
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    const nextType: PostType = POST_TYPE_MEDIA[type].includes(kind) ? type : kind === 'video' ? 'REEL' : 'IMAGE';
    if (nextType !== type) setType(nextType);
    try {
      const prepared = await prepareMedia(file, nextType);
      setProgress(0);
      const asset = await uploadMedia(prepared, setProgress);
      setMedia(asset);
      setPreview(URL.createObjectURL(prepared));
    } catch (err) {
      setError(err instanceof MediaError || err instanceof ApiError ? err.message : t.errors.uploadFailed);
    } finally {
      setProgress(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const scheduledAt = new Date(`${date}T${time}`);
    if (!title.trim()) return setError(t.errors.titleRequired);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now()) return setError(t.errors.past);
    if (mediaMismatch) return setError(t.errors.wrongKind[type]);

    const input = {
      type,
      title: title.trim(),
      caption,
      scheduledAt: scheduledAt.toISOString(),
      autoPublish,
      mediaAssetId: media?.id ?? null,
    };
    try {
      if (post) await update.mutateAsync({ id: post.id, ...input });
      else await create.mutateAsync(input);
      toast.success(post ? t.form.saved : t.form.created);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : uz.common.error);
    }
  }

  const mediaHint = type === 'STORY' ? t.form.mediaHintStory : type === 'IMAGE' ? t.form.mediaHintImage : t.form.mediaHintVideo;
  // Har doim ikkala tur tanlanadi — post turi faylga qarab moslashadi
  const accept = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime';

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{post ? t.form.editTitle : t.form.createTitle}</DialogTitle>
      </DialogHeader>

      <div className="grid gap-2">
        <Label>{t.form.type}</Label>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[type]}
          onValueChange={(v: unknown[]) => v[0] && setType(v[0] as PostType)}
          aria-label={t.form.type}
        >
          {POST_TYPES.map((pt) => {
            const Icon = TYPE_ICON[pt];
            return (
              <ToggleGroupItem key={pt} value={pt}>
                <Icon aria-hidden /> {t.types[pt]}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${ids}-title`}>{t.form.title}</Label>
        <Input id={`${ids}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        <p className="text-muted-foreground text-xs">{t.form.titleHint}</p>
      </div>

      <div className="grid gap-2">
        <Label>{t.form.media}</Label>
        {media && preview ? (
          <div className="flex items-start gap-3">
            <MediaPreview url={preview} contentType={media.contentType} className="size-24 rounded-lg" />
            <div className="flex flex-col gap-1.5">
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
                <UploadIcon aria-hidden /> {t.form.replaceFile}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMedia(null);
                  setPreview(null);
                }}
              >
                <XIcon aria-hidden /> {t.form.removeFile}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-20 border-dashed"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            <UploadIcon aria-hidden />
            {uploading ? t.form.uploading(progress ?? 0) : t.form.pickFile}
          </Button>
        )}
        {uploading && media && <p className="text-muted-foreground text-xs">{t.form.uploading(progress ?? 0)}</p>}
        <input
          ref={fileInput}
          type="file"
          accept={accept}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <p className="text-muted-foreground text-xs">{mediaHint}</p>
        {mediaMismatch && <Warning text={t.errors.wrongKind[type]} />}
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={`${ids}-caption`}>{t.form.caption}</Label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {caption.length} / {CAPTION_MAX}
          </span>
        </div>
        <Textarea
          id={`${ids}-caption`}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={CAPTION_MAX}
          rows={5}
          placeholder={t.form.captionHint}
        />
        {type === 'STORY' && <p className="text-muted-foreground text-xs">{t.form.storyCaption}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor={`${ids}-date`}>{t.form.date}</Label>
          <DatePicker id={`${ids}-date`} value={date} onChange={setDate} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${ids}-time`}>{t.form.time}</Label>
          <Input id={`${ids}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </div>
      </div>

      <div className="grid gap-1.5">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="accent-primary size-4"
            checked={autoPublish}
            onChange={(e) => setAutoPublish(e.target.checked)}
          />
          {t.form.autoPublish}
        </label>
        <p className="text-muted-foreground text-xs">{t.form.autoPublishHint}</p>
        {autoPublish && !instagram.isLoading && !instagram.data && <Warning text={t.form.notConnected} />}
        {autoPublish && !media && <Warning text={t.errors.mediaRequired} />}
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{uz.common.cancel}</DialogClose>
        <Button type="submit" disabled={saving || uploading}>
          {saving ? uz.common.loading : t.form.save}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Warning({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
      <TriangleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden />
      {text}
    </p>
  );
}

export function MediaPreview({ url, contentType, className }: { url: string; contentType: string; className?: string }) {
  if (contentType.startsWith('video/')) {
    return <video src={url} className={`bg-muted object-cover ${className ?? ''}`} muted playsInline controls preload="metadata" />;
  }
  // Saqlash domeni (R2) — next/image sozlamasisiz oddiy <img>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={`bg-muted object-cover ${className ?? ''}`} />;
}
