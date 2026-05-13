export interface PartyMeta {
  color: string;
  coalition: boolean;
  arcOrder: number; // 1 = far-left of arc, 12 = far-right (ideologically)
}

// Keyed by Hebrew name substring — matched with String.includes()
// Colors match design's data.js. Coalition = Knesset 25 actual coalition.
const KNESSET25_META: Record<string, PartyMeta> = {
  "ליכוד":           { color: "#2563B8", coalition: true,  arcOrder: 7  },
  "יש עתיד":         { color: "#1FA9C4", coalition: false, arcOrder: 4  },
  "המחנה הממלכתי":   { color: "#0E4B8C", coalition: false, arcOrder: 5  },
  'ש"ס':             { color: "#8B5A2B", coalition: true,  arcOrder: 8  },
  "הציונות הדתית":   { color: "#D97706", coalition: true,  arcOrder: 10 },
  "יהדות התורה":     { color: "#1F2937", coalition: true,  arcOrder: 9  },
  "עוצמה יהודית":    { color: "#B45309", coalition: true,  arcOrder: 11 },
  "ישראל ביתנו":     { color: "#0EA5A5", coalition: false, arcOrder: 6  },
  'רע"מ':            { color: "#16A34A", coalition: false, arcOrder: 2  },
  'חד"ש':            { color: "#BE185D", coalition: false, arcOrder: 1  },
  "העבודה":          { color: "#DC2626", coalition: false, arcOrder: 3  },
  "עבודה":           { color: "#DC2626", coalition: false, arcOrder: 3  },
  "נעם":             { color: "#7C3AED", coalition: true,  arcOrder: 12 },
};

const DEFAULT_META: PartyMeta = { color: "#6B7280", coalition: false, arcOrder: 99 };

export function getPartyMeta(hebrewName: string): PartyMeta {
  for (const [key, meta] of Object.entries(KNESSET25_META)) {
    if (hebrewName.includes(key)) return meta;
  }
  return DEFAULT_META;
}
