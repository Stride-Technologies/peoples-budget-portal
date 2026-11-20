import type { Metadata } from "next";
import { TermsOfServiceContent } from "@/components/public/terms-of-service-content";
import { canonical } from "@/lib/seo";
import { getBrand } from '@/lib/brand-server';

export async function generateMetadata(): Promise<Metadata> {
  const { government } = await getBrand();
  return {
    title: "Terms of Service | People's Budget Portal",
    description: `Terms of service governing access to and use of the People's Budget Portal, operated by the ${government}.`,
    alternates: { canonical: canonical("/terms") },
  };
}

export default function TermsPage() {
  return <TermsOfServiceContent />;
}
