// Public facts about the site. Checked at build time by vite.config.ts (checkContact).
export const SITE_NAME = "Epako Voice";

const phone = import.meta.env.VITE_SUPPORT_PHONE as string;

export const contact = {
  email: import.meta.env.VITE_SUPPORT_EMAIL as string,
  phone,
  phoneHref: `tel:${phone.replace(/[^\d+]/g, "")}`,
  isDemo: import.meta.env.VITE_DEMO_CONTACT === "true",
};
