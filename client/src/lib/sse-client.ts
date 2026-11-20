'use client';

import { useEffect, useRef } from 'react';

/** Thin program-activity nudge pushed over SSE. The client refetches on receipt. */
export interface ProgramEventMsg {
  type: 'comment.posted' | 'comment.resolved' | 'program.status';
  programId: string;
  actorUserId: string;
  ts: string;
}

const PROGRAM_EVENT_TYPES = new Set([
  'comment.posted',
  'comment.resolved',
  'program.status',
]);

/**
 * Subscribe to the same-origin SSE proxy (`/api/events`) for the session.
 * Calls `onEvent` for every program nudge; control frames (ping/connected)
 * are ignored. Reconnects automatically with a short backoff.
 */
export function useProgramEvents(onEvent: (event: ProgramEventMsg) => void) {
  const handlerRef = useRef(onEvent);

  useEffect(() => {
    handlerRef.current = onEvent;
  });

  useEffect(() => {
    let source: EventSource | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      source = new EventSource('/api/events');

      source.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as { type?: string };
          if (data?.type && PROGRAM_EVENT_TYPES.has(data.type)) {
            handlerRef.current(data as ProgramEventMsg);
          }
        } catch {
          // Ignore malformed frames.
        }
      };

      source.onerror = () => {
        // The proxy may have ended the upstream; force a fresh connection
        // rather than relying solely on the browser's native retry.
        source?.close();
        if (!closed) retry = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      source?.close();
    };
  }, []);
}
