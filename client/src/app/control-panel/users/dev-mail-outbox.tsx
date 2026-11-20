'use client';

import { useState } from 'react';
import { Check, Copy, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { DevMailOutboxItem } from '@/lib/api';

function formatMessageType(type: string) {
  return type
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

interface DevMailOutboxProps {
  items: DevMailOutboxItem[];
}

export default function DevMailOutbox({ items }: Readonly<DevMailOutboxProps>) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyValue(item: DevMailOutboxItem) {
    if (!item.copyValue) return;
    await navigator.clipboard.writeText(item.copyValue);
    setCopiedId(item.id);
    window.setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <Mail className="h-4 w-4 text-neutral-500" />
        <h2 className="text-base font-semibold text-neutral-900">
          Dev mail outbox
        </h2>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recipient</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Timestamp</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-neutral-400"
                >
                  No captured mail yet.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-48 break-all text-neutral-700">
                    {item.to}
                  </TableCell>
                  <TableCell className="max-w-72 text-neutral-700">
                    {item.subject}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {formatMessageType(item.messageType)}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-neutral-600">
                    {formatTimestamp(item.timestamp)}
                  </TableCell>
                  <TableCell>
                    {item.copyValue ? (
                      <div className="flex max-w-96 items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-700">
                          {item.copyValue}
                        </code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          title="Copy value"
                          onClick={() => void copyValue(item)}
                        >
                          {copiedId === item.id ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                          <span className="sr-only">Copy value</span>
                        </Button>
                      </div>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
