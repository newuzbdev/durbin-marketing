'use client';

import { useId, useState } from 'react';
import { CopyIcon, RefreshCwIcon, SparklesIcon } from 'lucide-react';
import { toast } from 'sonner';
import { POST_TYPES, type AiScriptDto, type PostType } from '@durbin/shared';
import { SyncBanner } from '@/components/sync-banner';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ApiError } from '@/lib/api';
import { useWriteScript } from '@/lib/queries/ai';
import { uz } from '@/messages/uz';

const t = uz.ai.script;

function copyText(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(t.copied),
    () => toast.error(uz.common.error),
  );
}

export function ScriptPanel({ canManage }: { canManage: boolean }) {
  const id = useId();
  const write = useWriteScript();
  const [prompt, setPrompt] = useState('');
  const [postType, setPostType] = useState<PostType>('REEL');
  const [result, setResult] = useState<AiScriptDto | null>(null);

  function run(previous?: AiScriptDto) {
    write.mutate(
      {
        prompt: prompt.trim(),
        postType,
        // "Qayta yoz": AI oldingi variantni ko'rib, boshqacha yozadi
        previous: previous ? JSON.stringify(previous) : undefined,
      },
      {
        onSuccess: setResult,
        onError: (err) => toast.error(err instanceof ApiError ? err.message : uz.common.error),
      },
    );
  }

  return (
    <div className="grid gap-4">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (prompt.trim().length >= 3) run();
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor={id}>{t.promptLabel}</Label>
          <Textarea
            id={id}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t.promptPlaceholder}
            rows={3}
            maxLength={2000}
          />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-2">
            <Label>{t.type}</Label>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              value={[postType]}
              onValueChange={(v: unknown[]) => v[0] && setPostType(v[0] as PostType)}
              aria-label={t.type}
            >
              {POST_TYPES.map((pt) => (
                <ToggleGroupItem key={pt} value={pt}>
                  {uz.content.types[pt]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          {canManage && (
            <div className="flex gap-2">
              {result && (
                <Button type="button" variant="outline" disabled={write.isPending} onClick={() => run(result)}>
                  <RefreshCwIcon className={write.isPending ? 'animate-spin' : undefined} /> {t.rewrite}
                </Button>
              )}
              <Button type="submit" disabled={write.isPending || prompt.trim().length < 3}>
                <SparklesIcon /> {t.write}
              </Button>
            </div>
          )}
        </div>
      </form>

      {write.isPending && <SyncBanner text={uz.ai.thinking} />}

      {result && (
        <div className={write.isPending ? 'grid gap-4 opacity-50' : 'grid gap-4'}>
          <Card>
            <CardHeader>
              <CardTitle>{t.caption}</CardTitle>
              <CardAction>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyText(`${result.caption}\n\n${result.hashtags.join(' ')}`)}
                >
                  <CopyIcon /> {t.copy}
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-3">
              <p className="text-sm whitespace-pre-wrap">{result.caption}</p>
              <ul className="flex flex-wrap gap-1.5" aria-label={t.hashtags}>
                {result.hashtags.map((h) => (
                  <li key={h} className="bg-muted rounded-md px-1.5 py-0.5 text-xs">
                    {h}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.scenes}</CardTitle>
              <CardAction>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyText(result.scenes.map((s) => `${s.time} — ${s.visual}\n${s.text}`).join('\n\n'))}
                >
                  <CopyIcon /> {t.copy}
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">{t.time}</TableHead>
                    <TableHead>{t.visual}</TableHead>
                    <TableHead>{t.text}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.scenes.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell className="align-top whitespace-nowrap tabular-nums">{s.time}</TableCell>
                      <TableCell className="min-w-48 align-top whitespace-normal">{s.visual}</TableCell>
                      <TableCell className="min-w-48 align-top font-medium whitespace-normal">{s.text}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
