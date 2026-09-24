'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth';
import { uz } from '@/messages/uz';

// Faqat development: seed'dagi demo akkaunt login formasida oldindan to'ldiriladi (pnpm db:seed)
const devLogin =
  process.env.NODE_ENV === 'development' ? { email: 'demo@durbin.uz', password: 'demo12345' } : undefined;

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? '');
    setPending(true);
    try {
      if (mode === 'login') await login({ email: get('email'), password: get('password') });
      else
        await register({
          schoolName: get('schoolName'),
          name: get('name'),
          email: get('email'),
          password: get('password'),
        });
      router.replace('/marketing/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : uz.common.error);
    } finally {
      setPending(false);
    }
  }

  const isLogin = mode === 'login';
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{isLogin ? uz.auth.login : uz.auth.register}</CardTitle>
          <CardDescription>
            {uz.app.name} · {uz.app.section}
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="grid gap-4">
            {!isLogin && (
              <>
                <Field name="schoolName" label={uz.auth.schoolName} />
                <Field name="name" label={uz.auth.name} />
              </>
            )}
            <Field
              name="email"
              label={uz.auth.email}
              type="email"
              autoComplete="email"
              defaultValue={isLogin ? devLogin?.email : undefined}
            />
            <Field
              name="password"
              label={uz.auth.password}
              type="password"
              defaultValue={isLogin ? devLogin?.password : undefined}
              minLength={isLogin ? undefined : 8}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
          </CardContent>
          <CardFooter className="mt-6 flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? uz.common.loading : isLogin ? uz.auth.login : uz.auth.register}
            </Button>
            <p className="text-muted-foreground text-sm">
              {isLogin ? uz.auth.noAccount : uz.auth.haveAccount}{' '}
              <Link className="text-foreground underline" href={isLogin ? '/register' : '/login'}>
                {isLogin ? uz.auth.register : uz.auth.login}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}

function Field({ name, label, ...props }: { name: string; label: string } & React.ComponentProps<'input'>) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} required {...props} />
    </div>
  );
}
