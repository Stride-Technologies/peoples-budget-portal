import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import LoginForm from './login-form';

// Already-authenticated users shouldn't see the sign-in form (and the root
// layout would otherwise render the navbar above it). Send them to the
// dashboard instead.
export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect('/dashboard');
  return <LoginForm />;
}
