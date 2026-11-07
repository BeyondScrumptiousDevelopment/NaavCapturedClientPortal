import { ActionForm } from "@/components/ActionForm";
import { Badge, ButtonLink, Card, Notice } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getGoogleConnection, GOOGLE_SCOPES } from "@/lib/google";
import { formatDateTime } from "@/lib/format";
import { disconnectGoogleAction } from "./actions";

export const metadata = { title: "Settings" };

const scopeLabels: Record<string, string> = {
  "https://www.googleapis.com/auth/drive.readonly": "Drive (read only): list folders, show photos, stream video",
  "https://www.googleapis.com/auth/calendar": "Calendar: check busy times and add confirmed shoots",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { profile } = await requireAdmin();
  const { google: googleResult } = await searchParams;
  const google = await getGoogleConnection();
  const missing = google ? GOOGLE_SCOPES.filter((s) => s.startsWith("https://") && !google.scopes.includes(s)) : [];

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <h1 className="nc-h1">settings.</h1>

      {googleResult === "connected" ? <Notice tone="sage">Google connected.</Notice> : null}
      {googleResult === "error" ? <Notice tone="rust">Google didn&apos;t connect. Try again.</Notice> : null}

      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="nc-h2">google account.</h2>
          <Badge tone={google ? "sage" : "amber"}>{google ? "connected" : "not connected"}</Badge>
        </div>
        {google ? (
          <div className="flex flex-col gap-4">
            <p>
              Connected as <span className="font-bold">{google.account_email}</span> since {formatDateTime(google.connected_at)}.
            </p>
            {missing.length ? (
              <Notice tone="amber">Some permissions are missing. Reconnect and tick every box on Google&apos;s screen.</Notice>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/api/google/connect" prefetch={false}>
                Reconnect
              </ButtonLink>
              <ActionForm
                action={disconnectGoogleAction}
                submitLabel="Disconnect"
                variant="danger"
                confirm="Disconnecting stops Drive galleries and calendar checks until you reconnect. Continue?"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p>Connect the Google account that holds your client folders and your calendar.</p>
            <div>
              <ButtonLink href="/api/google/connect" variant="primary" prefetch={false}>
                Connect Google
              </ButtonLink>
            </div>
          </div>
        )}
        <ul className="nc-meta mt-6 list-disc pl-5">
          {GOOGLE_SCOPES.filter((s) => scopeLabels[s]).map((s) => (
            <li key={s}>{scopeLabels[s]}</li>
          ))}
          <li>Your Google token is encrypted and only ever used on the server.</li>
        </ul>
      </Card>

      <Card>
        <h2 className="nc-h2 mb-2">your studio login.</h2>
        <p>
          Signed in as <span className="font-bold">{profile.email}</span> with two-factor authentication.
        </p>
      </Card>
    </div>
  );
}
