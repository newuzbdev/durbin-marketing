'use client';

import { useState } from 'react';
import { CameraIcon, InfoIcon, RefreshCwIcon, UnplugIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { MetaConnectionDto } from '@durbin/shared';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  startInstagramOAuth,
  useDisconnectInstagram,
  useMetaMode,
  usePendingAccounts,
  useSelectAccount,
  useSyncInstagram,
} from '@/lib/queries/instagram';
import { uz } from '@/messages/uz';

const t = uz.instagram;

function errorMessage(err: unknown) {
  return err instanceof ApiError ? err.message : uz.common.error;
}

export function MockNotice() {
  const mode = useMetaMode();
  if (mode.data?.mode !== 'mock') return null;
  return (
    <p className="text-muted-foreground mb-4 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs">
      <InfoIcon className="size-3.5 shrink-0" aria-hidden />
      {t.mockNotice}
    </p>
  );
}

export function ConnectCard() {
  const { school } = useAuth();
  const [pending, setPending] = useState(false);
  const canManage = school?.role !== 'VIEWER';

  async function connect() {
    setPending(true);
    try {
      await startInstagramOAuth();
    } catch (err) {
      toast.error(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <div className="bg-muted mb-2 flex size-10 items-center justify-center rounded-lg">
          <CameraIcon className="size-5" aria-hidden />
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

export function AccountBar({ connection }: { connection: MetaConnectionDto }) {
  const { school } = useAuth();
  const sync = useSyncInstagram();
  const disconnect = useDisconnectInstagram();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const canManage = school?.role !== 'VIEWER';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Avatar>
        {connection.avatarUrl && <AvatarImage src={connection.avatarUrl} alt="" />}
        <AvatarFallback>{connection.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="grid leading-tight">
        <span className="font-medium">@{connection.displayName}</span>
        <span className="text-muted-foreground text-xs">
          {connection.lastSyncedAt ? `${t.lastSynced}: ${fmtAgo(connection.lastSyncedAt)}` : t.neverSynced}
        </span>
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

/** OAuth'dan keyin bir nechta IG akkaunt topilganda */
export function SelectAccountDialog({ selectionId, onDone }: { selectionId: string; onDone: () => void }) {
  const accounts = usePendingAccounts(selectionId);
  const select = useSelectAccount();

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
            <li key={a.igUserId}>
              <button
                type="button"
                disabled={select.isPending}
                className="hover:bg-muted flex w-full items-center gap-3 rounded-lg border p-3 text-left disabled:opacity-50"
                onClick={() =>
                  select.mutate(
                    { selectionId, igUserId: a.igUserId },
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
                <Avatar>
                  {a.avatarUrl && <AvatarImage src={a.avatarUrl} alt="" />}
                  <AvatarFallback>{a.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="grid leading-tight">
                  <span className="font-medium">@{a.username}</span>
                  <span className="text-muted-foreground text-xs">{a.pageName}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
