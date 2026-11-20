import 'server-only';
import { brandFromEnv, type Brand } from './brand';

const BRAND = brandFromEnv(process.env);

/** The portal's identity (the `LGU_*` variables). Async so a caller never depends on where it comes from. */
export async function getBrand(): Promise<Brand> {
  return BRAND;
}
