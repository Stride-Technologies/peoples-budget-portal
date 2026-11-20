import type { Metadata } from "next";
import { PrivacyPolicyContent } from "@/components/public/privacy-policy-content";
import { canonical } from "@/lib/seo";
import { getBrand } from '@/lib/brand-server';

export async function generateMetadata(): Promise<Metadata> {
  const { government } = await getBrand();
  return {
    title: "Privacy Policy | People's Budget Portal",
    description: `Learn how the ${government} collects, uses, stores, and protects personal data submitted through the People's Budget Portal, in accordance with RA 10173.`,
    alternates: { canonical: canonical("/privacy-policy") },
  };
}

export default function PrivacyPolicyPage() {
  return <PrivacyPolicyContent />;
}
