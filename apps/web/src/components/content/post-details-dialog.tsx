'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { uz as uzLocale } from 'date-fns/locale';
import { CheckIcon, ExternalLinkIcon, PencilIcon, SendIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import type { ContentPostDto } from '@durbin/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiError } from '@/lib/api';
import { useDeletePost, useMarkPublished, usePublishNow } from '@/lib/queries/content';
import { uz } from '@/messages/uz';
import { MediaPreview } from './post-form-dialog';
import { StatusBadge, TYPE_ICON } from './post-chip';

const t = uz.content;
const fmtFull = (iso: string) => format(new Date(iso), 'd MMMM yyyy, HH:mm', { locale: uzLocale });

interface Props {
  post: ContentPostDto | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: (post: ContentPostDto) => void;
}

export function PostDetailsDialog({ post, canManage, onClose, onEdit }: Props) {
  return (
    <Dialog open={!!post} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        {post && <Details post={post} canManage={canManage} onClose={onClose} onEdit={onEdit} />}
      </DialogContent>
    </Dialog>
  );
}

function Details({ post, canManage, onClose, onEdit }: Props & { post: ContentPostDto }) {
  const publish = usePublishNow();
  const mark = useMarkPublished();
  const remove = useDeletePost();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const TypeIcon = TYPE_ICON[post.type];

  const editable = post.status !== 'PUBLISHED' && post.status !== 'PUBLISHING';
  const retry = post.status === 'FAILED' || post.status === 'MISSED';
  const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : uz.common.error);

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <StatusBadge status={post.status} />
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <TypeIcon className="size-3.5" aria-hidden /> {t.types[post.type]}
          </span>
        </div>
        <DialogTitle className="text-base">{post.title}</DialogTitle>
        <DialogDescription>
          {t.details.scheduledAt}: {fmtFull(post.scheduledAt)}
        </DialogDescription>
      </DialogHeader>

      {post.error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/60 dark:text-red-100">
          {post.error}
        </p>
      )}

      {post.media ? (
        <MediaPreview url={post.media.url} contentType={post.media.contentType} className="max-h-80 w-full rounded-lg object-contain" />
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-sm">{t.details.noMedia}</p>
      )}

      <p className="text-sm whitespace-pre-wrap">
        {post.caption || <span className="text-muted-foreground">{t.details.noCaption}</span>}
      </p>

      <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt>{t.details.createdBy}</dt>
        <dd className="text-foreground">{post.createdBy.name}</dd>
        {post.publishedAt && (
          <>
            <dt>{t.details.publishedAt}</dt>
            <dd className="text-foreground">{fmtFull(post.publishedAt)}</dd>
          </>
        )}
        {!post.autoPublish && (
          <>
            <dt />
            <dd>{t.details.autoPublishOff}</dd>
          </>
        )}
      </dl>

      {post.permalink && (
        <a
          href={post.permalink}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ExternalLinkIcon className="size-3.5" aria-hidden /> {t.details.openInstagram}
        </a>
      )}

      {canManage && (
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          {confirmDelete ? (
            <div className="flex w-full flex-col gap-2">
              <p className="text-sm">{t.details.deleteConfirm}</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                  {uz.common.cancel}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate(post.id, {
                      onSuccess: () => {
                        toast.success(t.details.deleted);
                        onClose();
                      },
                      onError,
                    })
                  }
                >
                  {t.details.delete}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={post.status === 'PUBLISHING'}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2Icon aria-hidden /> {t.details.delete}
              </Button>
              {editable && (
                <div className="flex flex-wrap gap-2">
                  {(!post.autoPublish || post.status === 'MISSED') && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={mark.isPending}
                      onClick={() =>
                        mark.mutate(post.id, {
                          onSuccess: () => {
                            toast.success(t.details.marked);
                            onClose();
                          },
                          onError,
                        })
                      }
                    >
                      <CheckIcon aria-hidden /> {t.details.markPublished}
                    </Button>
                  )}
                  {post.media && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={publish.isPending}
                      onClick={() =>
                        publish.mutate(post.id, {
                          onSuccess: () => {
                            toast.success(t.details.queued);
                            onClose();
                          },
                          onError,
                        })
                      }
                    >
                      <SendIcon aria-hidden /> {retry ? t.details.retry : t.details.publishNow}
                    </Button>
                  )}
                  <Button size="sm" onClick={() => onEdit(post)}>
                    <PencilIcon aria-hidden /> {t.details.edit}
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogFooter>
      )}
    </>
  );
}
