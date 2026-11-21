import type { CSSProperties } from "react";
import {
  getProcessColor,
  getProcessOrder,
  getProcessTextColor,
} from "../scheduler";
import type { Process } from "../scheduler";

interface ProcessTableProps {
  processes: Process[];
  selectedProcessId: number | null;
  showPriority: boolean;
  onSelectProcess: (processId: number) => void;
}

export default function ProcessTable({
  processes,
  selectedProcessId,
  showPriority,
  onSelectProcess,
}: ProcessTableProps) {
  const orderedProcesses = getProcessOrder(processes);


return (
  <div className="overflow-x-auto border border-oxford-navy bg-prussian-blue">
    <table className="process-table w-full min-w-560px border-collapse text-left">
      <thead className="bg-amber-300 font-mono text-label uppercase tracking-wider text-black text-5xl">
        <tr>
          <th className="px-4 py-3 font-semibold" scope="col">Process</th>
          <th className="px-4 py-3 font-semibold" scope="col">Arrival time</th>
          <th className="px-4 py-3 font-semibold" scope="col">Burst time</th>
          {showPriority && (
            <th className="px-4 py-3 font-semibold" scope="col">Priority</th>
          )}
        </tr>
      </thead>
      <tbody>
        {orderedProcesses.length === 0 ? (
          <tr>
            <td
              className="px-4 py-10 text-center text-sm text-gold"
              colSpan={showPriority ? 4 : 3}
            >
              Add a process to build the schedule.
            </td>
          </tr>
        ) : (
          orderedProcesses.map((process) => (
            <tr
              className="process-row border-t border-oxford-navy"
              data-selected={selectedProcessId === process.id}
              key={process.id}
              style={
                {
                  "--process-color": getProcessColor(process.id),
                  "--process-text-color": getProcessTextColor(process.id),
                } as CSSProperties
              }
            >
              <th className="px-4 py-3 text-left" scope="row">
                <button
                  aria-pressed={selectedProcessId === process.id}
                  className="process-select-button font-mono font-bold underline-offset-4"
                  onClick={() => onSelectProcess(process.id)}
                  type="button"
                >
                  P{process.id}
                </button>
              </th>
              <td className="px-4 py-2">
                <span className="inline-flex min-w-16 justify-center border border-oxford-navy bg-ink-black px-3 py-1 font-mono font-semibold tabular-nums text-school-bus-yellow">
                  {process.arrivalTime}
                </span>
              </td>
              <td className="px-4 py-2">
                <span className="inline-flex min-w-16 justify-center border border-oxford-navy bg-ink-black px-3 py-1 font-mono font-semibold tabular-nums text-school-bus-yellow">
                  {process.burstTime}
                </span>
              </td>
              {showPriority && (
                <td className="px-4 py-2">
                  <span className="inline-flex min-w-16 justify-center border border-oxford-navy bg-ink-black px-3 py-1 font-mono font-semibold tabular-nums text-school-bus-yellow">
                    {process.priority}
                  </span>
                </td>
              )}
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);
}
