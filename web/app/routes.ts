import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

export default [
  route("sign-out", "routes/sign-out.tsx"),
  // Signed-in patients.
  layout("routes/app-layout.tsx", [
    route("setup", "routes/setup.tsx", [
      index("routes/setup-privacy.tsx"),
      route("voice", "routes/setup-voice.tsx"),
      route("mic", "routes/setup-mic.tsx"),
    ]),
    route("home", "routes/home.tsx"),
    route("speak", "routes/speak.tsx"),
    route("speak/done", "routes/speak-done.tsx"),
    route("voice", "routes/voice.tsx"),
    route("progress", "routes/progress.tsx"),
    route("progress/:id", "routes/progress-session.tsx"),
    route("care", "routes/care.tsx"),
    route("me", "routes/me.tsx"),
  ]),
  // Verified clinicians.
  ...prefix("clinician", [
    layout("routes/clinician-layout.tsx", [
      index("routes/clinician-patients.tsx"),
      route("link", "routes/clinician-link.tsx"),
      route("patient/:id", "routes/clinician-patient.tsx"),
      route("patient/:id/session/:sid", "routes/clinician-session.tsx"),
    ]),
  ]),
  // Public pages, and the steps before a clinician is verified.
  layout("routes/public-layout.tsx", [
    index("routes/welcome.tsx"),
    route("sign-up", "routes/sign-up.tsx"),
    route("sign-in", "routes/sign-in.tsx"),
    route("sign-in/link", "routes/sign-in-link.tsx"),
    route("forgot-password", "routes/forgot-password.tsx"),
    route("reset-password", "routes/reset-password.tsx"),
    route("help", "routes/help.tsx"),
    route("terms", "routes/terms.tsx"),
    route("privacy", "routes/privacy.tsx"),
    route("accessibility", "routes/accessibility.tsx"),
    route("clinician/sign-up", "routes/clinician-sign-up.tsx"),
    route("clinician/verify", "routes/clinician-verify.tsx"),
    route("clinician/pending", "routes/clinician-pending.tsx"),
    route("*", "routes/not-found.tsx"),
  ]),
] satisfies RouteConfig;
