export interface Process {
  id: number;
  arrivalTime: number;
  burstTime: number;
  priority?: number;
}

export type SchedulingAlgorithm =
  | "FCFS"
  | "SJF"
  | "SRTF"
  | "Round Robin"
  | "Priority";

export interface ScheduleOptions {
  timeQuantum?: number;
}

export interface ProcessSegment {
  id: string;
  type: "process";
  processId: number;
  start: number;
  end: number;
  remainingTime: number;
}

export interface IdleSegment {
  id: string;
  type: "idle";
  start: number;
  end: number;
}

export type ScheduleSegment = ProcessSegment | IdleSegment;

export interface ScheduleResult {
  segments: ScheduleSegment[];
  error: string | null;
}

export interface PlaybackFrame {
  currentTime: number;
  activeSegmentId: string | null;
  progress: number;
  complete: boolean;
}

export interface ScheduleMetrics {
  averageWaitingTime: number | null;
  averageTurnaroundTime: number | null;
}

export interface ProcessTimes {
  arrivalTime: number;
  burstTime: number;
}

export const schedulingAlgorithms: SchedulingAlgorithm[] = [
  "FCFS",
  "SJF",
  "SRTF",
  "Round Robin",
  "Priority",
];

export function parseProcessTimes(
  arrivalInput: string,
  burstInput: string,
): { value: ProcessTimes | null; error: string | null } {
  if (arrivalInput.trim() === "") {
    return { value: null, error: "Enter an arrival time of 0 or greater." };
  }

  const arrivalTime = Number(arrivalInput);
  if (!Number.isFinite(arrivalTime) || arrivalTime < 0) {
    return {
      value: null,
      error: "Arrival time must be a finite number of 0 or greater.",
    };
  }

  if (burstInput.trim() === "") {
    return { value: null, error: "Enter a burst time greater than 0." };
  }

  const burstTime = Number(burstInput);
  if (!Number.isFinite(burstTime) || burstTime <= 0) {
    return {
      value: null,
      error: "Burst time must be a finite number greater than 0.",
    };
  }

  return { value: { arrivalTime, burstTime }, error: null };
}

export function parsePriority(priorityInput: string): {
  value: number | null;
  error: string | null;
} {
  if (priorityInput.trim() === "") {
    return { value: null, error: "Enter an integer priority." };
  }

  const priority = Number(priorityInput);
  if (!Number.isSafeInteger(priority)) {
    return { value: null, error: "Priority must be a safe integer." };
  }

  return { value: priority, error: null };
}

export function getProcessOrder<T extends Process>(processes: T[]): T[] {
  return [...processes].sort(
    (first, second) =>
      first.arrivalTime - second.arrivalTime || first.id - second.id,
  );
}

function addIdleSegment(
  segments: ScheduleSegment[],
  start: number,
  end: number,
): void {
  segments.push({
    id: `idle-${segments.length}`,
    type: "idle",
    start,
    end,
  });
}

function addProcessSegment(
  segments: ScheduleSegment[],
  process: Process,
  start: number,
  end: number,
  remainingTime: number,
): void {
  const previous = segments.at(-1);
  if (
    previous?.type === "process" &&
    previous.processId === process.id &&
    previous.end === start
  ) {
    previous.end = end;
    previous.remainingTime = remainingTime;
    return;
  }

  segments.push({
    id: `process-${process.id}-${segments.length}`,
    type: "process",
    processId: process.id,
    start,
    end,
    remainingTime,
  });
}

function invalidSchedule(message: string): ScheduleResult {
  return { segments: [], error: message };
}

function runFcfs(processes: Process[]): ScheduleResult {
  const segments: ScheduleSegment[] = [];
  let currentTime = 0;

  for (const process of getProcessOrder(processes)) {
    if (process.arrivalTime > currentTime) {
      addIdleSegment(segments, currentTime, process.arrivalTime);
      currentTime = process.arrivalTime;
    }

    const completionTime = currentTime + process.burstTime;
    if (!Number.isFinite(completionTime)) {
      return invalidSchedule(
        "These process times exceed the supported schedule range.",
      );
    }

    addProcessSegment(segments, process, currentTime, completionTime, 0);
    currentTime = completionTime;
  }

  return { segments, error: null };
}

