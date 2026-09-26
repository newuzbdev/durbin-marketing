'use client';

import { useState } from 'react';
import { PlusIcon, TargetIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { GoalDto } from '@durbin/shared';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GoalCard } from '@/components/goals/goal-card';
import { GoalFormDialog } from '@/components/goals/goal-form-dialog';
import { LeadFormDialog } from '@/components/goals/lead-form-dialog';
import { LeadsCard } from '@/components/goals/leads-card';
import { LeadSourcesCard } from '@/components/goals/lead-sources-card';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDeleteGoal, useGoals } from '@/lib/queries/goals';
import { uz } from '@/messages/uz';

const t = uz.goals;

export default function GoalsPage() {
  const { school } = useAuth();
  const canManage = school?.role !== 'VIEWER';
  const goals = useGoals();
  const remove = useDeleteGoal();

  const [form, setForm] = useState<{ open: boolean; goal?: GoalDto | null }>({ open: false });
  const [leadOpen, setLeadOpen] = useState(false);
  const [deleting, setDeleting] = useState<GoalDto | null>(null);

  const current = goals.data?.filter((g) => g.status === 'active' || g.status === 'upcoming') ?? [];
  const finished = goals.data?.filter((g) => g.status === 'achieved' || g.status === 'missed') ?? [];

  const grid = (list: GoalDto[], empty: string, withCta = false) =>
    goals.isLoading ? (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-56" />
        ))}
      </div>
    ) : list.length ? (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((g) => (
          <GoalCard
            key={g.id}
            goal={g}
            canManage={canManage}
            onEdit={(goal) => setForm({ open: true, goal })}
            onDelete={setDeleting}
          />
        ))}
      </div>
    ) : (
      <div className="text-muted-foreground flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center text-sm">
        <TargetIcon className="size-6" aria-hidden />
        {empty}
        {withCta && canManage && (
          <Button variant="outline" size="sm" onClick={() => setForm({ open: true, goal: null })}>
            <PlusIcon aria-hidden /> {t.newGoal}
          </Button>
        )}
      </div>
    );

  return (
    <>
      <PageHeader
        title={uz.nav.goals}
        description={t.description}
        actions={
          canManage && (
            <Button onClick={() => setForm({ open: true, goal: null })}>
              <PlusIcon aria-hidden /> {t.newGoal}
            </Button>
          )
        }
      />

      <Tabs defaultValue="current" className="mb-8">
        <TabsList className="mb-4">
          <TabsTrigger value="current">
            {t.tabs.current} {goals.data && <span className="text-muted-foreground tabular-nums">{current.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="finished">
            {t.tabs.finished} {goals.data && <span className="text-muted-foreground tabular-nums">{finished.length}</span>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="current">{grid(current, t.empty, true)}</TabsContent>
        <TabsContent value="finished">{grid(finished, t.emptyFinished)}</TabsContent>
      </Tabs>

      {/* Katta ekranda: lidlar jadvali chapda, manbalar o'ngda */}
      <div className="grid items-start gap-4 xl:grid-cols-3">
        <LeadsCard canManage={canManage} onAdd={() => setLeadOpen(true)} className="min-w-0 xl:col-span-2" />
        <LeadSourcesCard canManage={canManage} />
      </div>

      <GoalFormDialog open={form.open} goal={form.goal} onOpenChange={(open) => setForm((f) => ({ ...f, open }))} />
      <LeadFormDialog open={leadOpen} onOpenChange={setLeadOpen} />

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.delete}</DialogTitle>
            <DialogDescription>{deleting && t.deleteConfirm(deleting.name)}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{uz.common.cancel}</DialogClose>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                deleting &&
                remove.mutate(deleting.id, {
                  onSuccess: () => {
                    setDeleting(null);
                    toast.success(t.deleted);
                  },
                  onError: (err) => toast.error(err instanceof ApiError ? err.message : uz.common.error),
                })
              }
            >
              {t.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
