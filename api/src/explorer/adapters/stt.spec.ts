import { AzureSpeechStt, OmnilingualStt, sttFromEnv } from './stt.js';

const ok = (body: unknown) =>
  jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });

describe('speech adapters (specs/018 P4)', () => {
  const env = { ...process.env };
  afterEach(() => (process.env = { ...env }));

  it('omnilingual posts the clip and the page language to the container', async () => {
    process.env.STT_BASE_URL = 'http://stt:8080/';
    process.env.STT_API_KEY = 'k';
    const fetchFn = ok({ text: ' magkano sa kalusugan ' });
    const text = await new OmnilingualStt(fetchFn).transcribe(
      Buffer.from('ogg'),
      'audio/ogg',
      'fil',
    );
    expect(text).toBe('magkano sa kalusugan');
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://stt:8080/transcribe');
    expect((init.body as FormData).get('lang')).toBe('fil');
    expect((init.body as FormData).get('audio')).toBeInstanceOf(Blob);
    expect(init.headers).toEqual({ authorization: 'Bearer k' });
  });

  it('azure asks for fil-PH or en-PH and joins the phrases; it offers no Bikol', async () => {
    process.env.AZURE_SPEECH_REGION = 'southeastasia';
    process.env.AZURE_SPEECH_KEY = 'k';
    const fetchFn = ok({
      combinedPhrases: [{ text: 'How much' }, { text: 'for health?' }],
    });
    const stt = new AzureSpeechStt(fetchFn);
    expect(await stt.transcribe(Buffer.from('x'), 'audio/webm', 'fil')).toBe(
      'How much for health?',
    );
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain(
      'https://southeastasia.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe',
    );
    expect(
      JSON.parse((init.body as FormData).get('definition') as string),
    ).toEqual({ locales: ['fil-PH'] });
    expect(stt.languages).not.toContain('bcl');
  });

  it('a failing service is an error, not an empty transcript', async () => {
    process.env.STT_BASE_URL = 'http://stt';
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(
      new OmnilingualStt(fetchFn).transcribe(
        Buffer.from('x'),
        'audio/ogg',
        'en',
      ),
    ).rejects.toThrow('503');
  });

  it('no STT_PROVIDER, no mic', () => {
    delete process.env.STT_PROVIDER;
    expect(sttFromEnv()).toBeNull();
    process.env.STT_PROVIDER = 'azure';
    expect(sttFromEnv()?.name).toBe('azure');
  });
});
