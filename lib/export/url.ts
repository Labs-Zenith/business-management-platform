export function buildExportHref(pathname: string, searchParams: Record<string, string | undefined>, format: "xlsx" | "pdf") {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value && key !== "page") {
      params.set(key, value);
    }
  }
  params.set("format", format);
  return `${pathname}?${params.toString()}`;
}
