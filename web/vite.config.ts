import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

// Rules 11, 12 and 18: real contact details, or samples clearly flagged as a demo. Never missing, never unflagged samples.
function checkContact(env: Record<string, string>) {
  const { VITE_SUPPORT_EMAIL: email, VITE_SUPPORT_PHONE: phone, VITE_DEMO_CONTACT: demo } = env;
  if (!email?.trim() || !phone?.trim()) throw new Error("VITE_SUPPORT_EMAIL and VITE_SUPPORT_PHONE must be set (see .env.example)");
  const sample = email.endsWith(".example") || phone.replace(/\D/g, "").startsWith("442079460");
  if (sample && demo !== "true") throw new Error("Sample contact details need VITE_DEMO_CONTACT=true; use real ones for a real release");
}

export default defineConfig(({ mode }) => {
  checkContact(loadEnv(mode, process.cwd(), "VITE_"));
  return {
    // The server bundle's entry is the Express handler that server.js mounts.
    environments: {
      ssr: {
        build: {
          rollupOptions: {
            input: "./server/app.ts",
          },
        },
      },
    },
    plugins: [tailwindcss(), reactRouter()],
    resolve: {
      tsconfigPaths: true,
    },
  };
});
