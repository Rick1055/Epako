import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import { TEXT_SCALE, textSizeFromCookie } from "./lib/text-size";
import { themeFromCookie } from "./lib/theme";
import "./app.css";

export function loader({ request }: Route.LoaderArgs) {
  const cookie = request.headers.get("Cookie");
  // The CSP nonce for this page's own inline scripts (server.js); absent in development, where no CSP is sent.
  return { theme: themeFromCookie(cookie), textSize: textSizeFromCookie(cookie), nonce: request.headers.get("x-csp-nonce") ?? undefined };
}

export function Layout({ children }: { children: React.ReactNode }) {
  // Undefined while an error page renders without the root loader; the device setting applies then.
  const data = useRouteLoaderData<typeof loader>("root");
  return (
    <html lang="en" data-theme={data?.theme ?? undefined} style={{ fontSize: TEXT_SCALE[data?.textSize ?? "normal"] }}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#F8F4EC" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#12262A" />
        <meta name="google-site-verification" content="j8rGGPauGGCT4rzXp783R2Pk25rD1G44E1rwMqrVuog" />
        <Meta />
        <Links />
        {/* JSON-LD: helps search engines understand what the app is (DESIGN.md, rule 28). */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "Epako Voice",
              "description": "A communication and practice aid for people with dysarthria: it listens, corrects, and speaks back in a clear voice the person chose.",
              "applicationCategory": "HealthApplication",
              "operatingSystem": "Web",
              "offers": { "@type": "Offer", "price": "0", "priceCurrency": "INR" },
              "inLanguage": "en",
            }),
          }}
        />
      </head>
      <body>
        {children}
        <ScrollRestoration nonce={data?.nonce} />
        <Scripts nonce={data?.nonce} />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <div id="page" className="relative z-10">
      <Outlet />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="mx-auto max-w-[640px] px-5 py-18">
      <h1 className="text-headline">
        {notFound ? "That page isn't here, but you're not lost." : "Something got stuck on our side."}
      </h1>
      <p className="mt-4">
        {notFound ? "Let's head back to somewhere familiar." : "Give it a moment and try again. Nothing of yours has been lost."}
      </p>
      <p className="mt-10">
        <Link to="/" className="font-semibold underline underline-offset-4">
          Take me home
        </Link>
      </p>
    </main>
  );
}
