/**
 * Fetch a file and save it, reporting progress as the bytes arrive.
 *
 * Two phases, because they cost different amounts and a single spinner hides
 * which one you are in:
 *
 *  - **preparing** — the server is still building the file and has sent
 *    nothing. This is where almost all of the wait currently is: the Annual
 *    Budget book takes ~300ms to generate and ~91KB to send.
 *  - **downloading** — bytes are arriving. A percentage is only reported when
 *    the response carries `Content-Length`; without a denominator the caller is
 *    told `null` and should keep showing an indeterminate state rather than
 *    invent a number.
 *
 * Falls back to `blob()` where the response has no readable stream, which also
 * means no progress — reporting a fake 50% would be worse than reporting none.
 */
export interface DownloadProgress {
  phase: 'preparing' | 'downloading';
  /** 0-100, or null when the response gave no Content-Length. */
  percent: number | null;
  receivedBytes: number;
}

export async function downloadWithProgress(
  url: string,
  options: {
    fallbackFilename: string;
    fallbackError: string;
    onProgress?: (progress: DownloadProgress) => void;
  },
): Promise<string> {
  const { fallbackFilename, fallbackError, onProgress } = options;
  onProgress?.({ phase: 'preparing', percent: null, receivedBytes: 0 });

  const response = await fetch(url);
  if (!response.ok) {
    const payload = await response
      .json()
      .catch(() => ({ error: fallbackError }));
    throw new Error(payload.error ?? payload.message ?? fallbackError);
  }

  const filename =
    /filename="([^"]+)"/i.exec(response.headers.get('content-disposition') ?? '')?.[1] ??
    fallbackFilename;

  const total = Number(response.headers.get('content-length')) || 0;
  let blob: Blob;

  if (response.body) {
    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value as BlobPart);
      received += value.length;
      onProgress?.({
        phase: 'downloading',
        percent: total ? Math.min(100, Math.round((received / total) * 100)) : null,
        receivedBytes: received,
      });
    }
    blob = new Blob(chunks, {
      type: response.headers.get('content-type') ?? 'application/octet-stream',
    });
  } else {
    blob = await response.blob();
    onProgress?.({
      phase: 'downloading',
      percent: 100,
      receivedBytes: blob.size,
    });
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
  return filename;
}
