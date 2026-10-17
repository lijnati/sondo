import Link from "next/link";

import { Container } from "@/components/shared/layout";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

export default function ReportNotFound() {
  return (
    <Container className="py-16 md:py-24">
      <ErrorState
        title="Report not found"
        description="This report link doesn't match a stored report. It may have been mistyped, or the run never completed."
        actions={
          <Button asChild>
            <Link href="/new">Build a cultural brief</Link>
          </Button>
        }
      />
    </Container>
  );
}
