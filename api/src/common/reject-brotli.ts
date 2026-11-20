import type { NextFunction, Request, Response } from 'express';

/**
 * Node2Shell (CVE-2026-111497): body-parser 2 inflates `Content-Encoding: br`
 * bodies before any guard runs, and Node's Brotli decoder below 22.23.4 can be
 * driven to code execution. No client of ours sends Brotli request bodies, so
 * refuse them outright; this keeps the API safe on a runtime that lags.
 */
export function rejectBrotliBody(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (/\bbr\b/i.test(req.headers['content-encoding'] ?? '')) {
    res
      .status(415)
      .json({ statusCode: 415, message: 'Unsupported Content-Encoding' });
    return;
  }
  next();
}
