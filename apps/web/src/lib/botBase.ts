/** Base URL del bot: dev usa proxy Vite; prod apunta a api.lia-estudio.com */
export function botUrl(path: string): string {
  const base =
    (import.meta.env.VITE_BOT_API_URL as string | undefined)?.replace(/\/$/, "") ??
    (import.meta.env.PROD ? "https://api.lia-estudio.com" : "/api/bot");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
