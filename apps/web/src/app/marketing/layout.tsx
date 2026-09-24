'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MarketingSidebar } from '@/components/marketing-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';

export default function MarketingLayout({ children }: LayoutProps<'/marketing'>) {
  const { me, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !me) router.replace('/login');
  }, [isLoading, me, router]);

  if (!me) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <MarketingSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
        </header>
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