function runSjf(processes: Process[]): ScheduleResult {
  const pending = getProcessOrder(processes);
  const segments: ScheduleSegment[] = [];
  let currentTime = 0;

  while (pending.length > 0) {
    const available = pending.filter(
      (process) => process.arrivalTime <= currentTime,
    );
    if (available.length === 0) {
      const nextArrival = pending[0].arrivalTime;
      addIdleSegment(segments, currentTime, nextArrival);
      currentTime = nextArrival;
      continue;
    }

    available.sort(
      (first, second) =>
        first.burstTime - second.burstTime ||
        first.arrivalTime - second.arrivalTime ||
        first.id - second.id,
    );
    const process = available[0];
    pending.splice(
      pending.findIndex((candidate) => candidate.id === process.id),
      1,
    );

    const completionTime = currentTime + process.burstTime;
    if (!Number.isFinite(completionTime)) {
      return invalidSchedule(
        "These process times exceed the supported schedule range.",
      );
    }

    addProcessSegment(segments, process, currentTime, completionTime, 0);
    currentTime = completionTime;
  }

  return { segments, error: null };
}

function runPreemptive(
  processes: Process[],
  compare: (
    first: Process,
    second: Process,
    remainingTimes: ReadonlyMap<number, number>,
  ) => number,
): ScheduleResult {
  const incoming = getProcessOrder(processes);
  const remaining = new Map(
    processes.map((process) => [process.id, process.burstTime]),
  );
  const ready: Process[] = [];
  const segments: ScheduleSegment[] = [];
  let nextProcessIndex = 0;
  let currentTime = 0;

  while (nextProcessIndex < incoming.length || ready.length > 0) {
    while (
      nextProcessIndex < incoming.length &&
      incoming[nextProcessIndex].arrivalTime <= currentTime
    ) {
      ready.push(incoming[nextProcessIndex]);
      nextProcessIndex += 1;
    }

    for (let index = ready.length - 1; index >= 0; index -= 1) {
      if (remaining.get(ready[index].id) === 0) {
        ready.splice(index, 1);
      }
    }

    if (ready.length === 0) {
      if (nextProcessIndex >= incoming.length) {
        break;
      }
      const nextArrival = incoming[nextProcessIndex].arrivalTime;
      addIdleSegment(segments, currentTime, nextArrival);
      currentTime = nextArrival;
      continue;
    }

    ready.sort((first, second) => compare(first, second, remaining));
    const process = ready[0];
    const processRemaining = remaining.get(process.id);
    if (processRemaining === undefined) {
      return invalidSchedule("Unable to find remaining process time.");
    }

    const completionTime = currentTime + processRemaining;
    if (!Number.isFinite(completionTime)) {
      return invalidSchedule(
        "These process times exceed the supported schedule range.",
      );
    }

    const nextArrival = incoming[nextProcessIndex]?.arrivalTime ?? Infinity;
    const endTime = Math.min(completionTime, nextArrival);
    if (endTime <= currentTime) {
      return invalidSchedule(
        "Unable to advance the schedule with these process times.",
      );
    }

    const finishes = endTime === completionTime;
    const timeUsed = endTime - currentTime;
    let remainingTime = finishes ? 0 : processRemaining - timeUsed;
    const precisionLimit = Number.EPSILON * Math.max(1, processRemaining);
    if (remainingTime <= precisionLimit) {
      remainingTime = 0;
    }

    remaining.set(process.id, remainingTime);
    addProcessSegment(
      segments,
      process,
      currentTime,
      endTime,
      remainingTime,
    );
    currentTime = endTime;
  }

  return { segments, error: null };
}

function runRoundRobin(
  processes: Process[],
  timeQuantum: number,
): ScheduleResult {
  const incoming = getProcessOrder(processes);
  const remaining = new Map(
    processes.map((process) => [process.id, process.burstTime]),
  );
  const ready: Process[] = [];
  const segments: ScheduleSegment[] = [];
  let nextProcessIndex = 0;
  let currentTime = 0;

  while (nextProcessIndex < incoming.length || ready.length > 0) {
    while (
      nextProcessIndex < incoming.length &&
      incoming[nextProcessIndex].arrivalTime <= currentTime
    ) {
      ready.push(incoming[nextProcessIndex]);
      nextProcessIndex += 1;
    }

    if (ready.length === 0) {
      const nextArrival = incoming[nextProcessIndex].arrivalTime;
      addIdleSegment(segments, currentTime, nextArrival);
      currentTime = nextArrival;
      continue;
    }

    const process = ready.shift()!;
    const processRemaining = remaining.get(process.id);
    if (processRemaining === undefined) {
      return invalidSchedule("Unable to find remaining process time.");
    }

    const timeUsed = Math.min(timeQuantum, processRemaining);
    const endTime = currentTime + timeUsed;
    if (!Number.isFinite(endTime)) {
      return invalidSchedule(
        "These process times exceed the supported schedule range.",
      );
    }
    if (endTime <= currentTime) {
      return invalidSchedule(
        "Unable to advance the schedule with these process times.",
      );
    }

    let remainingTime = processRemaining - timeUsed;
    const precisionLimit = Number.EPSILON * Math.max(1, processRemaining);
    if (remainingTime <= precisionLimit) {
      remainingTime = 0;
    }
    remaining.set(process.id, remainingTime);
    addProcessSegment(
      segments,
      process,
      currentTime,
      endTime,
      remainingTime,
    );
    currentTime = endTime;

    while (
      nextProcessIndex < incoming.length &&
      incoming[nextProcessIndex].arrivalTime <= currentTime
    ) {
      ready.push(incoming[nextProcessIndex]);
      nextProcessIndex += 1;
    }

    if (remainingTime > 0) {
      ready.push(process);
    }
  }

  return { segments, error: null };
}

