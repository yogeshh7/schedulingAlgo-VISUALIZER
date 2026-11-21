import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import GanttChart from "./components/GanttChart";
import ProcessTable from "./components/ProcessTable";
import {
  buildSchedule,
  getScheduleMetrics,
  parsePriority,
  parseProcessTimes,
} from "./scheduler";
import type { Process, SchedulingAlgorithm } from "./scheduler";

const algorithmDetails: Record<
  SchedulingAlgorithm,
  { name: string; description: string }
> = {
  FCFS: {
    name: "First-Come, First-Served",
    description:
      "Runs ready processes in arrival order. Once started, a job runs to completion.",
  },
  SJF: {
    name: "Shortest Job First",
    description:
      "Chooses the shortest burst among arrived processes. The selected job is not preempted.",
  },
  SRTF: {
    name: "Shortest Remaining Time First",
    description:
      "Preempts the running process when a newly arrived job has less time remaining.",
  },
  "Round Robin": {
    name: "Round Robin",
    description:
      "Runs each ready process for one time quantum, then places unfinished work at the end of the ready queue.",
  },
  Priority: {
    name: "Preemptive Priority",
    description:
      "Runs the ready process with the highest priority; a newly arrived higher-priority process preempts the current one.",
  },
};

const algorithmGroups = [
  {
    title: "Preemptive",
    description:
      "The scheduler can interrupt a running process and switch to another when the policy calls for it; a process may be stopped before it completes.",
    options: ["SRTF", "Round Robin", "Priority"],
  },
  {
    title: "Non-preemptive",
    description:
      "A process keeps the CPU until it completes, is terminated, or blocks for I/O; the scheduler does not interrupt it.",
    options: ["FCFS", "SJF"],
  },
] as const satisfies {
  title: "Preemptive" | "Non-preemptive";
  description: string;
  options: SchedulingAlgorithm[];
}[];

