/** Open-Meteo helpers — free, no API key. Geocoding + current weather. */

export interface GeoResult {
  label: string;
  lat: number;
  lon: number;
}

export interface Weather {
  temp: number;
  humidity: number;
  precip: number;
}

export async function geocodeSearch(query: string): Promise<GeoResult[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", query.trim());
    url.searchParams.set("count", "5");
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const json = await resp.json();
    const results = json.results ?? [];
    return results.map((r: Record<string, unknown>) => ({
      label: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
      lat: r.latitude as number,
      lon: r.longitude as number,
    }));
  } catch {
    return [];
  }
}

export async function fetchWeather(lat: number, lon: number): Promise<Weather> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("current", "temperature_2m,relative_humidity_2m,precipitation");
  url.searchParams.set("timezone", "auto");
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Weather fetch failed (${resp.status})`);
  const cur = (await resp.json()).current;
  return {
    temp: cur.temperature_2m,
    humidity: cur.relative_humidity_2m,
    precip: cur.precipitation ?? 0,
  };
}
