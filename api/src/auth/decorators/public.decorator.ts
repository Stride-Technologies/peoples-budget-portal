import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'IS_PUBLIC';

/** Mark a route handler or controller as publicly accessible (no JWT required). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
