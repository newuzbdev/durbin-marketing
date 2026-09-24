'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BotIcon,
  CalendarDaysIcon,
  ChevronsUpDownIcon,
  CameraIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MegaphoneIcon,
  TargetIcon,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth';
import { uz } from '@/messages/uz';

const items = [
  { href: '/marketing/dashboard', label: uz.nav.dashboard, icon: LayoutDashboardIcon },
  { href: '/marketing/instagram', label: uz.nav.instagram, icon: CameraIcon },
  { href: '/marketing/ads', label: uz.nav.ads, icon: MegaphoneIcon },
  { href: '/marketing/content', label: uz.nav.content, icon: CalendarDaysIcon },
  { href: '/marketing/goals', label: uz.nav.goals, icon: TargetIcon },
  { href: '/marketing/ai', label: uz.nav.ai, icon: BotIcon },
];

export function MarketingSidebar() {
  const pathname = usePathname();
  const { me, school, selectSchool, logout } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:px-0">
          <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg font-semibold">
            D
          </div>
          <div className="grid leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-semibold">{uz.app.name}</span>
            <span className="text-muted-foreground truncate text-xs">{school?.name}</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{uz.app.section}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    isActive={pathname.startsWith(href)}
                    tooltip={label}
                    render={<Link href={href} />}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-medium">{me?.name}</span>
                  <span className="text-muted-foreground truncate text-xs">{me?.email}</span>
                </div>
                <ChevronsUpDownIcon className="ml-auto" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="min-w-56">
                {me && me.schools.length > 1 && (
                  <>
                    {me.schools.map((s) => (
                      <DropdownMenuItem key={s.id} onClick={() => selectSchool(s.id)}>
                        {s.name}
                        {s.id === school?.id && <span className="text-muted-foreground ml-auto text-xs">✓</span>}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => logout()}>
                  <LogOutIcon />
                  {uz.auth.logout}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
