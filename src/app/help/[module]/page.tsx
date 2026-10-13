import { ModuleHelpPage } from "@/components/help/ModuleHelpPage";

export default function GenericHelpPage({ params, searchParams }: { params: { module: string }; searchParams?: { path?: string; embedded?: string } }) {
  return <ModuleHelpPage module={params.module} searchParams={searchParams} />;
}
