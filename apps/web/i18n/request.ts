import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async () => {
  // Single locale for Phase 1. Phase 2 adds English ("en").
  const locale = "he";

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
