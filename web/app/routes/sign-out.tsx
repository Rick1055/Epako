import { redirect } from "react-router";

import { supabase } from "~/lib/supabase";

// Signs out everywhere this browser is signed in (other tabs follow through onAuthStateChange), then home.
export async function clientLoader() {
  await supabase().auth.signOut();
  return redirect("/");
}

export function HydrateFallback() {
  return <p className="px-5 py-18">Signing you out…</p>;
}

export default function SignOut() {
  return null;
}
