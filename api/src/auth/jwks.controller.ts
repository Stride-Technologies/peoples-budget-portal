import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createPublicKey } from 'node:crypto';
import { Public } from './decorators/public.decorator.js';

interface JwksKey {
  kty: string;
  use: string;
  kid: string;
  alg: string;
  n: string;
  e: string;
}

@ApiTags('auth')
@Controller('.well-known')
export class JwksController {
  constructor(private readonly config: ConfigService) {}

  @Get('jwks.json')
  @Public()
  @ApiOperation({
    summary: 'JSON Web Key Set — public key for JWT verification',
  })
  jwks(): { keys: JwksKey[] } {
    const pem = this.config
      .getOrThrow<string>('JWT_PUBLIC_KEY')
      .replaceAll('\\n', '\n');

    const keyObject = createPublicKey(pem);
    const jwk = keyObject.export({ format: 'jwk' }) as {
      kty: string;
      n: string;
      e: string;
    };

    return {
      keys: [
        {
          kty: jwk.kty,
          use: 'sig',
          kid: '1',
          alg: 'RS256',
          n: jwk.n,
          e: jwk.e,
        },
      ],
    };
  }
}
