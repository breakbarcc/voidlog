"use client";

import { Button, Dialog, Flex, TextField } from "@radix-ui/themes";
import { useTranslations } from "next-intl";

export function CreateProjectDialog({
  action,
}: Readonly<{ action: (formData: FormData) => Promise<void> }>) {
  const t = useTranslations("createProjectDialog");
  return (
    <Dialog.Root>
      <Dialog.Trigger>
        <Button size="3">{t("trigger")}</Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="420px">
        <Dialog.Title>{t("title")}</Dialog.Title>
        <form action={action}>
          <TextField.Root name="name" placeholder={t("namePlaceholder")} required autoFocus />
          <Flex justify="end" gap="3" mt="4">
            <Dialog.Close>
              <Button type="button" variant="soft" color="gray">
                {t("cancel")}
              </Button>
            </Dialog.Close>
            <Button type="submit">{t("create")}</Button>
          </Flex>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
