export function normalizeBillableRepository(repository) {
  return repository.replace(/\.git$/i, "").toLowerCase();
}
