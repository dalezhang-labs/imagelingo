export function withCurrentSearch(path: string, search = window.location.search): string {
  return search ? `${path}${search}` : path;
}
