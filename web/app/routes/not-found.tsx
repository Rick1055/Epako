import { data } from "react-router";

import { ButtonLink } from "~/components/Button";
import { PageIntro } from "~/components/PageIntro";
import type { Route } from "./+types/not-found";

// Rule 10: any unknown address gets this page with a real 404 status, inside the normal header and footer.
export function loader() {
  return data(null, { status: 404 });
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Page not found - Epako Voice" }, { name: "robots", content: "noindex" }];
}

export default function NotFound() {
  return (
    <>
      {/* A fork in the path, lightly snowed over. */}
      <PageIntro>
        <h1 className="max-w-[30rem] text-headline">That page isn't here, but you're not lost.</h1>
      </PageIntro>
      <div className="mx-auto max-w-[1120px] px-5 pt-4 pb-18 md:px-10">
        <p>Let's head back to somewhere familiar.</p>
        <ButtonLink to="/" className="mt-10 w-full sm:w-auto">
          Take me home
        </ButtonLink>
      </div>
    </>
  );
}
