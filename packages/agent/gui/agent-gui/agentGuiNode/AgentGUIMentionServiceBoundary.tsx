import { useMemo, type ReactNode } from "react";
import {
  RichTextMentionServiceProvider,
  useRichTextMentionService
} from "@tutti-os/ui-rich-text/editor";
import {
  createRichTextMentionService,
  type RichTextMentionService
} from "@tutti-os/ui-rich-text/service";
import type { RichTextTriggerProvider } from "@tutti-os/ui-rich-text/types";

export function AgentGUIMentionServiceBoundary({
  children,
  legacyProviders,
  service
}: {
  children: ReactNode;
  legacyProviders?: readonly RichTextTriggerProvider[];
  service?: RichTextMentionService;
}): ReactNode {
  const inheritedService = useRichTextMentionService();
  const legacyService = useMemo(
    () =>
      service || inheritedService || !legacyProviders?.length
        ? null
        : createRichTextMentionService({ providers: legacyProviders }),
    [inheritedService, legacyProviders, service]
  );
  const effectiveService = service ?? inheritedService ?? legacyService;

  return effectiveService && effectiveService !== inheritedService ? (
    <RichTextMentionServiceProvider service={effectiveService}>
      {children}
    </RichTextMentionServiceProvider>
  ) : (
    children
  );
}
