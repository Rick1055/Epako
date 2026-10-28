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
import { GardenHost, GardenStill, useGardenStop } from "./three/GardenHost";
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
        <Meta />
        <Links />
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
  // The garden lives here, behind every page: its still picture (also server-rendered) and the one live canvas,
  // created once and walking between pages. The page sits above both.
  const stop = useGardenStop();
  return (
    <>
      {stop && <GardenStill stop={stop.stop} />}
      {stop && <GardenHost stop={stop.stop} still={stop.still} />}
      <div id="page" className="relative z-10">
        <Outlet />
      </div>
    </>
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
