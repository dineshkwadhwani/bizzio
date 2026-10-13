import { ContextHelpButton } from "@/components/help/ContextHelpButton";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ContextHelpButton module="finance" />
      {children}
    </>
  );
}
