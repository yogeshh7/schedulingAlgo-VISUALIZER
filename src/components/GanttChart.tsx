import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  getPlaybackFrame,
  getProcessColor,
  getProcessTextColor,
} from "../scheduler";
import type {
  ScheduleResult,
  SchedulingAlgorithm,
} from "../scheduler";

interface GanttChartProps {
  schedule: ScheduleResult;
  algorithm: SchedulingAlgorithm;
  algorithmName: string;
  selectedProcessId: number | null;
}

const LABEL_GUTTER = 104;

export default function GanttChart({
  schedule,
  algorithm,
  algorithmName,
  selectedProcessId,
}: GanttChartProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const playbackProgressRef = useRef(playbackProgress);
  const viewportRef = useRef<HTMLDivElement>(null);
  const activeSegmentRef = useRef<HTMLDivElement>(null);
  const manualScrollAtRef = useRef(0);
  const lastSegment = schedule.segments.at(-1);
  const totalDuration = lastSegment?.end ?? 0;
  const chartWidth = Math.max(720, Math.min(1400, totalDuration * 52));
  const timelineWidth = chartWidth + LABEL_GUTTER;
  const playbackDurationMs = Math.min(
    8000,
    Math.max(1200, totalDuration * 280),
  );
  const frame = getPlaybackFrame(schedule.segments, playbackProgress);
  const visibleTime = hasPlayed ? frame.currentTime : totalDuration;
  const activeSegment = schedule.segments.find(
    (segment) => segment.id === frame.activeSegmentId,
  );

  useEffect(() => {
    setIsPlaying(false);
    setHasPlayed(false);
    playbackProgressRef.current = 0;
    setPlaybackProgress(0);
  }, [schedule]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const startTime = performance.now();
    const startProgress = playbackProgressRef.current;
    let animationFrame = 0;

    function advance(now: number) {
      const progress = Math.min(
        1,
        startProgress + (now - startTime) / playbackDurationMs,
      );
      playbackProgressRef.current = progress;
      setPlaybackProgress(progress);
      if (progress < 1) {
        animationFrame = requestAnimationFrame(advance);
      } else {
        setIsPlaying(false);
      }
    }

    animationFrame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, playbackDurationMs]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const activeElement = activeSegmentRef.current;
    if (
      !isPlaying ||
      !viewport ||
      !activeElement ||
      performance.now() - manualScrollAtRef.current < 900
    ) {
      return;
    }

    const viewportBounds = viewport.getBoundingClientRect();
    const segmentBounds = activeElement.getBoundingClientRect();
    const segmentLeft =
      viewport.scrollLeft + segmentBounds.left - viewportBounds.left;
    const segmentRight = segmentLeft + segmentBounds.width;
    const viewportLeft = viewport.scrollLeft;
    const viewportRight = viewportLeft + viewport.clientWidth;

    if (segmentLeft < viewportLeft || segmentRight > viewportRight) {
      const target = Math.min(
        viewport.scrollWidth - viewport.clientWidth,
        Math.max(0, segmentLeft - viewport.clientWidth * 0.25),
      );
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      viewport.scrollTo({
        left: target,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    }
  }, [frame.activeSegmentId, isPlaying]);

  if (schedule.error) {
    return (
      <p className="border border-error bg-prussian-blue px-4 py-3 text-sm font-semibold text-error" role="alert">
        {schedule.error}
      </p>
    );
  }
  if (schedule.segments.length === 0 || !lastSegment) {
    return (
      <p className="border border-dashed border-oxford-navy bg-prussian-blue px-4 py-10 text-center text-sm text-gold">
        The timeline will appear here when you add a process.
      </p>
    );
  }

  function togglePlayback() {
    if (frame.complete) {
      playbackProgressRef.current = 0;
      setPlaybackProgress(0);
    }
    setHasPlayed(true);
    setIsPlaying((playing) => !playing);
  }

  return (
    <div
      aria-label="Scrollable Gantt chart. Scroll horizontally to inspect the full schedule."
      className="gantt-scroll-viewport overflow-x-auto pb-2  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      role="region"
      ref={viewportRef}
      tabIndex={0}
      onWheel={(event) => {
        if (event.deltaX !== 0 || event.shiftKey) {
          manualScrollAtRef.current = performance.now();
        }
      }}
      onTouchStart={() => {
        manualScrollAtRef.current = performance.now();
      }}
      onPointerDown={(event) => {
        const target = event.target;
        if (
          target instanceof Element &&
          !target.closest("button, input, label")
        ) {
          manualScrollAtRef.current = performance.now();
        }
      }}
    >
      <p className="mb-2 font-mono text-label text-gold">
        Scroll horizontally to view the full schedule.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          className="bg-accent px-4 py-2 text-sm font-bold text-ink-black hover:bg-accent-hover  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-oxford-navy disabled:text-gold"
          disabled={totalDuration <= 0}
          onClick={togglePlayback}
          type="button"
        >
          {isPlaying ? "Pause" : frame.complete ? "Replay" : "Play"}
        </button>
        <button
          className="border border-oxford-navy bg-prussian-blue px-4 py-2 text-sm font-bold text-school-bus-yellow hover:bg-oxford-navy  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onClick={() => {
            setIsPlaying(false);
            setHasPlayed(true);
            playbackProgressRef.current = 0;
            setPlaybackProgress(0);
          }}
          type="button"
        >
          Reset
        </button>
        <span className="font-mono text-xs tabular-nums text-gold">
          Time {frame.currentTime.toFixed(2)} / {totalDuration}
          {activeSegment?.type === "process"
            ? ` · P${activeSegment.processId} running`
            : activeSegment
              ? " · CPU idle"
              : frame.complete
                ? " · Complete"
                : ""}
        </span>
      </div>
      <label className="mb-4 flex items-center gap-3 font-mono text-xs text-gold">
        <span className="sr-only">Schedule playback position</span>
        <input
          aria-label="Schedule playback position"
          className="h-2 w-full cursor-pointer accent-accent"
          max={totalDuration}
          min={0}
          onChange={(event) => {
            setIsPlaying(false);
            setHasPlayed(true);
            const progress = Number(event.target.value) / totalDuration;
            playbackProgressRef.current = progress;
            setPlaybackProgress(progress);
          }}
          step="any"
          type="range"
          value={frame.currentTime}
        />
      </label>
      <div
        className="gantt-timeline relative"
        style={{ width: `${timelineWidth}px` }}
      >
        <div
          className="gantt-track relative h-24 border border-oxford-navy"
          role="img"
          aria-label={`${algorithmName} schedule from time 0 to ${lastSegment.end}. Segments are revealed as playback advances.`}
          style={{ width: `${chartWidth}px` }}
        >
          {schedule.segments.map((segment) => {
            const duration = segment.end - segment.start;
            const visibleDuration = Math.max(
              0,
              Math.min(duration, visibleTime - segment.start),
            );
            const visibleWidth = (visibleDuration / totalDuration) * chartWidth;
            if (visibleWidth <= 0) {
              return null;
            }

            const processSegment =
              segment.type === "process" ? segment : undefined;
            const isIdle = segment.type === "idle";
            const isActive = frame.activeSegmentId === segment.id;
            const isSelected =
              processSegment?.processId === selectedProcessId;
            const isLast = segment.id === lastSegment.id;
            const showLabel = visibleWidth >= 48 || isLast;
            const style: CSSProperties & {
              "--process-color"?: string;
              "--process-text-color"?: string;
            } = {
              left: `${(segment.start / totalDuration) * chartWidth}px`,
              width: `${visibleWidth}px`,
            };
            if (processSegment) {
              style["--process-color"] = getProcessColor(
                processSegment.processId,
              );
              style["--process-text-color"] = getProcessTextColor(
                processSegment.processId,
              );
            }

            return (
              <div
                aria-current={isActive ? "step" : undefined}
                aria-hidden="true"
                className={`gantt-segment absolute inset-y-0 overflow-visible border-r border-ink-black px-2 py-2 ${
                  isIdle
                    ? "gantt-idle-segment"
                    : "gantt-process-segment"
                }${isActive ? " is-active" : ""}${isSelected ? " is-selected" : ""}`}
                key={segment.id}
                ref={isActive ? activeSegmentRef : undefined}
                style={style}
                title={
                  isIdle
                    ? `CPU IDLE: ${segment.start} to ${segment.end}`
                    : `P${processSegment?.processId}: ${segment.start} to ${segment.end}; ${processSegment?.remainingTime} remaining`
                }
              >
                {showLabel && (
                  <span className="gantt-segment-label font-mono text-sm font-bold">
                    {isIdle ? "IDLE" : `P${processSegment?.processId}`}
                  </span>
                )}
                {visibleWidth >= 114 && (
                  <span className="gantt-segment-details mt-6 block font-mono text-xs tabular-nums">
                    {segment.start}–{segment.end}
                    {processSegment &&
                      (algorithm === "SRTF" ||
                        algorithm === "Round Robin" ||
                        algorithm === "Priority") &&
                      ` · left ${processSegment.remainingTime}`}
                  </span>
                )}
              </div>
            );
          })}
          {hasPlayed && (
            <span
              aria-hidden="true"
              className="gantt-playhead absolute bottom-0 top-0 z-10 w-0.5 bg-accent"
              style={{
                left: `${(frame.currentTime / totalDuration) * chartWidth}px`,
              }}
            />
          )}
        </div>
        <div
          aria-hidden="true"
          className="gantt-axis relative pt-2 font-mono text-label tabular-nums text-gold"
          style={{ width: `${timelineWidth}px` }}
        >
          {schedule.segments.map((segment, index) => {
            const isLastTick = index === schedule.segments.length - 1;
            return (
              <span
                className={`absolute top-2 whitespace-nowrap ${
                  isLastTick ? "" : "-translate-x-1/2"
                }`}
                key={segment.id}
                style={{ left: `${(segment.end / totalDuration) * chartWidth}px` }}
              >
                {segment.end}
              </span>
            );
          })}
          <span className="absolute left-0 top-2">0</span>
        </div>
      </div>
      <ol className="sr-only" aria-label="Complete schedule segments">
        {schedule.segments.map((segment) => (
          <li key={segment.id}>
            {segment.type === "idle"
              ? `CPU idle from ${segment.start} to ${segment.end}`
              : `Process ${segment.processId} from ${segment.start} to ${segment.end}`}
          </li>
        ))}
      </ol>
    </div>
  );
}
