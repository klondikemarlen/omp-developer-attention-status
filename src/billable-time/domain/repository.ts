export function normalizeBillableRepository(repository: string): string {
  return repository.replace(/\.git$/i, "").toLowerCase()
}
