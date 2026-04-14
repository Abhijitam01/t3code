/**
 * Minimap-style outline strip beside the chat content.
 * Shows a small bar per user message; hover to expand a popover with previews.
 * Click any bar or preview to scroll to that message.
 *
 * Uses MutationObserver + IntersectionObserver to handle @tanstack/react-virtual
 * row mount/unmount — elements are tracked as the virtualizer creates them.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UserIcon } from "lucide-react";
import type { TimelineEntry } from "../../session-logic";


interface ChatOutlinePanelProps {
  readonly timelineEntries: ReadonlyArray<TimelineEntry>;
  readonly scrollContainer: HTMLDivElement | null;
  readonly onScrollToMessage: React.MutableRefObject<((messageId: string) => void) | null>;
}

export const ChatOutlinePanel = memo(function ChatOutlinePanel({
  timelineEntries,
  scrollContainer,
  onScrollToMessage,
}: ChatOutlinePanelProps) {
  const outlineEntries = useMemo(
    () =>
      timelineEntries
        .filter(
          (e): e is TimelineEntry & { kind: "message" } => e.kind === "message",
        )
        .filter((e) => e.message.role === "user")
        .map((e) => ({
          id: e.message.id,
          preview: e.message.text.split("\n")[0]?.slice(0, 80) ?? "",
        })),
    [timelineEntries],
  );

  // Active message tracking — MutationObserver watches for virtualizer
  // mount/unmount, IntersectionObserver tracks visibility.
  const [activeMessageIds, setActiveMessageIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  useEffect(() => {
    if (!scrollContainer) return;

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        setActiveMessageIds((prev) => {
          let changed = false;
          const next = new Set(prev);
          for (const entry of entries) {
            const id = (entry.target as HTMLElement).dataset.messageId;
            if (!id) continue;
            const sizeBefore = next.size;
            if (entry.isIntersecting) {
              next.add(id);
            } else {
              next.delete(id);
            }
            if (next.size !== sizeBefore) changed = true;
          }
          return changed ? next : prev;
        });
      },
      { root: scrollContainer, threshold: 0.1 },
    );

    // Observe any user-message element currently in the DOM
    const observeUserMessages = (root: Element) => {
      root.querySelectorAll('[data-message-role="user"]').forEach((el) => {
        intersectionObserver.observe(el);
      });
    };

    // Initial pass for elements already rendered
    observeUserMessages(scrollContainer);

    // Watch for virtualizer adding/removing rows
    const mutationObserver = new MutationObserver((mutations) => {
      const removedIds: string[] = [];
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.dataset.messageRole === "user") {
            intersectionObserver.observe(node);
          } else {
            observeUserMessages(node);
          }
        }
        for (const node of mutation.removedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          // Only collect user-message IDs (matches IntersectionObserver scope)
          if (node.dataset.messageRole === "user" && node.dataset.messageId) {
            removedIds.push(node.dataset.messageId);
          } else {
            node.querySelectorAll('[data-message-role="user"][data-message-id]').forEach((el) => {
              const nestedId = (el as HTMLElement).dataset.messageId;
              if (nestedId) removedIds.push(nestedId);
            });
          }
        }
      }
      if (removedIds.length > 0) {
        setActiveMessageIds((prev) => {
          let changed = false;
          const next = new Set(prev);
          for (const id of removedIds) {
            if (next.delete(id)) changed = true;
          }
          return changed ? next : prev;
        });
      }
    });

    mutationObserver.observe(scrollContainer, { childList: true, subtree: true });

    return () => {
      intersectionObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [scrollContainer]);

  // Scroll to message via virtualizer (works for all messages, including off-screen)
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const messageId = e.currentTarget.dataset.outlineId;
      if (!messageId) return;
      // Use virtualizer scrollToIndex — handles off-screen virtualized rows
      if (onScrollToMessage.current) {
        onScrollToMessage.current(messageId);
        return;
      }
      // Fallback: querySelector for elements currently in DOM
      if (!scrollContainer) return;
      const el = scrollContainer.querySelector(
        `[data-message-id="${CSS.escape(messageId)}"]`,
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
    [onScrollToMessage, scrollContainer],
  );

  // Hover state — shows expanded popover
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 200);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  if (outlineEntries.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute top-0 z-30"
      style={{ left: "calc(50% + 24rem + 0.5rem)" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="pointer-events-auto relative flex max-h-40 w-5 flex-col items-center gap-[5px] overflow-y-auto py-4">
        {outlineEntries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            data-outline-id={entry.id}
            onClick={handleClick}
            className={`h-[3px] w-4 shrink-0 rounded-full transition-colors ${
              activeMessageIds.has(entry.id)
                ? "bg-foreground/60"
                : "bg-foreground/25"
            } hover:bg-foreground/80`}
          />
        ))}
      </div>

      {isHovered ? (
        <div
          className="pointer-events-auto absolute top-0 right-full mr-2 w-56 rounded-md border border-border bg-popover p-1.5 shadow-lg"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="max-h-72 overflow-y-auto">
            {outlineEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                data-outline-id={entry.id}
                onClick={handleClick}
                className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent/50 ${
                  activeMessageIds.has(entry.id) ? "bg-accent/30" : ""
                }`}
              >
                <UserIcon className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="line-clamp-2 text-muted-foreground">
                  {entry.preview || "(empty)"}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
});
