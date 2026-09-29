const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

export const API_URL = (configuredApiUrl || "http://127.0.0.1:8000").replace(/\/$/, "");

export function marketWebSocketUrl() {
  return `${API_URL.replace(/^http/, "ws")}/ws/market`;
}
