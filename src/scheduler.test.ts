import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSchedule,
  getProcessColor,
  getProcessOrder,
  getPlaybackFrame,
  getProcessTextColor,
  getScheduleMetrics,
  parsePriority,
  parseProcessTimes,
} from "./scheduler";
import type { Process } from "./scheduler";

function simplifiedSegments(schedule: ReturnType<typeof buildSchedule>) {
  return schedule.segments.map((segment) => ({
    type: segment.type,
    processId: segment.type === "process" ? segment.processId : undefined,
    start: segment.start,
    end: segment.end,
    remainingTime:
      segment.type === "process" ? segment.remainingTime : undefined,
  }));
}

test("validates process times and integer priorities", () => {
  assert.match(parseProcessTimes("", "2").error ?? "", /arrival time/i);
  assert.match(parseProcessTimes("-1", "2").error ?? "", /arrival time/i);
  assert.match(parseProcessTimes("0", "").error ?? "", /burst time/i);
  assert.match(parseProcessTimes("0", "0").error ?? "", /burst time/i);
  assert.match(parseProcessTimes("0", "-2").error ?? "", /burst time/i);
  assert.match(parseProcessTimes("0", "Infinity").error ?? "", /burst time/i);
  assert.deepEqual(parseProcessTimes("0", "2").value, {
    arrivalTime: 0,
    burstTime: 2,
  });
  assert.match(parsePriority("").error ?? "", /priority/i);
  assert.match(parsePriority("1.5").error ?? "", /integer/i);
  assert.equal(parsePriority("-2").value, -2);
});

test("sorts table order by arrival and breaks ties by process insertion id", () => {
  const processes: Process[] = [
    { id: 3, arrivalTime: 4, burstTime: 1 },
    { id: 2, arrivalTime: 0, burstTime: 2 },
    { id: 1, arrivalTime: 0, burstTime: 3 },
  ];

  assert.deepEqual(
    getProcessOrder(processes).map((process) => process.id),
    [1, 2, 3],
  );
});

test("FCFS runs in arrival order and shows idle time before and between jobs", () => {
  const processes: Process[] = [
    { id: 1, arrivalTime: 3, burstTime: 2 },
    { id: 2, arrivalTime: 10, burstTime: 1 },
  ];

  assert.deepEqual(
    simplifiedSegments(buildSchedule(processes, "FCFS")),
    [
      { type: "idle", processId: undefined, start: 0, end: 3, remainingTime: undefined },
      { type: "process", processId: 1, start: 3, end: 5, remainingTime: 0 },
      { type: "idle", processId: undefined, start: 5, end: 10, remainingTime: undefined },
      { type: "process", processId: 2, start: 10, end: 11, remainingTime: 0 },
    ],
  );
});

test("SJF selects the shortest available job without preempting it", () => {
  const schedule = buildSchedule(
    [
      { id: 1, arrivalTime: 0, burstTime: 7 },
      { id: 2, arrivalTime: 2, burstTime: 4 },
      { id: 3, arrivalTime: 4, burstTime: 1 },
      { id: 4, arrivalTime: 0, burstTime: 3 },
    ],
    "SJF",
  );

  assert.deepEqual(
    simplifiedSegments(schedule).map(({ processId, start, end }) => ({
      processId,
      start,
      end,
    })),
    [
      { processId: 4, start: 0, end: 3 },
      { processId: 2, start: 3, end: 7 },
      { processId: 3, start: 7, end: 8 },
      { processId: 1, start: 8, end: 15 },
    ],
  );
});

test("SJF breaks equal burst ties by arrival and insertion order", () => {
  const schedule = buildSchedule(
    [
      { id: 2, arrivalTime: 0, burstTime: 3 },
      { id: 1, arrivalTime: 0, burstTime: 3 },
    ],
    "SJF",
  );

  assert.deepEqual(
    schedule.segments.map((segment) =>
      segment.type === "process" ? segment.processId : null,
    ),
    [1, 2],
  );
});

test("SRTF preempts on shorter arrivals and preserves remaining times", () => {
  const schedule = buildSchedule(
    [
      { id: 1, arrivalTime: 0, burstTime: 7 },
      { id: 2, arrivalTime: 2, burstTime: 4 },
      { id: 3, arrivalTime: 4, burstTime: 1 },
    ],
    "SRTF",
  );

  assert.deepEqual(
    simplifiedSegments(schedule).map(({ processId, start, end, remainingTime }) => ({
      processId,
      start,
      end,
      remainingTime,
    })),
    [
      { processId: 1, start: 0, end: 2, remainingTime: 5 },
      { processId: 2, start: 2, end: 4, remainingTime: 2 },
      { processId: 3, start: 4, end: 5, remainingTime: 0 },
      { processId: 2, start: 5, end: 7, remainingTime: 0 },
      { processId: 1, start: 7, end: 12, remainingTime: 0 },
    ],
  );
});

