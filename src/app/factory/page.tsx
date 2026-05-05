import { FactoryDashboard } from "@/components/factory/factory-dashboard";
import { listAllProductIdeas } from "@/lib/data/factory";

export default async function FactoryPage() {
  const ideas = await listAllProductIdeas();

  return <FactoryDashboard initialIdeas={ideas} />;
}
