const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const defaultApiUrl = process.env.NODE_ENV === "production"
  ? "https://investiq-api.vercel.app"
  : "http://127.0.0.1:8000";

export const API_URL = (configuredApiUrl || defaultApiUrl).replace(/\/$/, "");

export function marketWebSocketUrl() {
  return `${API_URL.replace(/^http/, "ws")}/ws/market`;
}