test("SRTF resolves arrival-time and remaining-time ties deterministically", () => {
  const schedule = buildSchedule(
    [
      { id: 2, arrivalTime: 0, burstTime: 2 },
      { id: 1, arrivalTime: 0, burstTime: 2 },
    ],
    "SRTF",
  );

  assert.deepEqual(
    schedule.segments.map((segment) =>
      segment.type === "process" ? segment.processId : null,
    ),
    [1, 2],
  );
});

test("does not split an SRTF process when a longer job arrives", () => {
  const schedule = buildSchedule(
    [
      { id: 1, arrivalTime: 0, burstTime: 8 },
      { id: 2, arrivalTime: 2, burstTime: 10 },
    ],
    "SRTF",
  );

  assert.deepEqual(
    schedule.segments.map((segment) => ({
      processId: segment.type === "process" ? segment.processId : null,
      start: segment.start,
      end: segment.end,
    })),
    [
      { processId: 1, start: 0, end: 8 },
      { processId: 2, start: 8, end: 18 },
    ],
  );
});

test("Round Robin rotates the ready queue and requeues unfinished processes", () => {
  const schedule = buildSchedule(
    [
      { id: 1, arrivalTime: 0, burstTime: 5 },
      { id: 2, arrivalTime: 1, burstTime: 3 },
      { id: 3, arrivalTime: 2, burstTime: 1 },
    ],
    "Round Robin",
    { timeQuantum: 2 },
  );

  assert.deepEqual(
    simplifiedSegments(schedule).map(({ processId, start, end, remainingTime }) => ({
      processId,
      start,
      end,
      remainingTime,
    })),
    [
      { processId: 1, start: 0, end: 2, remainingTime: 3 },
      { processId: 2, start: 2, end: 4, remainingTime: 1 },
      { processId: 3, start: 4, end: 5, remainingTime: 0 },
      { processId: 1, start: 5, end: 7, remainingTime: 1 },
      { processId: 2, start: 7, end: 8, remainingTime: 0 },
      { processId: 1, start: 8, end: 9, remainingTime: 0 },
    ],
  );
});

test("Round Robin preserves arrivals across idle gaps and validates its quantum", () => {
  const schedule = buildSchedule(
    [
      { id: 1, arrivalTime: 3, burstTime: 1 },
      { id: 2, arrivalTime: 8, burstTime: 2 },
    ],
    "Round Robin",
    { timeQuantum: 1 },
  );

  assert.deepEqual(
    simplifiedSegments(schedule).map(({ type, processId, start, end }) => ({
      type,
      processId,
      start,
      end,
    })),
    [
      { type: "idle", processId: undefined, start: 0, end: 3 },
      { type: "process", processId: 1, start: 3, end: 4 },
      { type: "idle", processId: undefined, start: 4, end: 8 },
      { type: "process", processId: 2, start: 8, end: 10 },
    ],
  );
  assert.match(
    buildSchedule([{ id: 1, arrivalTime: 0, burstTime: 2 }], "Round Robin", {
      timeQuantum: 0,
    }).error ?? "",
    /time quantum/i,
  );
});

test("preemptive Priority runs lower numbers first and switches on higher priority arrivals", () => {
  const schedule = buildSchedule(
    [
      { id: 1, arrivalTime: 0, burstTime: 7, priority: 3 },
      { id: 2, arrivalTime: 2, burstTime: 4, priority: 2 },
      { id: 3, arrivalTime: 4, burstTime: 1, priority: 1 },
    ],
    "Priority",
  );

  assert.deepEqual(
    simplifiedSegments(schedule).map(({ processId, start, end, remainingTime }) => ({
      processId,
      start,
      end,
      remainingTime,
    })),
    [
      { processId: 1, start: 0, end: 2, remainingTime: 5 },
      { processId: 2, start: 2, end: 4, remainingTime: 2 },
      { processId: 3, start: 4, end: 5, remainingTime: 0 },
      { processId: 2, start: 5, end: 7, remainingTime: 0 },
      { processId: 1, start: 7, end: 12, remainingTime: 0 },
    ],
  );
});

