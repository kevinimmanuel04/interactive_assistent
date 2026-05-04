import type { IndexReport } from "../../../api";

export function reportSummary(r: IndexReport): string {
  return `${r.files_indexed} indexed · ${r.files_skipped} skipped · ${r.chunks_written} chunks`;
}
