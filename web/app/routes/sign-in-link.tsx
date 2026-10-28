import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { EntryPage } from "~/components/EntryPage";
import { Message } from "~/components/Message";
import { safeNext, supabase } from "~/lib/supabase";
import type { Route } from "./+types/sign-in-link";
import { homeFor } from "./sign-in";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Signing you in - Epako Voice" }, { name: "robots", content: "noindex" }];
}

/**
 * Where an emailed sign-in link lands. Supabase's client reads the link's token from the address itself and signs
 * the person in; this page waits for that, then sends them to their home screen (or where they were going).
 */
export default function SignInLink() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let done = false;
    const go = async (userId: string) => {
      if (done) return;
      done = true;
      navigate(safeNext(params.get("next"), await homeFor(userId)), { replace: true });
    };
    const { data } = supabase().auth.onAuthStateChange((_event, session) => {
      if (session) void go(session.user.id);
    });
    void supabase()
      .auth.getSession()
      .then(({ data: { session } }) => session && go(session.user.id));
    // An expired or already-used link: the address carries an error, or nothing signs in.
    const timer = setTimeout(() => !done && setFailed(true), 8000);
    if (/error/.test(location.hash + location.search)) setFailed(true);
    return () => {
      clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, [navigate, params]);

  return (
    <EntryPage>
      {failed ? (
        <div className="flex flex-col gap-4">
          <h1 className="text-headline text-balance">That link has expired.</h1>
          <Message tone="error">Sign-in links work once, for one hour. Ask for a fresh one and it will be with you in a minute.</Message>
          <Link to="/sign-in" className="inline-flex min-h-12 items-center self-start font-semibold underline underline-offset-4">
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <h1 className="text-headline text-balance">Signing you in…</h1>
          <p className="mt-4 text-ink-soft">Just a moment.</p>
        </>
      )}
    </EntryPage>
  );
}