export function buildSchedule(
  processes: Process[],
  algorithm: SchedulingAlgorithm | string = "FCFS",
  options: ScheduleOptions = {},
): ScheduleResult {
  if (!schedulingAlgorithms.includes(algorithm as SchedulingAlgorithm)) {
    return invalidSchedule(`Unknown scheduling algorithm: ${algorithm}`);
  }

  if (
    processes.some(
      (process) =>
        !Number.isFinite(process.arrivalTime) ||
        process.arrivalTime < 0 ||
        !Number.isFinite(process.burstTime) ||
        process.burstTime <= 0,
    )
  ) {
    return invalidSchedule(
      "Enter valid non-negative arrival and positive burst times.",
    );
  }

  if (algorithm === "FCFS") {
    return runFcfs(processes);
  }
  if (algorithm === "SJF") {
    return runSjf(processes);
  }
  if (algorithm === "SRTF") {
    return runPreemptive(
      processes,
      (first, second, remainingTimes) =>
        remainingTimes.get(first.id)! - remainingTimes.get(second.id)! ||
        first.arrivalTime - second.arrivalTime ||
        first.id - second.id,
    );
  }
  if (algorithm === "Priority") {
    if (
      processes.some(
        (process) => !Number.isSafeInteger(process.priority),
      )
    ) {
      return invalidSchedule(
        "Enter a safe integer priority for every process.",
      );
    }
    return runPreemptive(
      processes,
      (first, second) =>
        first.priority! - second.priority! ||
        first.arrivalTime - second.arrivalTime ||
        first.id - second.id,
    );
  }

  const timeQuantum = options.timeQuantum;
  if (!Number.isFinite(timeQuantum) || (timeQuantum ?? 0) <= 0) {
    return invalidSchedule("Time quantum must be a finite number greater than 0.");
  }
  return runRoundRobin(processes, timeQuantum!);
}

const processPalette = [
  "#5EEAD4",
  "#93C5FD",
  "#C4B5FD",
  "#F9A8D4",
  "#FDBA74",
  "#A7F3D0",
  "#FDE68A",
  "#FDA4AF",
] as const;

export function getProcessColor(processId: number): string {
  const index = ((processId - 1) % processPalette.length + processPalette.length) %
    processPalette.length;
  return processPalette[index];
}

export function getProcessTextColor(_processId: number): string {
  return "#111827";
}

export function getScheduleMetrics(
  processes: Process[],
  segments: ScheduleSegment[],
): ScheduleMetrics {
  if (processes.length === 0) {
    return { averageWaitingTime: null, averageTurnaroundTime: null };
  }

  const completionTimes = new Map<number, number>();
  for (const segment of segments) {
    if (segment.type === "process") {
      completionTimes.set(
        segment.processId,
        Math.max(completionTimes.get(segment.processId) ?? 0, segment.end),
      );
    }
  }

  let totalWaitingTime = 0;
  let totalTurnaroundTime = 0;
  for (const process of processes) {
    const completionTime = completionTimes.get(process.id);
    if (completionTime === undefined) {
      return { averageWaitingTime: null, averageTurnaroundTime: null };
    }

    const turnaroundTime = completionTime - process.arrivalTime;
    totalTurnaroundTime += turnaroundTime;
    totalWaitingTime += Math.max(0, turnaroundTime - process.burstTime);
  }

  return {
    averageWaitingTime: totalWaitingTime / processes.length,
    averageTurnaroundTime: totalTurnaroundTime / processes.length,
  };
}

export function getPlaybackFrame(
  segments: ScheduleSegment[],
  progress: number,
): PlaybackFrame {
  const totalTime = segments.at(-1)?.end ?? 0;
  const normalizedProgress = Number.isFinite(progress)
    ? Math.max(0, Math.min(1, progress))
    : 0;
  const currentTime = totalTime * normalizedProgress;
  const activeSegment =
    normalizedProgress < 1
      ? segments.find(
          (segment) =>
            currentTime >= segment.start && currentTime < segment.end,
        )
      : undefined;

  return {
    currentTime,
    activeSegmentId: activeSegment?.id ?? null,
    progress: normalizedProgress,
    complete: normalizedProgress >= 1,
  };
}
