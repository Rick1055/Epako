import { api } from "./supabase";

/** The clinical PDF for one session, built by the server from stored rows; saved as a file. */
export async function downloadReport(sessionId: string) {
  const pdf = await api<Blob>("/api/session/report/pdf", { method: "POST", body: JSON.stringify({ session_id: sessionId, inline: false }) });
  const url = URL.createObjectURL(pdf);
  const a = document.createElement("a");
  a.href = url;
  a.download = `epako-voice-report-${sessionId.slice(0, 8)}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
