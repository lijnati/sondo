import { MeadowShell } from "@/components/app/meadow-shell";

export default function BriefLayout({ children }: { children: React.ReactNode }) {
  return <MeadowShell>{children}</MeadowShell>;
}
