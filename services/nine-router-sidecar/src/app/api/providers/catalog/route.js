import { NextResponse } from "next/server";
import { buildTenantProviderCatalog } from "@/lib/providerCatalog";

export const dynamic = "force-dynamic";

// Metadata-only setup catalog. Credentials and tenant model availability are
// intentionally sourced from separate server-authoritative routes.
export async function GET() {
  return NextResponse.json(buildTenantProviderCatalog());
}
