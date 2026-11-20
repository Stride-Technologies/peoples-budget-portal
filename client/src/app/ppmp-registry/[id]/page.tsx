import PpmpDetailView from '@/components/ppmp/ppmp-detail-view';

export default async function PpmpDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return (
    <div className="min-h-full bg-slate-50/60">
      <PpmpDetailView id={id} />
    </div>
  );
}
