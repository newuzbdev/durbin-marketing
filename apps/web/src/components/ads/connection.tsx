'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { uz as uzLocale } from 'date-fns/locale';
import { MegaphoneIcon, RefreshCwIcon, UnplugIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { MetaConnectionDto } from '@durbin/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtAgo } from '@/lib/format';
import {
  startAdsOAuth,
  useDisconnectAds,
  usePendingAdAccounts,
  useSelectAdAccount,
  useSyncAds,
} from '@/lib/queries/ads';
import { uz } from '@/messages/uz';

const t = uz.ads;
/** Token tugashiga shuncha qolganda ogohlantiriladi */
const EXPIRY_WARN_MS = 10 * 86_400_000;

export const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : uz.common.error);

export function ConnectAdsCard() {
  const { school } = useAuth();
  const [pending, setPending] = useState(false);
  const canManage = school?.role !== 'VIEWER';

  async function connect() {
    setPending(true);
    try {
      await startAdsOAuth();
    } catch (err) {
      toast.error(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <div className="bg-muted mb-2 flex size-10 items-center justify-center rounded-lg">
          <MegaphoneIcon className="size-5" aria-hidden />
        </div>
        <CardTitle>{t.connectTitle}</CardTitle>
        <CardDescription>{t.connectText}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-xs">{t.connectRequirements}</p>
      </CardContent>
      <CardFooter>
        {canManage ? (
          <Button onClick={connect} disabled={pending}>
            {pending ? uz.common.loading : t.connect}
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm">{t.viewerNoConnect}</p>
        )}
      </CardFooter>
    </Card>
  );
}

export function AdsAccountBar({ connection }: { connection: MetaConnectionDto }) {
  const { school } = useAuth();
  const sync = useSyncAds();
  const disconnect = useDisconnectAds();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const canManage = school?.role !== 'VIEWER';
  // Render toza bo'lishi uchun vaqt bir marta olinadi (sahifa uzoq ochiq turmaydi)
  const [now] = useState(() => Date.now());
  const expiresSoon = connection.expiresAt && new Date(connection.expiresAt).getTime() - now < EXPIRY_WARN_MS;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="grid leading-tight">
        <span className="font-medium">
          {connection.displayName} {connection.currency && <span className="text-muted-foreground font-normal">· {connection.currency}</span>}
        </span>
        <span className="text-muted-foreground text-xs">
          {connection.lastSyncedAt ? `${t.lastSynced}: ${fmtAgo(connection.lastSyncedAt)}` : t.neverSynced}
        </span>
        {expiresSoon && connection.expiresAt && (
          <span className="text-xs text-amber-800 dark:text-amber-300">
            {t.tokenExpires(format(new Date(connection.expiresAt), 'd MMMM', { locale: uzLocale }))}
          </span>
        )}
      </div>
      {canManage && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={sync.isPending}
            onClick={() =>
              sync.mutate(undefined, {
                onSuccess: () => toast.success(t.synced),
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
          >
            <RefreshCwIcon className={sync.isPending ? 'animate-spin' : undefined} />
            {sync.isPending ? t.syncing : t.sync}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)}>
            <UnplugIcon />
            {t.disconnect}
          </Button>
        </div>
      )}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.disconnect}</DialogTitle>
            <DialogDescription>{t.disconnectConfirm}</DialogDescription>
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
                    toast.success(t.disconnected);
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                })
              }
            >
              {t.disconnect}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** OAuth'dan keyin bir nechta reklama akkaunti topilganda */
export function SelectAdAccountDialog({ selectionId, onDone }: { selectionId: string; onDone: () => void }) {
  const accounts = usePendingAdAccounts(selectionId);
  const select = useSelectAdAccount();

  return (
    <Dialog open onOpenChange={(open) => !open && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.selectTitle}</DialogTitle>
          <DialogDescription>{t.selectText}</DialogDescription>
        </DialogHeader>
        {accounts.isLoading && <Skeleton className="h-24" />}
        {accounts.error && <p className="text-destructive text-sm">{errorMessage(accounts.error)}</p>}
        <ul className="grid gap-2">
          {accounts.data?.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                disabled={select.isPending}
                className="hover:bg-muted flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left disabled:opacity-50"
                onClick={() =>
                  select.mutate(
                    { selectionId, adAccountId: a.id },
                    {
                      onSuccess: () => {
                        toast.success(t.connected);
                        onDone();
                      },
                      onError: (err) => toast.error(errorMessage(err)),
                    },
                  )
                }
              >
                <span className="grid leading-tight">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-muted-foreground text-xs">{a.id.replace('act_', '')}</span>
                </span>
                <span className="text-muted-foreground text-xs">{a.currency}</span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
