// ============================================================
// Static, pre-written explanations of fixed parliamentary terms.
//
// These never change and never need an AI call — they are authored here once and
// served instantly. The <AiExplanation> component renders them under the same
// "הסבר AI" styling as the dynamic (per-bill / per-vote) explanations.
//
// Keep the language simple, neutral, and non-partisan.
// ============================================================

export interface StaticExplanation {
  /** The term being explained, in Hebrew. */
  term: string;
  /** A short plain-language explanation (2–3 sentences). */
  explanation: string;
}

export const STATIC_EXPLANATIONS: Record<string, StaticExplanation> = {
  "preliminary-reading": {
    term: "קריאה טרומית",
    explanation:
      "השלב הראשון בחקיקה של הצעת חוק פרטית (הצעה שמגיש חבר כנסת ולא הממשלה). המליאה מצביעה האם להמשיך לדון בהצעה. אם היא עוברת, ההצעה מועברת לוועדה להכנה לקריאה הראשונה.",
  },
  "first-reading": {
    term: "קריאה ראשונה",
    explanation:
      "ההצבעה במליאה על העקרונות של הצעת החוק, אחרי שהוכנה בוועדה. אם ההצעה עוברת, היא חוזרת לוועדה כדי לנסח את הנוסח הסופי לקראת הקריאה השנייה והשלישית.",
  },
  "second-third-reading": {
    term: "קריאה שנייה ושלישית",
    explanation:
      "השלב האחרון בחקיקה. בקריאה השנייה מצביעים על סעיפי החוק ועל ההסתייגויות, ומיד אחריה בקריאה השלישית מצביעים על החוק כולו. אם ההצעה עוברת — היא הופכת לחוק מדינה.",
  },
  reservation: {
    term: "הסתייגות",
    explanation:
      "הצעת שינוי שמגיש חבר כנסת לסעיף מסוים בהצעת חוק, לרוב מהאופוזיציה. המליאה מצביעה על כל הסתייגות בנפרד במהלך הקריאה השנייה, לפני ההצבעה על החוק כולו.",
  },
  "no-confidence": {
    term: "הצבעת אי-אמון",
    explanation:
      "הצבעה שבה האופוזיציה מבקשת להביע חוסר אמון בממשלה. כדי להפיל את הממשלה נדרש רוב של 61 חברי כנסת לפחות שתומכים בממשלה חלופית. ברוב המקרים ההצעה נדחית והממשלה ממשיכה לכהן.",
  },
  approval: {
    term: "אישור",
    explanation:
      "הצבעה לאישור עניין שמובא למליאה — למשל תקנות, מינוי או החלטה. ההחלטה מתקבלת אם רוב חברי הכנסת הנוכחים מצביעים בעד.",
  },
  "faction-cohesion": {
    term: "אחידות סיעתית",
    explanation:
      "מדד שמראה עד כמה חברי סיעה מצביעים יחד באותו אופן. אחידות גבוהה משמעה שהסיעה כמעט תמיד מצביעה כגוש אחד; אחידות נמוכה משמעה שחבריה מרבים להצביע באופן שונה זה מזה.",
  },
  "coalition-opposition": {
    term: "קואליציה ואופוזיציה",
    explanation:
      "הקואליציה היא קבוצת הסיעות שתומכות בממשלה ומחזיקות יחד ברוב בכנסת. האופוזיציה היא יתר הסיעות, שאינן חלק מהממשלה ולרוב מצביעות נגד הצעותיה.",
  },
};

export type StaticTermKey = keyof typeof STATIC_EXPLANATIONS;

/**
 * Map a raw vote-type description (the Hebrew `vote_item_dscr` from the API) to
 * the matching static term, so we can show "what does this kind of vote mean".
 * Returns null when the type isn't one of the known procedural terms.
 */
export function voteTypeToTermKey(dscr: string | null | undefined): StaticTermKey | null {
  if (!dscr) return null;
  const d = dscr.trim();
  if (d.includes("הסתייגות")) return "reservation";
  if (d.includes("אי-אמון") || d.includes("אי אמון")) return "no-confidence";
  if (d.includes("טרומית")) return "preliminary-reading";
  if (d.includes("שניה ושלישית") || d.includes("שנייה ושלישית")) return "second-third-reading";
  if (d.includes("ראשונה")) return "first-reading";
  if (d.includes("אישור")) return "approval";
  return null;
}
