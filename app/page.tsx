import { DashboardShell } from "@/components/DashboardShell";
import { SelectedSymbolProvider } from "@/lib/useSelectedSymbol";

export default function Home() {
  return (
    <SelectedSymbolProvider>
      <DashboardShell />
    </SelectedSymbolProvider>
  );
}
