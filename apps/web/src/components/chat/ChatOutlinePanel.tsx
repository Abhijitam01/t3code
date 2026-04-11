/**
 * Minimap-style outline strip beside the chat content.
 * Shows a small bar per user message; hover to expand a popover with previews.
 * Click any bar or preview to scroll to that message.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UserIcon } from "lucide-react";
import type { TimelineEntry } from "../../session-logic";

interface OutlineEntry {
  readonly id: string;
  readonly preview: string;
}

interface ChatOutlinePanelProps {
  readonly timelineEntries: ReadonlyArray<TimelineEntry>;
  readonly scrollContainer: HTMLDivElement | null;
}

// ---------------------------------------------------------------------------
export const ChatOutlinePanel = memo(function ChatOutlinePanel({
  timelineEntries,
  scrollContainer,
}: ChatOutlinePanelProps) {
  // Derive user-only outline entries
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

  // Active message tracking via IntersectionObserver
  const [activeMessageIds, setActiveMessageIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  useEffect(() => {
    if (!scrollContainer) return;

    const visibleIds = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.messageId;
          if (!id) continue;
          if (entry.isIntersecting) {
            visibleIds.add(id);
          } else {
            visibleIds.delete(id);
          }
        }
        setActiveMessageIds(new Set(visibleIds));
      },
      { root: scrollContainer, threshold: 0.1 },
    );

    const elements = scrollContainer.querySelectorAll(
      '[data-message-role="user"]',
    );
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [scrollContainer, timelineEntries]);

  // Scroll to message on click — single handler using data attributes
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!scrollContainer) return;
      const messageId = e.currentTarget.dataset.outlineId;
      if (!messageId) return;
      const el = scrollContainer.querySelector(
        `[data-message-id="${CSS.escape(messageId)}"]`,
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
    [scrollContainer],
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
    // Positioned beside the max-w-3xl (768px) message content
    // 50% + half of 768px + small gap = right beside chat messages
    <div
      className="pointer-events-none absolute top-0 z-30"
      style={{ left: "calc(50% + 24rem + 0.5rem)" }}
    >
      {/* Strip — only wraps the bars */}
      <div
        className="pointer-events-auto relative flex w-5 flex-col items-center gap-[5px] py-4"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {outlineEntries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            data-outline-id={entry.id}
            onClick={handleClick}
            className={`h-[3px] w-4 shrink-0 rounded-full transition-colors ${
              activeMessageIds.has(entry.id)
                ? "bg-white/60"
                : "bg-white/25"
            } hover:bg-white/80`}
          />
        ))}

        {/* Popover — opens to the left */}
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
    </div>
  );
});
