'use client';

import { useEffect, useRef, useState } from 'react';
import { InfoIcon, SendIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { IgConversationDto } from '@durbin/shared';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtAgo, fmtTime } from '@/lib/format';
import { useConversations, useMessages, useSendMessage } from '@/lib/queries/instagram';
import { cn } from '@/lib/utils';
import { uz } from '@/messages/uz';

const t = uz.instagram.dm;

export function DmTab() {
  const conversations = useConversations(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = conversations.data?.find((c) => c.id === selectedId) ?? null;

  return (
    <Card className="grid h-[calc(100svh-14rem)] min-h-96 grid-cols-1 gap-0 overflow-hidden p-0 md:grid-cols-[18rem_1fr]">
      <aside className={cn('overflow-y-auto border-r', selected && 'hidden md:block')}>
        {conversations.isLoading && (
          <div className="grid gap-2 p-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        )}
        {conversations.data?.length === 0 && <p className="text-muted-foreground p-4 text-sm">{t.empty}</p>}
        <ul>
          {conversations.data?.map((c) => (
            <li key={c.id}>
              <ConversationRow conv={c} active={c.id === selectedId} onClick={() => setSelectedId(c.id)} />
            </li>
          ))}
        </ul>
      </aside>
      <section className={cn('flex min-h-0 flex-col', !selected && 'hidden md:flex')}>
        {selected ? (
          <Chat key={selected.id} conv={selected} onBack={() => setSelectedId(null)} />
        ) : (
          <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">{t.pick}</div>
        )}
      </section>
    </Card>
  );
}

function ConversationRow({ conv, active, onClick }: { conv: IgConversationDto; active: boolean; onClick: () => void }) {
  const unread = conv.unreadCount > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'hover:bg-muted flex w-full items-center gap-3 border-b px-3 py-2.5 text-left',
        active && 'bg-muted',
      )}
    >
      <Avatar>
        {conv.participantAvatar && <AvatarImage src={conv.participantAvatar} alt="" />}
        <AvatarFallback>{conv.participantName.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn('truncate text-sm', unread && 'font-semibold')}>{conv.participantName}</span>
          <span className="text-muted-foreground shrink-0 text-xs">{fmtAgo(conv.lastMessageAt)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={cn('truncate text-xs', unread ? 'text-foreground' : 'text-muted-foreground')}>
            {conv.lastMessagePreview ?? ''}
          </span>
          {unread && (
            <span
              className="bg-destructive flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-medium text-white tabular-nums"
              aria-label={`${conv.unreadCount} ta o'qilmagan`}
            >
              {conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function Chat({ conv, onBack }: { conv: IgConversationDto; onBack: () => void }) {
  const { school } = useAuth();
  const messages = useMessages(conv.id);
  const send = useSendMessage(conv.id);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const canWrite = school?.role !== 'VIEWER';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.data?.length]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const value = text.trim();
    if (!value) return;
    try {
      await send.mutateAsync(value);
      setText('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : uz.common.error);
    }
  }

  return (
    <>
      <header className="flex items-center gap-2 border-b px-4 py-2.5">
        <Button variant="ghost" size="sm" className="md:hidden" onClick={onBack}>
          ←
        </Button>
        <span className="font-medium">{conv.participantName}</span>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <ul className="grid gap-2">
          {messages.data?.map((m) => (
            <li key={m.id} className={cn('flex', m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                  m.direction === 'OUTBOUND' ? 'bg-primary text-primary-foreground' : 'bg-muted',
                )}
              >
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                <span className="mt-0.5 block text-right text-[11px] opacity-70">{fmtTime(m.sentAt)}</span>
              </div>
            </li>
          ))}
        </ul>
        <div ref={bottomRef} />
      </div>
      {conv.canReply ? (
        canWrite && (
          <form onSubmit={submit} className="flex items-end gap-2 border-t p-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder={t.placeholder}
              maxLength={1000}
              rows={1}
              className="max-h-32 min-h-9 resize-none"
            />
            <Button type="submit" disabled={send.isPending || !text.trim()} aria-label={t.send}>
              <SendIcon />
            </Button>
          </form>
        )
      ) : (
        <p className="text-muted-foreground flex items-start gap-2 border-t p-3 text-xs">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t.windowClosed}
        </p>
      )}
    </>
  );
}
