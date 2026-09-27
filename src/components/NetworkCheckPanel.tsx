import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw, Wifi, X } from "lucide-react";
import type { NetworkCheckReport } from "../../shared/contracts";
import { useI18n } from "../i18n";

interface NetworkCheckPanelProps {
  open: boolean;
  onClose(): void;
}

/**
 * LOCAL EDIT (diagnostic): a small overlay listing one probe row per network
 * leg of the selected environment. Opened from the footer's Wi-Fi button; it
 * runs the checks itself on open and never touches Play.
 */
export function NetworkCheckPanel({ open, onClose }: NetworkCheckPanelProps) {
  const { copy } = useI18n();
  const [report, setReport] = useState<NetworkCheckReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const result = await window.rotk.networkCheck();
      if (!result.ok) setError(result.error ?? copy.app.operationFailed);
      else setReport(result.value ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  }, [copy.app.operationFailed]);

  useEffect(() => {
    if (open) void run();
  }, [open, run]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="network-check"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.16 }}
        >
          <header className="network-check__head">
            <Wifi size={16} />
            <strong>{copy.network.title}</strong>
            {report !== null && <small>{report.environment}</small>}
            <button type="button" onClick={onClose} aria-label={copy.network.close}>
              <X size={15} />
            </button>
          </header>

          {error !== null && <p className="network-check__error">{error}</p>}

          {report !== null && (
            <>
              <ul className="network-check__rows">
                {report.entries.map((entry) => (
                  <li key={entry.id} className={`is-${entry.outcome}`}>
                    <span className="network-check__dot" />
                    <span className="network-check__label">
                      {entry.label}
                      <small>{entry.target}</small>
                    </span>
                    <span className="network-check__detail">
                      {entry.detail}
                      {entry.ms !== null && <em> {entry.ms} ms</em>}
                    </span>
                    <span className="network-check__verdict">
                      {entry.outcome === "ok" ? copy.network.ok : entry.outcome === "warn" ? copy.network.warn : copy.network.fail}
                    </span>
                  </li>
                ))}
              </ul>
              <p className={`network-check__summary ${report.failed > 0 ? "is-bad" : "is-good"}`}>
                {report.failed > 0
                  ? `${report.failed} ${copy.network.failedCount}`
                  : copy.network.allGood}
              </p>
            </>
          )}

          <footer className="network-check__foot">
            <button type="button" onClick={() => void run()} disabled={running}>
              <RefreshCw size={14} className={running ? "is-spinning" : undefined} />
              {running ? copy.network.running : copy.network.run}
            </button>
          </footer>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
