'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { CameraIcon, CircleAlertIcon, CopyIcon, ExternalLinkIcon, SendIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import {
  useConnectTelegram,
  useDisconnectTelegram,
  useLeadSources,
  useSetInstagramAutoLeads,
} from '@/lib/queries/goals';
import { uz } from '@/messages/uz';

const t = uz.goals.sources;
const errorText = (err: unknown) => (err instanceof ApiError ? err.message : uz.common.error);

export function LeadSourcesCard({ canManage }: { canManage: boolean }) {
  const sources = useLeadSources();

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        {sources.isLoading || !sources.data ? (
          <>
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </>
        ) : (
          <>
            <InstagramSource
              connected={sources.data.instagram.connected}
              autoLeads={sources.data.instagram.autoLeads}
              canManage={canManage}
            />
            <TelegramSource bot={sources.data.telegram} canManage={canManage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SourceTitle({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 font-medium">
      <span className="bg-muted flex size-8 items-center justify-center rounded-lg">
        <Icon className="size-4" aria-hidden />
      </span>
      {children}
    </h3>
  );
}

function InstagramSource({ connected, autoLeads, canManage }: { connected: boolean; autoLeads: boolean; canManage: boolean }) {
  const set = useSetInstagramAutoLeads();
  const id = useId();

  return (
    <section className="grid content-start gap-3">
      <SourceTitle icon={CameraIcon}>{t.instagram.title}</SourceTitle>
      {connected ? (
        <>
          <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
            <input
              id={id}
              type="checkbox"
              className="accent-primary size-4"
              checked={autoLeads}
              disabled={!canManage || set.isPending}
              onChange={(e) =>
                set.mutate(e.target.checked, {
                  onSuccess: (_, enabled) => toast.success(enabled ? t.instagram.enabled : t.instagram.disabled),
                  onError: (err) => toast.error(errorText(err)),
                })
              }
            />
            {t.instagram.auto}
          </label>
          <p className="text-muted-foreground text-xs">{t.instagram.autoHint}</p>
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            nativeButton={false}
            render={<Link href="/marketing/instagram?tab=dm" />}
          >
            {t.instagram.openDm}
          </Button>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          {t.instagram.notConnected}{' '}
          <Link href="/marketing/instagram" className="text-foreground underline">
            {uz.nav.instagram}
          </Link>
        </p>
      )}
    </section>
  );
}

function TelegramSource({
  bot,
  canManage,
}: {
  bot: { username: string; link: string; lastError: string | null } | null;
  canManage: boolean;
}) {
  const connect = useConnectTelegram();
  const disconnect = useDisconnectTelegram();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const id = useId();

  async function onConnect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await connect.mutateAsync(token.trim());
      setToken('');
      toast.success(t.telegram.connected);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <section className="grid content-start gap-3">
      <SourceTitle icon={SendIcon}>{t.telegram.title}</SourceTitle>
      <p className="text-muted-foreground text-xs">{t.telegram.how}</p>

      {bot && (
        <div className="grid gap-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <a href={bot.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium hover:underline">
              @{bot.username} <ExternalLinkIcon className="size-3.5" aria-hidden />
            </a>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.telegram.copy}
                onClick={() =>
                  navigator.clipboard.writeText(bot.link).then(
                    () => toast.success(t.telegram.copied),
                    () => toast.error(uz.common.error),
                  )
                }
              >
                <CopyIcon aria-hidden />
              </Button>
              {canManage && (
                <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)}>
                  {t.telegram.disconnect}
                </Button>
              )}
            </div>
          </div>
          {bot.lastError && (
            <p role="alert" className="text-destructive flex items-start gap-1.5 text-xs">
              <CircleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden /> {bot.lastError}
            </p>
          )}
        </div>
      )}

      {/* Ulanmagan bo'lsa yoki token bekor qilingan bo'lsa — yangi token kiritish */}
      {canManage && (!bot || bot.lastError) && (
        <form onSubmit={onConnect} className="grid gap-2">
          {!bot && (
            <ol className="text-muted-foreground list-decimal space-y-0.5 pl-4 text-xs">
              {t.telegram.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
          <Label htmlFor={id}>{t.telegram.tokenLabel}</Label>
          <div className="flex gap-2">
            <Input
              id={id}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456789:AAH..."
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
            />
            <Button type="submit" disabled={!token.trim() || connect.isPending}>
              {connect.isPending ? uz.common.loading : t.telegram.connect}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          )}
          <p className="text-muted-foreground text-xs">{t.telegram.privacy}</p>
        </form>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.telegram.disconnect}</DialogTitle>
            <DialogDescription>{t.telegram.disconnectConfirm}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{uz.common.cancel}</DialogClose>
            <Button
              variant="destructive"
              disabled={disconnect.isPending}
              onClick={() =>
                disconnect.mutate(undefined, {
                  onSuccess: () => {
                    setConfirmOpen(false);
                    toast.success(t.telegram.disconnected);
                  },
                  onError: (err) => toast.error(errorText(err)),
                })
              }
            >
              {t.telegram.disconnect}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
