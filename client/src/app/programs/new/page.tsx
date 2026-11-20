import { redirect } from 'next/navigation';

/** Retired full-page route (FR-012): visits redirect into the registry's "New Program" drawer. */
export default function NewProgramPage() {
  redirect('/aip-registry?kind=program&mode=create');
}
