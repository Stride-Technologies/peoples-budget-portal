import type { Metadata } from "next";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { LicensePage } from "@/components/public/license-page";
import { canonical } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Open Source License | People's Budget Portal",
  description:
    "The People's Budget Portal is free and open-source software released under the GNU Affero General Public License v3.0 (AGPL-3.0).",
  alternates: { canonical: canonical("/license") },
};

export default function LicenseRoute() {
  // In the standalone Docker image process.cwd() is /app and the client's
  // public/ dir lands at /app/client/public/. In dev it's the client/ root.
  const prodPath = join(process.cwd(), "client", "public", "LICENSE.txt");
  const devPath = join(process.cwd(), "public", "LICENSE.txt");
  const licensePath = existsSync(prodPath) ? prodPath : devPath;
  const licenseText = readFileSync(licensePath, "utf-8");
  return <LicensePage licenseText={licenseText} />;
}
