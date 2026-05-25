export interface PartyMeta {
  color: string;
  coalition: boolean;
  arcOrder: number; // 1 = far-left of arc, 12 = far-right (ideologically)
}

// Keyed by Hebrew name substring — matched with String.includes()
// arcOrder places opposition on the left (1–5) and coalition on the right (7–12)
const KNESSET25_META: Record<string, PartyMeta> = {
  // Opposition — left to right
  'חד"ש':            { color: "#DB2777", coalition: false, arcOrder: 1  }, // pink-600, Arab communist
  'רע"מ':            { color: "#16A34A", coalition: false, arcOrder: 2  }, // green-600, Islamic
  'רע"ם':            { color: "#16A34A", coalition: false, arcOrder: 2  }, // green-600, sofit variant
  "העבודה":          { color: "#DC2626", coalition: false, arcOrder: 3  }, // red-600, Labor
  "עבודה":           { color: "#DC2626", coalition: false, arcOrder: 3  }, // red-600
  "יש עתיד":         { color: "#0891B2", coalition: false, arcOrder: 4  }, // cyan-600, centrist
  "המחנה הממלכתי":   { color: "#7C3AED", coalition: false, arcOrder: 5  }, // violet-600, Gantz/Blue-White
  "ישראל ביתנו":     { color: "#0D9488", coalition: false, arcOrder: 6  }, // teal-600, Lieberman

  // Coalition — left to right
  "הימין הממלכתי":   { color: "#0284C7", coalition: true,  arcOrder: 7  }, // sky-600, Sa'ar/New Hope
  "ליכוד":           { color: "#1E40AF", coalition: true,  arcOrder: 8  }, // blue-800, Netanyahu's Likud
  'ש"ס':             { color: "#D97706", coalition: true,  arcOrder: 9  }, // amber-600, Shas
  "התאחדות הספרדים": { color: "#D97706", coalition: true,  arcOrder: 9  }, // amber-600, Shas full name
  "יהדות התורה":     { color: "#92400E", coalition: true,  arcOrder: 10 }, // amber-900, UTJ (visible dark gold)
  "הציונות הדתית":   { color: "#EA580C", coalition: true,  arcOrder: 11 }, // orange-600, Smotrich
  "עוצמה יהודית":    { color: "#991B1B", coalition: true,  arcOrder: 12 }, // red-800, Ben Gvir
  "נעם":             { color: "#6D28D9", coalition: true,  arcOrder: 13 }, // violet-700, Avi Maoz
};

const DEFAULT_META: PartyMeta = { color: "#6B7280", coalition: false, arcOrder: 99 };

export function getPartyMeta(hebrewName: string): PartyMeta {
  for (const [key, meta] of Object.entries(KNESSET25_META)) {
    if (hebrewName.includes(key)) return meta;
  }
  return DEFAULT_META;
}

export function getPartyColor(hebrewName: string): string {
  return getPartyMeta(hebrewName).color;
}
