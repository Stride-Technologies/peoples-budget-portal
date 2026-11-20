import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export default async function ControlPanelPage() {
  const session = await getSession();
  redirect(session?.user.role === 'SUPER_ADMIN' ? '/control-panel/aip-cycles' : '/control-panel/users');
}
