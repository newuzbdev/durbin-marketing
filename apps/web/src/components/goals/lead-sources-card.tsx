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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ApiError } from '@/lib/api';
import {
  useConnectTelegram,
  useDisconnectTelegram,
  useLeadSources,
  useSetInstagramAutoLeads,
} from '@/lib/queries/goals';
import { cn } from '@/lib/utils';
import { uz } from '@/messages/uz';

const t = uz.goals.sources;
const errorText = (err: unknown) => (err instanceof ApiError ? err.message : uz.common.error);

export function LeadSourcesCard({ canManage, className }: { canManage: boolean; className?: string }) {
  const sources = useLeadSources();

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {sources.isLoading || !sources.data ? (
          <>
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </>
        ) : (
          <>
            <InstagramSource
              connected={sources.data.instagram.connected}
              autoLeads={sources.data.instagram.autoLeads}
              canManage={canManage}
            />
            <Separator />
            <TelegramSource bot={sources.data.telegram} canManage={canManage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Manba sarlavhasi: ikonka, nom va holat belgisi bir qatorda */
function SourceHeader({
  icon: Icon,
  title,
  status,
  on,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  status: string;
  on: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <span className={cn('size-1.5 rounded-full', on ? 'bg-emerald-500' : 'bg-muted-foreground/40')} aria-hidden />
          {status}
        </p>
      </div>
      {children}
    </div>
  );
}

function InstagramSource({ connected, autoLeads, canManage }: { connected: boolean; autoLeads: boolean; canManage: boolean }) {
  const set = useSetInstagramAutoLeads();
  const id = useId();

  if (!connected) {
    return (
      <section className="grid gap-3">
        <SourceHeader icon={CameraIcon} title={t.instagram.title} status={t.notConnected} on={false}>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/marketing/instagram" />}>
            {t.connect}
          </Button>
        </SourceHeader>
      </section>
    );
  }

  return (
    <section className="grid gap-3">
      <SourceHeader
        icon={CameraIcon}
        title={t.instagram.title}
        status={autoLeads ? t.instagram.on : t.instagram.off}
        on={autoLeads}
      >
        <Switch
          id={id}
          aria-label={t.instagram.auto}
          checked={autoLeads}
          disabled={!canManage || set.isPending}
          onCheckedChange={(checked) =>
            set.mutate(checked, {
              onSuccess: (_, enabled) => toast.success(enabled ? t.instagram.enabled : t.instagram.disabled),
              onError: (err) => toast.error(errorText(err)),
            })
          }
        />
      </SourceHeader>
      <p className="text-muted-foreground text-xs">{t.instagram.autoHint}</p>
      <Link
        href="/marketing/instagram?tab=dm"
        className="text-foreground inline-flex w-fit items-center gap-1 text-xs font-medium hover:underline"
      >
        {t.instagram.openDm} <ExternalLinkIcon className="size-3" aria-hidden />
      </Link>
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
  const disconnect = useDisconnectTelegram();
  const [connectOpen, setConnectOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const healthy = !!bot && !bot.lastError;

  return (
    <section className="grid gap-3">
      <SourceHeader
        icon={SendIcon}
        title={t.telegram.title}
        status={bot ? (bot.lastError ? t.telegram.broken : t.telegram.active) : t.notConnected}
        on={healthy}
      >
        {canManage && (!bot || bot.lastError) && (
          <Button variant={bot ? 'default' : 'outline'} size="sm" onClick={() => setConnectOpen(true)}>
            {bot ? t.telegram.reconnect : t.telegram.connect}
          </Button>
        )}
      </SourceHeader>

      {bot ? (
        <div className="flex items-center gap-1 rounded-lg border py-1 pr-1 pl-3">
          <a
            href={bot.link}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
          >
            @{bot.username}
          </a>
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
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setConfirmOpen(true)}>
              {t.telegram.disconnect}
            </Button>
          )}
        </div>
      ) : null}

      {bot?.lastError && (
        <p role="alert" className="text-destructive flex items-start gap-1.5 text-xs">
          <CircleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden /> {bot.lastError}
        </p>
      )}
      <p className="text-muted-foreground text-xs">{t.telegram.how}</p>

      <ConnectTelegramDialog open={connectOpen} onOpenChange={setConnectOpen} />

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

/** Token kiritish — qadamlar bilan alohida oynada, kartochka ixcham qoladi */
function ConnectTelegramDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const connect = useConnectTelegram();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  function change(next: boolean) {
    if (!next) {
      setToken('');
      setError(null);
    }
    onOpenChange(next);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await connect.mutateAsync(token.trim());
      toast.success(t.telegram.connected);
      change(false);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t.telegram.connectTitle}</DialogTitle>
            <DialogDescription>{t.telegram.how}</DialogDescription>
          </DialogHeader>
          <ol className="grid gap-2 text-sm">
            {t.telegram.steps.map((s, i) => (
              <li key={s} className="flex gap-2.5">
                <span className="bg-muted flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
          <div className="grid gap-2">
            <Label htmlFor={id}>{t.telegram.tokenLabel}</Label>
            <Input
              id={id}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456789:AAH..."
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!!error}
              className="font-mono text-xs"
            />
            {error ? (
              <p role="alert" className="text-destructive text-xs">
                {error}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">{t.telegram.privacy}</p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{uz.common.cancel}</DialogClose>
            <Button type="submit" disabled={!token.trim() || connect.isPending}>
              {connect.isPending ? uz.common.loading : t.telegram.connect}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
