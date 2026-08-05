// Fallback monthly-average fuel rates (₹) per city.
// Used when the live price API is unreachable — which is most of the time,
// since the public Indian fuel-price APIs need a key.

export type FuelType = "Petrol" | "Diesel" | "CNG";
export const FUEL_TYPES: FuelType[] = ["Petrol", "Diesel", "CNG"];
export const FUEL_UNIT: Record<FuelType, string> = { Petrol: "L", Diesel: "L", CNG: "kg" };

type Rates = Record<FuelType, number>;

export const FUEL_RATES: Record<string, Record<string, Rates>> = {
  Maharashtra: {
    Mumbai: { Petrol: 104.2, Diesel: 92.1, CNG: 79.5 },
    Pune: { Petrol: 104.0, Diesel: 90.6, CNG: 87.0 },
    Nagpur: { Petrol: 104.6, Diesel: 91.2, CNG: 92.0 },
  },
  Delhi: {
    "New Delhi": { Petrol: 94.7, Diesel: 87.6, CNG: 75.1 },
  },
  Karnataka: {
    Bengaluru: { Petrol: 102.9, Diesel: 89.0, CNG: 89.5 },
    Mysuru: { Petrol: 102.6, Diesel: 88.8, CNG: 90.0 },
  },
  "Tamil Nadu": {
    Chennai: { Petrol: 100.8, Diesel: 92.4, CNG: 89.0 },
    Coimbatore: { Petrol: 101.2, Diesel: 92.8, CNG: 90.0 },
  },
  Telangana: {
    Hyderabad: { Petrol: 107.4, Diesel: 95.7, CNG: 93.5 },
  },
  "West Bengal": {
    Kolkata: { Petrol: 105.0, Diesel: 91.8, CNG: 86.0 },
  },
  Gujarat: {
    Ahmedabad: { Petrol: 94.5, Diesel: 90.2, CNG: 76.0 },
    Surat: { Petrol: 94.7, Diesel: 90.4, CNG: 76.5 },
  },
  Rajasthan: {
    Jaipur: { Petrol: 104.9, Diesel: 90.4, CNG: 82.0 },
  },
  "Uttar Pradesh": {
    Lucknow: { Petrol: 94.6, Diesel: 87.8, CNG: 89.5 },
    Noida: { Petrol: 94.8, Diesel: 88.0, CNG: 79.7 },
  },
  Punjab: {
    Chandigarh: { Petrol: 94.3, Diesel: 82.4, CNG: 81.0 },
    Ludhiana: { Petrol: 96.9, Diesel: 87.3, CNG: 84.0 },
  },
  Kerala: {
    Kochi: { Petrol: 105.6, Diesel: 94.5, CNG: 92.0 },
  },
  "Madhya Pradesh": {
    Indore: { Petrol: 106.5, Diesel: 91.9, CNG: 92.0 },
    Bhopal: { Petrol: 106.4, Diesel: 91.8, CNG: 92.5 },
  },
};

export const STATES = Object.keys(FUEL_RATES);
export const citiesOf = (state: string) => Object.keys(FUEL_RATES[state] ?? {});

export function fallbackRate(state: string, city: string, fuel: FuelType): number {
  return FUEL_RATES[state]?.[city]?.[fuel] ?? 100;
}

/**
 * Tries a live lookup; falls back to the monthly average table.
 * Returns the rate plus where it came from so the UI can be honest about it.
 */
export async function fetchFuelRate(
  state: string,
  city: string,
  fuel: FuelType,
): Promise<{ rate: number; source: "live" | "average" }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(
      `https://fuel-price-api.p.rapidapi.com/price?city=${encodeURIComponent(city)}&fuel=${fuel.toLowerCase()}`,
      { signal: ctrl.signal },
    );
    clearTimeout(t);
    if (!res.ok) throw new Error("bad status");
    const json = (await res.json()) as { price?: number; rate?: number };
    const rate = Number(json.price ?? json.rate);
    if (!rate || Number.isNaN(rate)) throw new Error("no rate");
    return { rate, source: "live" };
  } catch {
    return { rate: fallbackRate(state, city, fuel), source: "average" };
  }
}
