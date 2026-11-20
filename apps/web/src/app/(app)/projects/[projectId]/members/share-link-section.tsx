"use client";

import { Button, TextField } from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

// The origin never changes while the page is open, so there is nothing to subscribe to.
const subscribeNever = () => () => {};

/**
 * The project's public read-only link: anybody with it sees the project
 * without signing in. Admins turn it on, copy it, replace it (the old one
 * stops working) or turn it off.
 */
export function ShareLinkSection({
  projectId,
  token,
}: Readonly<{ projectId: string; token: string | null }>) {
  const router = useRouter();
  const t = useTranslations("members.share");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const endpoint = `/api/projects/${projectId}/share-link`;
  // Relative until mounted, so server and client render the same markup.
  const origin = useSyncExternalStore(
    subscribeNever,
    () => window.location.origin,
    () => "",
  );
  const link = token ? `${origin}/share/${token}` : null;

  async function send(method: "POST" | "DELETE") {
    setPending(true);
    setError(null);
    setCopied(false);
    try {
      const response = await fetch(endpoint, { method });
      if (!response.ok) throw new Error(t("error", { status: response.status }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setPending(false);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard access can be denied; the link stays selectable in the field.
    }
  }

  return (
    <section aria-labelledby="share-title" className="flex flex-col gap-3">
      <h2 id="share-title" className="text-muted text-xs font-medium tracking-widest uppercase">
        {t("title")}
      </h2>
      <p className="text-muted text-sm">{t("description")}</p>

      <div className="border-line bg-surface flex flex-col gap-4 rounded-md border p-5">
        {link ? (
          <>
            <div className="flex items-center gap-2">
              <TextField.Root
                readOnly
                value={link}
                aria-label={t("linkLabel")}
                className="flex-1"
                onFocus={(e) => e.target.select()}
              />
              <Button type="button" variant="soft" onClick={copy}>
                {copied ? t("copied") : t("copy")}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                color="red"
                variant="soft"
                size="1"
                disabled={pending}
                onClick={() => send("DELETE")}
              >
                {t("disable")}
              </Button>
              <Button
                type="button"
                variant="soft"
                size="1"
                disabled={pending}
                onClick={() => send("POST")}
              >
                {t("regenerate")}
              </Button>
              <span className="text-muted text-xs">{t("regenerateHint")}</span>
            </div>
          </>
        ) : (
          <div>
            <Button type="button" disabled={pending} onClick={() => send("POST")}>
              {t("enable")}
            </Button>
          </div>
        )}
        {error ? <p className="text-danger text-sm">{error}</p> : null}
      </div>
    </section>
  );
}
