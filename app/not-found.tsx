import Link from "next/link";

import { Container } from "@/components/shared/layout";
import { ErrorState } from "@/components/shared/states";
import { Wordmark } from "@/components/shared/wordmark";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="flex flex-1 flex-col">
      <Container className="flex h-14 items-center border-b border-rule">
        <Wordmark />
      </Container>
      <Container className="py-16 md:py-24">
        <ErrorState
          title="Page not found"
          description="There's nothing at this address."
          actions={
            <>
              <Button asChild>
                <Link href="/new">Build a cultural brief</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/">Home</Link>
              </Button>
            </>
          }
        />
      </Container>
    </main>
  );
}
