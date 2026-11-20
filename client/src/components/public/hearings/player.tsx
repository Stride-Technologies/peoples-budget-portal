'use client';

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Play } from 'lucide-react';
import { posterUrl, sourceOf, type SessionEntry } from '@/lib/hearings/format';

export interface PlayerHandle {
  /** Jump to `t` seconds and play. Loads YouTube's player the first time. */
  seek(t: number): void;
  /** Seconds played so far, or null while nothing is loaded. */
  time(): number | null;
}

interface YouTubePlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  getCurrentTime(): number;
  destroy(): void;
}
interface YouTubeApi {
  Player: new (el: HTMLElement, options: Record<string, unknown>) => YouTubePlayer;
}
declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youTubeApi: Promise<YouTubeApi> | null = null;
/** YouTube's player script, asked for once and only when a visitor first plays a video. */
function loadYouTube(): Promise<YouTubeApi> {
  youTubeApi ??= new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const earlier = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      earlier?.();
      resolve(window.YT!);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    document.head.append(script);
  });
  return youTubeApi;
}

/**
 * A session's video behind one interface. A YouTube session shows its poster until the visitor
 * plays it or picks a line: nothing of YouTube's loads before that, and the player is the
 * cookie-less one. A `file` session plays the API's own copy in a plain <video>.
 */
export function Player({
  ref,
  apiUrl,
  session,
  start,
  labels,
}: {
  ref: Ref<PlayerHandle>;
  apiUrl: string;
  session: Pick<SessionEntry, 'id' | 'source' | 'title'>;
  start: number;
  labels: { play: string; unavailable: string };
}) {
  const isFile = sourceOf(session) === 'file';
  const video = useRef<HTMLVideoElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const youTube = useRef<YouTubePlayer | null>(null);
  // False: poster only. True: YouTube's player has been asked for.
  const [asked, setAsked] = useState(false);
  const [missing, setMissing] = useState(false);
  // Where to start once the player is ready: the page's `?t=`, or the line picked while it loaded.
  const wanted = useRef(start);

  useEffect(() => {
    if (isFile || !asked || !mount.current) return;
    let gone = false;
    let player: YouTubePlayer | null = null;
    // YouTube replaces the element it is given with an iframe, so it gets one React does not manage.
    const target = mount.current.appendChild(document.createElement('div'));
    void loadYouTube().then((YT) => {
      if (gone) return;
      player = new YT.Player(target, {
        host: 'https://www.youtube-nocookie.com',
        videoId: session.id,
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, playsinline: 1, autoplay: 1, start: Math.floor(wanted.current) },
        events: {
          onReady: () => {
            youTube.current = player;
            player!.seekTo(wanted.current, true);
          },
        },
      });
    });
    return () => {
      gone = true;
      youTube.current = null;
      player?.destroy();
      target.remove();
    };
  }, [isFile, session.id, asked]);

  // A file's address is set after the page is live: set in the markup, a missing file's error
  // event fires before React is listening and the "not here" message never shows.
  const fileSrc = `${apiUrl}/video/${encodeURIComponent(session.id)}.mp4${start ? `#t=${Math.floor(start)}` : ''}`;
  useEffect(() => {
    if (isFile && video.current) video.current.src = fileSrc;
  }, [isFile, fileSrc]);

  useImperativeHandle(
    ref,
    () => ({
      seek(t) {
        if (isFile) {
          if (!video.current) return;
          video.current.currentTime = t;
          void video.current.play().catch(() => {});
        } else if (youTube.current) {
          youTube.current.seekTo(t, true);
          youTube.current.playVideo();
        } else {
          wanted.current = t;
          setAsked(true);
        }
      },
      time() {
        if (isFile) return video.current && !missing ? video.current.currentTime : null;
        return youTube.current?.getCurrentTime?.() ?? null;
      },
    }),
    [isFile, missing],
  );

  const frame = 'aspect-video w-full overflow-hidden rounded-xl border border-rule bg-ink';
  if (isFile) {
    return missing ? (
      <p className={`${frame} flex items-center justify-center px-6 text-center text-sm text-paper`}>{labels.unavailable}</p>
    ) : (
      <video
        ref={video}
        className={frame}
        controls
        playsInline
        preload="metadata"
        poster={posterUrl(apiUrl, session)}
        onError={() => setMissing(true)}
      />
    );
  }
  return (
    <div ref={mount} className={`${frame} relative [&>div]:size-full [&_iframe]:size-full`}>
      {!asked && (
        <button
          type="button"
          onClick={() => setAsked(true)}
          className="group absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {/* A poster on YouTube's image host: next/image would need every hearings host configured. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={posterUrl(apiUrl, session)} alt="" className="absolute inset-0 size-full object-cover opacity-80" />
          <span className="relative inline-flex min-h-12 items-center gap-2 rounded-full bg-paper px-6 text-base font-semibold text-ink shadow-lg transition-transform group-hover:scale-105 motion-reduce:transition-none">
            <Play size={18} aria-hidden />
            {labels.play}
          </span>
        </button>
      )}
    </div>
  );
}
