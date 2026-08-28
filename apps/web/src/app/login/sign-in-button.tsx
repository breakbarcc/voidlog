"use client";

import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";

export function SignInButton() {
  const t = useTranslations("login");
  return (
    <button
      type="button"
      onClick={() => signIn("discord")}
      className="bg-discord inline-flex cursor-pointer items-center gap-2.5 rounded-md px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
    >
      <svg
        viewBox="0 0 640 512"
        aria-hidden="true"
        className="h-5 w-5 fill-current"
      >
        <path d="M524.5 69.8a1.5 1.5 0 0 0-.8-.7A485.1 485.1 0 0 0 404.1 32a1.8 1.8 0 0 0-1.9.9 337.5 337.5 0 0 0-14.9 30.6 447.8 447.8 0 0 0-134.4 0 309.5 309.5 0 0 0-15.1-30.6 1.9 1.9 0 0 0-1.9-.9A483.7 483.7 0 0 0 116.1 69.1a1.7 1.7 0 0 0-.8.7C39.1 183.7 18.2 294.7 28.4 404.4a2 2 0 0 0 .8 1.4A487.7 487.7 0 0 0 176 479.9a1.9 1.9 0 0 0 2.1-.7 348.2 348.2 0 0 0 30-48.8 1.9 1.9 0 0 0-1-2.6 321.2 321.2 0 0 1-45.9-21.9 1.9 1.9 0 0 1-.2-3.1c3.1-2.3 6.2-4.7 9.1-7.1a1.8 1.8 0 0 1 1.9-.3c96.3 44 200.6 44 295.8 0a1.8 1.8 0 0 1 1.9.2c2.9 2.4 6 4.9 9.1 7.2a1.9 1.9 0 0 1-.2 3.1 301.4 301.4 0 0 1-45.9 21.9 1.9 1.9 0 0 0-1 2.6 391.1 391.1 0 0 0 30 48.8 1.9 1.9 0 0 0 2.1.7 486 486 0 0 0 147.2-74.1 1.9 1.9 0 0 0 .8-1.4c12.2-126.9-20.5-236.9-86.6-334.5ZM222.5 337.6c-29 0-52.8-26.6-52.8-59.2s23.3-59.2 52.8-59.2c29.7 0 53.3 26.8 52.8 59.2 0 32.6-23.3 59.2-52.8 59.2Zm195.1 0c-29 0-52.8-26.6-52.8-59.2s23.3-59.2 52.8-59.2c29.7 0 53.3 26.8 52.8 59.2 0 32.6-23.1 59.2-52.8 59.2Z" />
      </svg>
      {t("signIn")}
    </button>
  );
}
