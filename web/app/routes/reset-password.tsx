import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { Button } from "~/components/Button";
import { PageIntro } from "~/components/PageIntro";
import { Message } from "~/components/Message";
import { PasswordField } from "~/components/PasswordField";
import { authMessage, supabase } from "~/lib/supabase";
import type { Route } from "./+types/reset-password";
import { homeFor } from "./sign-in";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Choose a new password - Epako Voice" }, { name: "robots", content: "noindex" }];
}

/** Reached from the reset email: Supabase signs the person in from the link, then they choose a new password. */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const onOk = useCallback((v: boolean) => setOk(v), []);

  useEffect(() => {
    const db = supabase();
    const { data } = db.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY" || s) setReady(true);
    });
    const t = setTimeout(() => setReady((r) => r ?? false), 3000);
    return () => {
      data.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!ok) return setError("Your password needs at least 12 characters and shouldn't be one that's been in a data leak.");
    setBusy(true);
    const { data, error } = await supabase().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(authMessage(error));
    navigate(await homeFor(data.user.id));
  }

  return (
    <>
      <PageIntro>
        <h1 className="text-headline text-balance">Choose a new password.</h1>
      </PageIntro>
      <div className="mx-auto max-w-[1120px] px-5 pb-18 md:px-10">
        {ready === false ? (
          <div className="max-w-[34rem]">
            <Message tone="error">This link has expired or was already used. Links work once, for an hour.</Message>
            <Link to="/forgot-password" className="mt-6 inline-flex min-h-12 items-center font-semibold underline underline-offset-4">
              Send me a new link
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex max-w-[34rem] flex-col gap-6">
            {error && <Message tone="error">{error}</Message>}
            <PasswordField label="New password" value={password} onChange={setPassword} meter autoComplete="new-password" onOk={onOk} />
            <Button type="submit" disabled={busy || !ready} className="w-full sm:w-auto sm:self-start">
              {busy ? "Saving…" : "Save my new password"}
            </Button>
          </form>
        )}
      </div>
    </>
  );
}
