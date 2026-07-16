import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type ReactNode,
  type TransitionEvent
} from "react";
import {
  finishAgentTurnDisclosureDiagnostic,
  logActiveAgentTurnDisclosureFromElement
} from "./agentTurnDisclosureDiagnostics";

interface CollapsibleRevealProps {
  expanded: boolean;
  children: ReactNode;
  className?: string;
  diagnosticId?: string;
  innerClassName?: string;
  preMountOnIdle?: boolean;
}

export function CollapsibleReveal({
  expanded,
  children,
  className,
  diagnosticId,
  innerClassName,
  preMountOnIdle = false
}: CollapsibleRevealProps): JSX.Element | null {
  "use memo";
  const [mounted, setMounted] = useState(expanded);
  const [visible, setVisible] = useState(expanded);
  const [height, setHeight] = useState<string>(expanded ? "auto" : "0px");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const heightRef = useRef(height);
  const measuredHeightRef = useRef<number | null>(null);
  const previousExpandedRef = useRef(expanded);

  const setRevealHeight = useCallback((nextHeight: string) => {
    heightRef.current = nextHeight;
    setHeight(nextHeight);
  }, []);

  useLayoutEffect(() => {
    if (!expanded || mounted) {
      return undefined;
    }
    if (preMountOnIdle) {
      setMounted(true);
      return undefined;
    }
    const animationFrame = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [expanded, mounted, preMountOnIdle]);

  useEffect(() => {
    if (!preMountOnIdle || mounted || expanded) {
      return undefined;
    }

    const mountCollapsedContent = () => setMounted(true);
    if ("requestIdleCallback" in window) {
      const idleCallbackId = window.requestIdleCallback(mountCollapsedContent, {
        timeout: 600
      });
      return () => window.cancelIdleCallback(idleCallbackId);
    }

    const timeoutId = globalThis.setTimeout(mountCollapsedContent, 120);
    return () => globalThis.clearTimeout(timeoutId);
  }, [expanded, mounted, preMountOnIdle]);

  useLayoutEffect(() => {
    if (!mounted) {
      return undefined;
    }

    const root = rootRef.current;
    if (!root) {
      return undefined;
    }

    const wasExpanded = previousExpandedRef.current;
    previousExpandedRef.current = expanded;

    if (expanded) {
      if (wasExpanded && visible && height === "auto") {
        return undefined;
      }
      setVisible(false);
      setRevealHeight("0px");
      const animationFrame = requestAnimationFrame(() => {
        measuredHeightRef.current = root.scrollHeight;
        if (diagnosticId) {
          logActiveAgentTurnDisclosureFromElement(
            root,
            "reveal-expand-measure",
            {
              rootScrollHeight: root.scrollHeight,
              innerScrollHeight: innerRef.current?.scrollHeight ?? null,
              renderedHeight: root.getBoundingClientRect().height,
              targetHeight: measuredHeightRef.current
            }
          );
        }
        setVisible(true);
        setRevealHeight(`${measuredHeightRef.current}px`);
      });
      return () => cancelAnimationFrame(animationFrame);
    }

    if (!wasExpanded) {
      setVisible(false);
      setRevealHeight("0px");
      return undefined;
    }

    const renderedHeight = root.getBoundingClientRect().height;
    const cachedHeight = measuredHeightRef.current;
    const measuredHeight =
      renderedHeight > 0 ? renderedHeight : (cachedHeight ?? root.scrollHeight);
    measuredHeightRef.current = measuredHeight;
    if (diagnosticId) {
      logActiveAgentTurnDisclosureFromElement(root, "reveal-collapse-lock", {
        renderedHeight,
        rootScrollHeight: root.scrollHeight,
        innerScrollHeight: innerRef.current?.scrollHeight ?? null,
        cachedHeight,
        targetHeight: measuredHeight
      });
    }
    setRevealHeight(`${measuredHeight}px`);
    setVisible(false);
    const animationFrame = requestAnimationFrame(() => {
      setRevealHeight("0px");
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [expanded, mounted]);

  useLayoutEffect(() => {
    if (!mounted || !expanded || !visible) {
      return undefined;
    }

    const root = rootRef.current;
    const inner = innerRef.current;
    if (!root || !inner || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    let animationFrame: number | null = null;
    const resizeObserver = new ResizeObserver((entries) => {
      const innerScrollHeight = inner.scrollHeight;
      const nextHeight = Math.ceil(
        innerScrollHeight > 0
          ? innerScrollHeight
          : (entries[0]?.contentRect.height ?? 0)
      );
      const previousHeight = measuredHeightRef.current;
      if (!nextHeight || previousHeight === nextHeight) {
        return;
      }

      measuredHeightRef.current = nextHeight;
      if (diagnosticId) {
        logActiveAgentTurnDisclosureFromElement(root, "reveal-resize", {
          expanded,
          visible,
          explicitHeight: heightRef.current,
          rootRenderedHeight: root.getBoundingClientRect().height,
          innerScrollHeight,
          contentRectHeight: entries[0]?.contentRect.height ?? null,
          previousHeight,
          nextHeight
        });
      }
      if (heightRef.current === "auto") {
        return;
      }
      setRevealHeight(
        `${previousHeight ?? root.getBoundingClientRect().height}px`
      );
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
      animationFrame = requestAnimationFrame(() => {
        setRevealHeight(`${nextHeight}px`);
      });
    });

    resizeObserver.observe(inner);
    return () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
      resizeObserver.disconnect();
    };
  }, [expanded, mounted, setRevealHeight, visible]);

  if (!mounted) {
    return null;
  }

  const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (
      event.target !== event.currentTarget ||
      (event.propertyName ? event.propertyName !== "height" : false)
    ) {
      return;
    }
    if (visible) {
      setRevealHeight("auto");
      if (diagnosticId) {
        finishAgentTurnDisclosureDiagnostic(
          event.currentTarget,
          diagnosticId,
          "reveal-transition-end",
          {
            expanded,
            visible,
            finalHeight: event.currentTarget.getBoundingClientRect().height,
            nextHeight: "auto"
          }
        );
      }
      return;
    }
    if (diagnosticId) {
      finishAgentTurnDisclosureDiagnostic(
        event.currentTarget,
        diagnosticId,
        "reveal-transition-end",
        {
          expanded,
          visible,
          finalHeight: event.currentTarget.getBoundingClientRect().height,
          nextHeight: "0px",
          willUnmount: !expanded && !preMountOnIdle
        }
      );
    }
    if (!expanded && !preMountOnIdle) {
      setMounted(false);
    }
  };

  const rootStyle: CSSProperties = { height };

  return (
    <div
      ref={rootRef}
      className={["agent-collapsible-reveal", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      data-expanded={
        preMountOnIdle && expanded ? "true" : visible ? "true" : "false"
      }
      aria-hidden={visible ? undefined : true}
      style={rootStyle}
      onTransitionEnd={handleTransitionEnd}
    >
      <div
        ref={innerRef}
        className={["agent-collapsible-reveal__inner", innerClassName ?? ""]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
    </div>
  );
}
