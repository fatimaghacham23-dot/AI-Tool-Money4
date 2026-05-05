import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getProductDetailWithContext } from "@/lib/data/factory";
import { notFound } from "next/navigation";
import { PackagePlanView } from "@/components/factory/package-plan-view";

export default async function PackagePlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getProductDetailWithContext(id);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Package Plan · {detail.idea.title}</h1>
          <p className="text-sm text-muted-foreground">Generate a complete source code sale package plan.</p>
        </div>
        <Button asChild variant="outline"><Link href={`/factory/${id}`}>Back to Idea</Link></Button>
      </div>
      <PackagePlanView productIdeaId={id} initialStatus={detail.idea.factory_status} />
    </div>
  );
}