test("Priority keeps existing work ahead of equal-priority later arrivals", () => {
  const schedule = buildSchedule(
    [
      { id: 1, arrivalTime: 0, burstTime: 3, priority: 1 },
      { id: 2, arrivalTime: 1, burstTime: 1, priority: 1 },
    ],
    "Priority",
  );

  assert.deepEqual(
    schedule.segments.map((segment) => ({
      processId: segment.type === "process" ? segment.processId : null,
      start: segment.start,
      end: segment.end,
    })),
    [
      { processId: 1, start: 0, end: 3 },
      { processId: 2, start: 3, end: 4 },
    ],
  );
  assert.match(
    buildSchedule([{ id: 1, arrivalTime: 0, burstTime: 2 }], "Priority").error ?? "",
    /priority/i,
  );
});

test("rejects unknown algorithms and schedules that overflow", () => {
  assert.match(buildSchedule([], "not-an-algorithm").error ?? "", /unknown/i);
  const processes: Process[] = [
    { id: 1, arrivalTime: 0, burstTime: Number.MAX_VALUE, priority: 1 },
    { id: 2, arrivalTime: 0, burstTime: Number.MAX_VALUE, priority: 2 },
  ];
  assert.match(buildSchedule(processes, "FCFS").error ?? "", /supported schedule range/i);
  assert.match(buildSchedule(processes, "SJF").error ?? "", /supported schedule range/i);
  assert.match(buildSchedule(processes, "SRTF").error ?? "", /supported schedule range/i);
  assert.match(
    buildSchedule(processes, "Priority").error ?? "",
    /supported schedule range/i,
  );
  assert.match(
    buildSchedule(processes, "Round Robin", { timeQuantum: Number.MAX_VALUE }).error ?? "",
    /supported schedule range/i,
  );
});

test("assigns each process a deterministic color from the visualizer palette", () => {
  const palette = [
    "#5EEAD4",
    "#93C5FD",
    "#C4B5FD",
    "#F9A8D4",
    "#FDBA74",
    "#A7F3D0",
    "#FDE68A",
    "#FDA4AF",
  ];
  const colors = palette.map((_, index) => getProcessColor(index + 1));
  assert.deepEqual(colors, palette);
  assert.equal(getProcessColor(9), palette[0]);
  assert.equal(getProcessTextColor(1), "#111827");
  assert.equal(getProcessTextColor(3), "#111827");
});

test("calculates average waiting and turnaround times for a schedule", () => {
  const processes: Process[] = [
    { id: 1, arrivalTime: 0, burstTime: 7 },
    { id: 2, arrivalTime: 2, burstTime: 4 },
    { id: 3, arrivalTime: 4, burstTime: 1 },
  ];
  const { segments } = buildSchedule(processes, "SRTF");

  assert.deepEqual(getScheduleMetrics(processes, segments), {
    averageWaitingTime: 2,
    averageTurnaroundTime: 6,
  });
});

test("returns empty metrics when there are no processes or a schedule is incomplete", () => {
  assert.deepEqual(getScheduleMetrics([], []), {
    averageWaitingTime: null,
    averageTurnaroundTime: null,
  });
  assert.deepEqual(
    getScheduleMetrics([{ id: 1, arrivalTime: 0, burstTime: 2 }], []),
    { averageWaitingTime: null, averageTurnaroundTime: null },
  );
});

test("keeps floating-point precision from producing negative zero wait", () => {
  const processes: Process[] = [{ id: 1, arrivalTime: 8, burstTime: 0.1 }];
  const { segments } = buildSchedule(processes, "FCFS");

  assert.equal(getScheduleMetrics(processes, segments).averageWaitingTime, 0);
});

test("playback frames advance across process and idle segments and clamp at schedule bounds", () => {
  const { segments } = buildSchedule(
    [
      { id: 1, arrivalTime: 2, burstTime: 2 },
      { id: 2, arrivalTime: 8, burstTime: 2 },
    ],
    "FCFS",
  );

  assert.deepEqual(getPlaybackFrame(segments, 0), {
    currentTime: 0,
    activeSegmentId: segments[0].id,
    progress: 0,
    complete: false,
  });
  assert.equal(getPlaybackFrame(segments, 0.3).activeSegmentId, segments[1].id);
  assert.equal(getPlaybackFrame(segments, 0.6).activeSegmentId, segments[2].id);
  assert.equal(getPlaybackFrame(segments, -1).currentTime, 0);
  assert.deepEqual(getPlaybackFrame(segments, 1), {
    currentTime: 10,
    activeSegmentId: null,
    progress: 1,
    complete: true,
  });
  assert.equal(getPlaybackFrame(segments, 2).complete, true);
});