function App() {
  const [arrivalTime, setArrivalTime] = useState("");
  const [burstTime, setBurstTime] = useState("");
  const [priority, setPriority] = useState("0");
  const [timeQuantum, setTimeQuantum] = useState("2");
  const [processes, setProcesses] = useState<Process[]>([]);
  const [formError, setFormError] = useState("");
  const [algorithm, setAlgorithm] = useState<SchedulingAlgorithm>("FCFS");
  const [algorithmCategory, setAlgorithmCategory] = useState<
    (typeof algorithmGroups)[number]["title"]
  >("Non-preemptive");
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(
    null,
  );
  const [selectionSoundEnabled, setSelectionSoundEnabled] = useState(true);
  const audioContextRef = useRef<AudioContext | null>(null);

  const schedule = useMemo(
    () =>
      buildSchedule(processes, algorithm, {
        timeQuantum: Number(timeQuantum),
      }),
    [algorithm, processes, timeQuantum],
  );
  const description = algorithmDetails[algorithm];
  const metrics = getScheduleMetrics(processes, schedule.segments);

  useEffect(
    () => () => {
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
    },
    [],
  );

  async function selectProcess(processId: number) {
    setSelectedProcessId(processId);
    if (!selectionSoundEnabled || typeof window.AudioContext === "undefined") {
      return;
    }

    const audioContext =
      audioContextRef.current ?? new window.AudioContext();
    audioContextRef.current = audioContext;
    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
      } catch (error) {
        console.error("Unable to resume selection sound audio context.", error);
        return;
      }
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const startTime = audioContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, startTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.1, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.13);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.14);
  }

  function addProcess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const times = parseProcessTimes(arrivalTime, burstTime);
    if (times.error || !times.value) {
      setFormError(times.error ?? "Enter valid process times.");
      return;
    }

    const priorityResult =
      algorithm === "Priority"
        ? parsePriority(priority)
        : { value: 0, error: null };
    if (priorityResult.error || priorityResult.value === null) {
      setFormError(priorityResult.error ?? "Enter a valid priority.");
      return;
    }

    const nextProcess: Process = {
      id: processes.length + 1,
      ...times.value,
      priority: priorityResult.value,
    };
    const nextSchedule = buildSchedule(
      [...processes, nextProcess],
      algorithm,
      { timeQuantum: Number(timeQuantum) },
    );
    if (nextSchedule.error) {
      setFormError(nextSchedule.error);
      return;
    }

    setProcesses((currentProcesses) => [...currentProcesses, nextProcess]);
    setArrivalTime("");
    setBurstTime("");
    setPriority("0");
    setFormError("");
  }

  function clearFormError() {
    if (formError) {
      setFormError("");
    }
  }

  return (
    <main className="visualizer-shell relative isolate min-h-screen bg-slate-950 text-accent-amber text-2xl text-shadow-school-bus-yellow">
      <header className="border-b border-oxford-navy px-5 pb-8 pt-5 sm:px-8 lg:px-12">
        <div className="page-container">
          <div className="flex items-center justify-between border-b border-oxford-navy pb-3 font-mono text-xs font-semibold uppercase tracking-eyebrow text-gold">
            <span className="flex items-center gap-2">
              Built by
              <a
                className="inline-flex items-center gap-1.5 text-white hover:text-gold"
                href="https://github.com/yogeshh7"
                rel="noopener noreferrer"
                target="_blank"
              >
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                >
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.33c-2.23.49-2.7-.95-2.7-.95-.36-.92-.89-1.16-.89-1.16-.73-.5.06-.49.06-.49.8.06 1.22.82 1.22.82.72 1.23 1.88.88 2.34.67.07-.52.28-.88.51-1.08-1.78-.2-3.64-.89-3.64-3.96 0-.88.31-1.6.82-2.16-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 4.01c.68 0 1.36.09 2 .27 1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.16 0 3.08-1.87 3.76-3.65 3.96.29.25.54.73.54 1.48v2.03c0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                </svg>
                <span className="underline underline-offset-4">Yogeshh</span>
              </a>
            </span>
            <span>Scheduling systems</span>
          </div>
          <h1 className="font-display mt-8 w-full bg-linear-to-r from-amber-400 via-accent-secondary to-amber-400 bg-clip-text text-[clamp(2.75rem,7vw,7.5rem)] font-black uppercase leading-[0.86] tracking-[-0.055em] text-transparent">
            CPU SCHEDULING VISUALIZER
            
            
          </h1>
          <div className="mt-6 flex flex-col gap-3 border-t border-oxford-navy pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl text-indigo-50">
              Compare how arrival time and job length shape a CPU schedule.
              Change algorithms to see the same process set run differently.
            </p>
            <span className="font-mono text-xs uppercase tracking-wider text-orange-800">
              {processes.length} {processes.length === 1 ? "process" : "processes"} loaded
            </span>
          </div>
        </div>
      </header>

      <div className="page-container visualizer-layout">
        <aside className="space-y-9">
          <section aria-labelledby="algorithm-title">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <h2
                id="algorithm-title"
                className="section-kicker--algorithm font-mono text-xs font-bold uppercase tracking-kicker"
              >
                01 / Algorithm
              </h2>
              <span className="font-mono text-xs text-yellow-200">Choose a policy</span>
            </div>
            <div
              className="grid grid-cols-2 border-b border-oxford-navy"
              role="tablist"
              aria-label="Scheduling behavior"
            >
              {algorithmGroups.map((group) => (
                <button
                  aria-controls="algorithm-tab-panel"
                  aria-selected={algorithmCategory === group.title}
                  className={`algorithm-tab ${
                    group.title === "Preemptive"
                      ? "algorithm-tab--preemptive"
                      : "algorithm-tab--non-preemptive"
                  }${algorithmCategory === group.title ? " is-active" : ""}`}
                  id={`tab-${group.title.toLowerCase().replaceAll(" ", "-")}`}
                  key={group.title}
                  role="tab"
                  type="button"
                  onClick={() => {
                    setAlgorithmCategory(group.title);
                    setAlgorithm(group.options[0]);
                    clearFormError();
                  }}
                >
                  {group.title}
                </button>
              ))}
            </div>
            {algorithmGroups
              .filter((group) => group.title === algorithmCategory)
              .map((group) => (
                <div
                  aria-labelledby={`tab-${group.title.toLowerCase().replaceAll(" ", "-")}`}
                  className="pt-4"
                  id="algorithm-tab-panel"
                  key={group.title}
                  role="tabpanel"
                >
                  <label
                    className="mb-2 block font-mono  font-bold uppercase tracking-wider text-green-500 text-2xl"
                    htmlFor="algorithm-select"
                  >
                    Algorithm
                  </label>
                  <select
                    className="w-full border border-oxford-navy bg-prussian-blue px-3 py-3 font-mono text-sm font-bold text-school-bus-yellow"
                    id="algorithm-select"
                    value={algorithm}
                    onChange={(event) => {
                      setAlgorithm(event.target.value as SchedulingAlgorithm);
                      clearFormError();
                    }}
                  >
                    {group.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <p className="mt-3 text-xs leading-5 text-gold">
                    {group.description}
                  </p>
                </div>
              ))}
            {algorithm === "Round Robin" && (
              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-bold text-school-bus-yellow">
                  Time quantum
                </span>
                <input
                  className="w-full border border-oxford-navy bg-prussian-blue px-4 py-3 font-mono text-lg font-semibold text-school-bus-yellow placeholder:text-gold/70"
                  type="number"
                  min="0"
                  step="any"
                  value={timeQuantum}
                  aria-describedby={formError ? "process-form-error" : "quantum-hint"}
                  aria-invalid={Boolean(formError && algorithm === "Round Robin")}
                  onChange={(event) => {
                    setTimeQuantum(event.target.value);
                    clearFormError();
                  }}
                />
                <span className="mt-2 block text-xs text-gold" id="quantum-hint">
                  Must be a finite number greater than 0.
                </span>
              </label>
            )}
            {algorithm === "Priority" && (
              <p className="priority-note mt-4 text-xs leading-5 text-gold">
                Lower priority numbers run first; equal priorities keep arrival
                and input order.
              </p>
            )}
            <div className="mt-4 border-l-4 border-accent pl-4">
              <h3 className="font-display text-lg font-bold tracking-tight text-school-bus-yellow">{description.name}</h3>
              <p className="mt-1 text-sm leading-6 text-gold">
                {description.description}
              </p>
            </div>
          </section>

          <section aria-labelledby="add-process-title">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <h2
                id="add-process-title"
                className="section-kicker--input font-mono text-xs font-bold uppercase tracking-kicker"
              >
                02 / Process input
              </h2>
              <span className="font-mono text-xs text-gold">Time units</span>
            </div>

            <form className="space-y-4" noValidate onSubmit={addProcess}>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-school-bus-yellow">
                  Arrival time
                </span>
                <input
                  className="w-full border border-oxford-navy bg-prussian-blue px-4 py-3 font-mono text-lg font-semibold text-school-bus-yellow placeholder:text-gold/70"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={arrivalTime}
                  aria-describedby={formError ? "process-form-error" : undefined}
                  aria-invalid={Boolean(formError)}
                  onChange={(event) => {
                    setArrivalTime(event.target.value);
                    clearFormError();
                  }}
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-school-bus-yellow">
                  Burst time
                </span>
                <input
                  className="w-full border border-oxford-navy bg-prussian-blue px-4 py-3 font-mono text-lg font-semibold text-school-bus-yellow placeholder:text-gold/70"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="5"
                  value={burstTime}
                  aria-describedby={formError ? "process-form-error" : undefined}
                  aria-invalid={Boolean(formError)}
                  onChange={(event) => {
                    setBurstTime(event.target.value);
                    clearFormError();
                  }}
                  required
                />
              </label>

              {algorithm === "Priority" && (
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-school-bus-yellow">
                    Priority
                  </span>
                  <input
                    className="w-full border border-oxford-navy bg-prussian-blue px-4 py-3 font-mono text-lg font-semibold text-school-bus-yellow placeholder:text-gold/70"
                    type="number"
                    step="1"
                    placeholder="0"
                    value={priority}
                    aria-describedby={formError ? "process-form-error" : undefined}
                    aria-invalid={Boolean(formError)}
                    onChange={(event) => {
                      setPriority(event.target.value);
                      clearFormError();
                    }}
                    required
                  />
                </label>
              )}

              <button
                className="w-full bg-accent px-4 py-3 text-sm font-bold text-ink-black hover:bg-accent-hover  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                type="submit"
              >
                Add process <span aria-hidden="true">+</span>
              </button>

              {formError && (
                <p className="text-sm font-semibold text-error" id="process-form-error" role="alert">
                  {formError}
                </p>
              )}
            </form>
          </section>
        </aside>

        <div className="min-w-0 space-y-10">
          <section aria-labelledby="process-queue-title">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 border-b border-oxford-navy pb-3">
              <h2
                id="process-queue-title"
                className="section-kicker--queue font-mono text-xs font-bold uppercase tracking-kicker"
              >
                03 / Process queue
              </h2>
              <span className="font-mono text-xs text-gold">
                Sorted by arrival · ties keep input order
              </span>
            </div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xl text-shadow-yellow-700 ">
                Select a process to highlight it across the timeline.
              </p>
              <label className="flex items-center gap-2 font-mono text-xs font-semibold text-school-bus-yellow">
                <input
                  checked={selectionSoundEnabled}
                  className="h-4 w-4 accent-emerald-500"
                  onChange={(event) =>
                    setSelectionSoundEnabled(event.target.checked)
                  }
                  type="checkbox"
                />
                Selection sound
              </label>
            </div>
            <ProcessTable
              onSelectProcess={selectProcess}
              processes={processes}
              showPriority={algorithm === "Priority"}
              selectedProcessId={selectedProcessId}
            />
          </section>

          <section aria-labelledby="gantt-title">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 border-b border-oxford-navy pb-3">
              <h2
                id="gantt-title"
                className="section-kicker--timeline font-mono text-xs font-bold uppercase tracking-kicker"
              >
                04 / {algorithm} timeline
              </h2>
              <span className="text-sm font-semibold text-amber-900">
                {description.name}
              </span>
            </div>
            <GanttChart
              schedule={schedule}
              algorithm={algorithm}
              algorithmName={description.name}
              selectedProcessId={selectedProcessId}
            />
            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="border border-oxford-navy bg-prussian-blue px-4 py-3">
                <dt className="font-mono text-label font-semibold uppercase tracking-wider text-gold">
                  Average waiting time
                </dt>
                <dd className="mt-1 font-mono text-2xl font-bold tabular-nums text-school-bus-yellow">
                  {metrics.averageWaitingTime === null
                    ? "—"
                    : metrics.averageWaitingTime.toFixed(2)}
                </dd>
              </div>
              <div className="border border-oxford-navy bg-prussian-blue px-4 py-3">
                <dt className="font-mono text-label font-semibold uppercase tracking-wider text-gold">
                  Average turnaround time
                </dt>
                <dd className="mt-1 font-mono text-2xl font-bold tabular-nums text-school-bus-yellow">
                  {metrics.averageTurnaroundTime === null
                    ? "—"
                    : metrics.averageTurnaroundTime.toFixed(2)}
                </dd>
              </div>
            </dl>
            {processes.length === 0 && (
              <p className="mt-2 text-xs text-gold">
                Add processes to calculate schedule averages.
              </p>
            )}
          </section>
        </div>
      </div>
      <footer className="border-t border-oxford-navy px-5 py-4 font-mono text-label uppercase tracking-wider text-gold sm:px-8 lg:px-12">
        CPU Scheduling Studio <span className="px-2">/</span> {algorithm} simulation
      </footer>
    </main>
  );
}

export default App;
