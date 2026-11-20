import type { Request, Response } from 'express';
import { rejectBrotliBody } from './reject-brotli.js';

describe('rejectBrotliBody', () => {
  const run = (encoding?: string) => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
    const next = jest.fn();
    rejectBrotliBody(
      { headers: encoding ? { 'content-encoding': encoding } : {} } as Request,
      res,
      next,
    );
    return { res, next };
  };

  it.each(['br', 'BR', 'gzip, br'])('refuses %s with 415', (enc) => {
    const { res, next } = run(enc);
    expect(res.status).toHaveBeenCalledWith(415);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([undefined, 'gzip', 'identity'])('passes %s through', (enc) => {
    expect(run(enc).next).toHaveBeenCalled();
  });
});
