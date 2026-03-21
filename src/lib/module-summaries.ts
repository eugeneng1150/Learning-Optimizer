import { ModuleRecord, SourceDocument } from "@/lib/types";

export interface ModuleSummary {
  module: ModuleRecord;
  noteCount: number;
  latestSource?: SourceDocument;
  sources: SourceDocument[];
}

export function buildModuleSummaries(modules: ModuleRecord[], sources: SourceDocument[]): ModuleSummary[] {
  const sourcesByModuleId = new Map<string, SourceDocument[]>();

  sources.forEach((source) => {
    const current = sourcesByModuleId.get(source.moduleId) ?? [];
    current.push(source);
    sourcesByModuleId.set(source.moduleId, current);
  });

  return modules.map((module) => {
    const moduleSources = [...(sourcesByModuleId.get(module.id) ?? [])].sort(
      (left, right) => right.createdAt.localeCompare(left.createdAt) || right.title.localeCompare(left.title)
    );

    return {
      module,
      noteCount: moduleSources.length,
      latestSource: moduleSources[0],
      sources: moduleSources
    };
  });
}
