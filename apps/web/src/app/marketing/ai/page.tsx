'use client';

import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CircleAlertIcon } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChatPanel } from '@/components/ai/chat-panel';
import { InsightsPanel } from '@/components/ai/insights-panel';
import { ScriptPanel } from '@/components/ai/script-panel';
import { useAuth } from '@/lib/auth';
import { useAiStatus } from '@/lib/queries/ai';
import { uz } from '@/messages/uz';

const t = uz.ai;
const TABS = ['analysis', 'suggestions', 'script', 'chat'] as const;
type Tab = (typeof TABS)[number];

export default function AiPage() {
  // useSearchParams statik prerender'da Suspense talab qiladi
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <AiView />
    </Suspense>
  );
}

function AiView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { school } = useAuth();
  const canManage = school?.role !== 'VIEWER';
  const status = useAiStatus();
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'analysis';

  return (
    <>
      <PageHeader title={uz.nav.ai} description={t.description} />

      {status.data && !status.data.configured && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden /> {t.notConfigured}
        </p>
      )}

      <Tabs
        value={tab}
        onValueChange={(v) => router.replace(v === 'analysis' ? pathname : `${pathname}?tab=${v}`, { scroll: false })}
      >
        <TabsList className="mb-4 flex-wrap">
          {TABS.map((k) => (
            <TabsTrigger key={k} value={k}>
              {t.tabs[k]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="analysis">
          <InsightsPanel kind="ANALYSIS" canManage={canManage} />
        </TabsContent>
        <TabsContent value="suggestions">
          <InsightsPanel kind="CONTENT_SUGGESTION" canManage={canManage} />
        </TabsContent>
        <TabsContent value="script">
          <ScriptPanel canManage={canManage} />
        </TabsContent>
        <TabsContent value="chat">
          <ChatPanel canManage={canManage} />
        </TabsContent>
      </Tabs>
    </>
  );
}
