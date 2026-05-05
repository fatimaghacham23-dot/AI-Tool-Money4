import { Badge } from "@/components/ui/badge";
import type { CouncilRunStatus } from "@/types/database";

export function StatusBadge({ status }: { status: CouncilRunStatus }) {
  const variant =
    status === "completed"
      ? "success"
      : status === "running"
        ? "warning"
        : status === "failed"
          ? "danger"
          : "muted";

  return <Badge variant={variant}>{status}</Badge>;
}
