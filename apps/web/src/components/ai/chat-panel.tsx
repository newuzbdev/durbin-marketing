'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquarePlusIcon, SendIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { fmtAgo } from '@/lib/format';
import { useDeleteThread, useSendChat, useThreadMessages, useThreads } from '@/lib/queries/ai';
import { cn } from '@/lib/utils';
import { uz } from '@/messages/uz';

const t = uz.ai.chat;

export function ChatPanel({ canManage }: { canManage: boolean }) {
  const threads = useThreads();
  const [threadId, setThreadId] = useState<string | null>(null);
  const messages = useThreadMessages(threadId);
  const send = useSendChat();
  const remove = useDeleteThread();
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  // Javob kelguncha foydalanuvchi xabari darhol ko'rinib turadi
  const pendingText = send.isPending ? send.variables?.message : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.data?.length, pendingText]);

  function submit(message: string) {
    const value = message.trim();
    if (!value || send.isPending) return;
    setText('');
    send.mutate(
      { threadId: threadId ?? undefined, message: value },
      {
        onSuccess: (res) => setThreadId(res.threadId),
        onError: (err) => {
          setText(value);
          toast.error(err instanceof ApiError ? err.message : uz.common.error);
        },
      },
    );
  }

  const list = threadId ? (messages.data ?? []) : [];
  const empty = list.length === 0 && !pendingText;

  return (
    <Card className="grid h-[calc(100svh-15rem)] min-h-[28rem] grid-cols-1 gap-0 overflow-hidden p-0 md:grid-cols-[16rem_1fr]">
      <aside className="hidden min-h-0 flex-col border-r md:flex" aria-label={t.threads}>
        <div className="border-b p-2">
          <Button variant="outline" size="sm" className="w-full" onClick={() => setThreadId(null)}>
            <MessageSquarePlusIcon /> {t.newChat}
          </Button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {threads.isLoading && <Skeleton className="m-2 h-12" />}
          {threads.data?.map((th) => (
            <li key={th.id} className="group/thread relative">
              <button
                type="button"
                onClick={() => setThreadId(th.id)}
                className={cn('hover:bg-muted grid w-full gap-0.5 border-b px-3 py-2 pr-9 text-left', th.id === threadId && 'bg-muted')}
              >
                <span className="truncate text-sm">{th.title}</span>
                <span className="text-muted-foreground text-xs">{fmtAgo(th.createdAt)}</span>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.deleteThread}
                className="absolute top-2 right-1 opacity-0 group-hover/thread:opacity-100 focus-visible:opacity-100"
                onClick={() =>
                  remove.mutate(th.id, {
                    onSuccess: () => th.id === threadId && setThreadId(null),
                    onError: (err) => toast.error(err instanceof ApiError ? err.message : uz.common.error),
                  })
                }
              >
                <Trash2Icon aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex min-h-0 flex-col">
        <div className="flex items-center justify-end border-b p-2 md:hidden">
          <Button variant="outline" size="sm" onClick={() => setThreadId(null)}>
            <MessageSquarePlusIcon /> {t.newChat}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
          {empty ? (
            <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 text-center">
              <SparklesIcon className="text-muted-foreground size-6" aria-hidden />
              <p className="text-muted-foreground text-sm">{t.empty}</p>
              {canManage && (
                <ul className="flex flex-wrap justify-center gap-2">
                  {t.examples.map((q) => (
                    <li key={q}>
                      <Button variant="outline" size="sm" className="h-auto py-1.5 whitespace-normal" onClick={() => submit(q)}>
                        {q}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <ul className="grid gap-3">
              {list.map((m) => (
                <Bubble key={m.id} role={m.role} text={m.content} />
              ))}
              {pendingText && (
                <>
                  <Bubble role="USER" text={pendingText} />
                  <li className="text-muted-foreground flex items-center gap-2 text-sm">
                    <SparklesIcon className="size-4 animate-pulse" aria-hidden /> {uz.ai.thinking}
                  </li>
                </>
              )}
            </ul>
          )}
          <div ref={bottomRef} />
        </div>
        {canManage ? (
          <form
            className="flex items-end gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit(text);
            }}
          >
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit(text);
                }
              }}
              placeholder={t.placeholder}
              maxLength={4000}
              rows={1}
              className="max-h-32 min-h-9 resize-none"
            />
            <Button type="submit" disabled={send.isPending || !text.trim()} aria-label={t.send}>
              <SendIcon />
            </Button>
          </form>
        ) : (
          <p className="text-muted-foreground border-t p-3 text-xs">{uz.ai.viewerOnly}</p>
        )}
      </section>
    </Card>
  );
}

function Bubble({ role, text }: { role: 'USER' | 'ASSISTANT'; text: string }) {
  const mine = role === 'USER';
  return (
    <li className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words',
          mine ? 'bg-primary text-primary-foreground' : 'bg-muted',
        )}
      >
        <span className="sr-only">{mine ? t.you : t.assistant}: </span>
        {text}
      </div>
    </li>
  );
}
