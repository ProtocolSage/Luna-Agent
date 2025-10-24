import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./DiagnosticPanel.css";
import { apiFetch } from "../services/config";
import { API } from "../config/endpoints";

type StatusTone = "positive" | "negative" | "warning" | "neutral";

type MemoryUsage = {
  rss?: number;
  heapTotal?: number;
  heapUsed?: number;
  external?: number;
  arrayBuffers?: number;
};

type CpuUsage = {
  user?: number;
  system?: number;
};

interface HealthStatus {
  status: string;
  timestamp: string;
  version: string;
  uptime: number;
  memory: MemoryUsage;
}

interface VoiceStatus {
  status: string;
  providers: {
    elevenlabs: boolean;
    openai: boolean;
    webSpeech: boolean;
    streaming: boolean;
  };
  availableProviders: string[];
  streaming?: { available?: boolean };
  recommended: string;
  timestamp: string;
}

interface ModelMetric {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCost: number;
}

interface CircuitBreakerInfo {
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failures?: number;
  lastFailureTime?: number;
  nextAttemptTime?: number;
  halfOpenCalls?: number;
}

interface MetricsResponse {
  models?: Record<string, ModelMetric>;
  circuitBreakers?: Record<string, CircuitBreakerInfo>;
  totalCost?: number;
  security?: {
    bannedIPs?: number;
    rateLimits?: number;
    timestamp?: string;
  };
  database?: boolean;
  server?: {
    uptime?: number;
    memory?: MemoryUsage;
    cpu?: CpuUsage;
  };
  timestamp?: string;
}

interface SummaryCard {
  title: string;
  value: string;
  description?: string;
  tone?: StatusTone;
}

const REFRESH_INTERVAL = 10_000;

const formatNumber = (
  value?: number,
  options: Intl.NumberFormatOptions = { maximumFractionDigits: 0 },
): string => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "?";
  }
  return new Intl.NumberFormat("en-US", options).format(value);
};

const formatPercent = (value?: number): string => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "?";
  }
  const precision = value >= 100 || value === 0 ? 0 : 1;
  return `${value.toFixed(precision)}%`;
};

const formatCurrency = (value?: number): string => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "$0.00";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
};

const formatBytes = (bytes?: number): string => {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) {
    return "?";
  }
  if (bytes === 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, index);
  const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[index]}`;
};

const formatDuration = (seconds?: number): string => {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) {
    return "?";
  }
  const totalSeconds = Math.floor(seconds);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (!days && minutes) parts.push(`${minutes}m`);
  if (!parts.length) parts.push(`${totalSeconds % 60}s`);
  return parts.slice(0, 2).join(" ");
};

const formatTime = (date: Date | null): string => {
  if (!date) {
    return "?";
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export function DiagnosticPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [voice, setVoice] = useState<VoiceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inFlightRef = useRef(false);

  const fetchJson = useCallback(async (path: string) => {
    const response = await apiFetch(path);
    if (!response.ok) {
      throw new Error(`${path} responded with ${response.status}`);
    }
    return response.json();
  }, []);

  const refreshData = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (inFlightRef.current) {
        return;
      }
      inFlightRef.current = true;
      if (!options.silent) {
        setIsLoading(true);
      }
      setError(null);
      try {
        const [healthData, metricsData, voiceData] = await Promise.all([
          fetchJson("/health"),
          fetchJson("/api/metrics"),
          fetchJson(API.TTS_CHECK),
        ]);
        setHealth(healthData);
        setMetrics(metricsData);
        setVoice(voiceData);
        setLastUpdated(new Date());
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load metrics";
        setError(message);
      } finally {
        if (!options.silent) {
          setIsLoading(false);
        }
        inFlightRef.current = false;
      }
    },
    [fetchJson],
  );

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }
    const id = window.setInterval(() => {
      refreshData({ silent: true });
    }, REFRESH_INTERVAL);
    return () => window.clearInterval(id);
  }, [autoRefresh, refreshData]);

  const summaryCards = useMemo<SummaryCard[]>(() => {
    const uptimeSeconds = metrics?.server?.uptime ?? health?.uptime;
    const statusTone: StatusTone =
      health?.status === "OK" ? "positive" : health ? "warning" : "neutral";
    return [
      {
        title: "Server",
        value: health?.status ?? "Unknown",
        description: health?.version
          ? `v${health.version}`
          : "Version unavailable",
        tone: statusTone,
      },
      {
        title: "Uptime",
        value: formatDuration(uptimeSeconds),
        description: "Process uptime",
        tone: "neutral",
      },
      {
        title: "Memory (RSS)",
        value: formatBytes(metrics?.server?.memory?.rss ?? health?.memory?.rss),
        description: "Resident set size",
        tone: "neutral",
      },
      {
        title: "Model Cost",
        value: formatCurrency(metrics?.totalCost ?? 0),
        description: "Cumulative usage",
        tone: "neutral",
      },
    ];
  }, [metrics, health]);

  const operational = useMemo(() => {
    const dbOk = metrics?.database !== false;
    const bannedIPs = metrics?.security?.bannedIPs ?? 0;
    const rateLimits = metrics?.security?.rateLimits ?? 0;
    const cpuUser = metrics?.server?.cpu?.user ?? 0;
    const cpuSystem = metrics?.server?.cpu?.system ?? 0;
    const cpuSeconds = (cpuUser + cpuSystem) / 1_000_000;
    const cpuLabel =
      typeof cpuSeconds === "number" &&
      !Number.isNaN(cpuSeconds) &&
      cpuSeconds > 0
        ? `${formatNumber(cpuSeconds, { maximumFractionDigits: 2 })}s`
        : "0s";

    return {
      database: {
        label: dbOk ? "Connected" : "Offline",
        tone: dbOk ? "positive" : "negative",
        detail: dbOk ? "Health check passed" : "Health check failed",
      },
      security: {
        label: `${bannedIPs} banned`,
        tone: bannedIPs > 0 ? "warning" : "neutral",
        detail: `${rateLimits} active rate limits`,
      },
      cpu: {
        label: cpuLabel,
        tone: "neutral" as StatusTone,
        detail: "CPU time (user + system)",
      },
    };
  }, [metrics]);

  const modelStats = useMemo(() => {
    if (!metrics?.models) {
      return [] as Array<{
        name: string;
        total: number;
        successRate: number;
        failureRate: number;
        tokensIn: number;
        tokensOut: number;
        cost: number;
      }>;
    }

    return Object.entries(metrics.models)
      .map(([name, stats]) => {
        const total = stats.totalRequests || 0;
        const successRate =
          total > 0 ? (stats.successfulRequests / total) * 100 : 0;
        const failureRate =
          total > 0 ? (stats.failedRequests / total) * 100 : 0;
        return {
          name,
          total,
          successRate,
          failureRate,
          tokensIn: stats.totalTokensIn,
          tokensOut: stats.totalTokensOut,
          cost: stats.totalCost,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [metrics]);

  const circuitBreakers = useMemo(() => {
    if (!metrics?.circuitBreakers) {
      return [] as Array<{
        name: string;
        state: CircuitBreakerInfo["state"];
        failures: number;
        halfOpenCalls?: number;
        nextAttemptTime?: number;
      }>;
    }

    return Object.entries(metrics.circuitBreakers).map(([name, state]) => ({
      name,
      state: state.state,
      failures: state.failures ?? 0,
      halfOpenCalls: (state as CircuitBreakerInfo).halfOpenCalls,
      nextAttemptTime: state.nextAttemptTime,
    }));
  }, [metrics]);

  const voiceProviders = useMemo(() => {
    if (!voice) {
      return [] as Array<{ name: string; available: boolean; badge?: string }>;
    }

    return [
      { name: "ElevenLabs", available: !!voice.providers?.elevenlabs },
      { name: "OpenAI TTS", available: !!voice.providers?.openai },
      { name: "Web Speech", available: !!voice.providers?.webSpeech },
      {
        name: "Streaming",
        available: !!voice.streaming?.available,
        badge: voice.streaming?.available
          ? "Experimental"
          : "Experimental/Unavailable",
      },
    ];
  }, [voice]);

  const overallStatus = useMemo(() => {
    if (error) {
      return "error";
    }
    if (health?.status === "OK" && metrics?.database !== false) {
      return "ok";
    }
    if (health || metrics) {
      return "warn";
    }
    return "idle";
  }, [error, health, metrics]);

  const totalRequests = useMemo(() => {
    if (!modelStats.length) {
      return "0";
    }
    const sum = modelStats.reduce((acc, stat) => acc + stat.total, 0);
    return formatNumber(sum);
  }, [modelStats]);

  return (
    <div className={`metrics-drawer ${isOpen ? "open" : ""}`}>
      <button
        type="button"
        className={`metrics-toggle metrics-toggle--${overallStatus}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <span className="metrics-indicator" />
        <span className="metrics-toggle-label">Metrics</span>
        <span className="metrics-toggle-time">
          {lastUpdated ? `Updated ${formatTime(lastUpdated)}` : "Awaiting data"}
        </span>
        <span className="metrics-toggle-caret">{isOpen ? "?" : "?"}</span>
      </button>

      {isOpen && (
        <div className="metrics-panel">
          <header className="metrics-header">
            <div>
              <h2>System Metrics</h2>
              <p>Realtime observability for Luna voice agent</p>
            </div>
            <div className="metrics-actions">
              <label className="metrics-autorefresh">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(event) => setAutoRefresh(event.target.checked)}
                />
                <span>Auto refresh</span>
              </label>
              <button
                type="button"
                onClick={() => refreshData()}
                className="metrics-refresh"
                disabled={isLoading}
              >
                {isLoading ? "Refreshing?" : "Refresh"}
              </button>
            </div>
          </header>

          {error && <div className="metrics-error">{error}</div>}

          <section className="metrics-summary">
            {summaryCards.map((card) => (
              <article
                key={card.title}
                className={`metrics-card metrics-card--${card.tone ?? "neutral"}`}
              >
                <h3>{card.title}</h3>
                <strong>{card.value}</strong>
                {card.description && <span>{card.description}</span>}
              </article>
            ))}
          </section>

          <section className="metrics-ops">
            <h3>Operational Snapshot</h3>
            <div className="metrics-ops-grid">
              <div
                className={`metrics-chip metrics-chip--${operational.database.tone}`}
              >
                <span className="metrics-chip-label">Database</span>
                <span className="metrics-chip-value">
                  {operational.database.label}
                </span>
                <small>{operational.database.detail}</small>
              </div>
              <div
                className={`metrics-chip metrics-chip--${operational.security.tone}`}
              >
                <span className="metrics-chip-label">Security</span>
                <span className="metrics-chip-value">
                  {operational.security.label}
                </span>
                <small>{operational.security.detail}</small>
              </div>
              <div
                className={`metrics-chip metrics-chip--${operational.cpu.tone}`}
              >
                <span className="metrics-chip-label">CPU</span>
                <span className="metrics-chip-value">
                  {operational.cpu.label}
                </span>
                <small>{operational.cpu.detail}</small>
              </div>
            </div>
          </section>

          <section className="metrics-section">
            <div className="metrics-section-heading">
              <h3>Model Performance</h3>
              <span className="metrics-section-meta">
                {modelStats.length
                  ? `${totalRequests} total requests`
                  : "No usage yet"}
              </span>
            </div>
            {modelStats.length ? (
              <div className="metrics-table-wrapper">
                <table className="metrics-table">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Total</th>
                      <th>Success</th>
                      <th>Failures</th>
                      <th>Tokens In</th>
                      <th>Tokens Out</th>
                      <th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelStats.map((stat) => (
                      <tr key={stat.name}>
                        <td>{stat.name}</td>
                        <td>{formatNumber(stat.total)}</td>
                        <td>{formatPercent(stat.successRate)}</td>
                        <td>{formatPercent(stat.failureRate)}</td>
                        <td>{formatNumber(stat.tokensIn)}</td>
                        <td>{formatNumber(stat.tokensOut)}</td>
                        <td>{formatCurrency(stat.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="metrics-placeholder">
                Model metrics will appear once requests are processed.
              </div>
            )}
          </section>

          <section className="metrics-section">
            <div className="metrics-section-heading">
              <h3>Circuit Breakers</h3>
            </div>
            {circuitBreakers.length ? (
              <div className="metrics-list">
                {circuitBreakers.map((item) => (
                  <div
                    key={item.name}
                    className={`metrics-list-item metrics-list-item--${item.state.toLowerCase()}`}
                  >
                    <div className="metrics-list-row">
                      <strong>{item.name}</strong>
                      <span className="metrics-pill">{item.state}</span>
                    </div>
                    <div className="metrics-list-detail">
                      <span>{item.failures} failures</span>
                      {item.state === "HALF_OPEN" && (
                        <span>{item.halfOpenCalls ?? 0} test calls</span>
                      )}
                      {item.nextAttemptTime && (
                        <span>
                          Retry at{" "}
                          {new Date(item.nextAttemptTime).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="metrics-placeholder">
                Circuit breakers are idle.
              </div>
            )}
          </section>

          <section className="metrics-section">
            <div className="metrics-section-heading">
              <h3>Voice Providers</h3>
              {voice?.recommended && (
                <span className="metrics-section-meta">
                  Recommended: {voice.recommended}
                </span>
              )}
            </div>
            {voiceProviders.length ? (
              <div className="metrics-voice-grid">
                {voiceProviders.map((provider) => (
                  <div
                    key={provider.name}
                    className={`metrics-voice-card ${provider.available ? "available" : "unavailable"}`}
                  >
                    <span>{provider.name}</span>
                    <strong>{provider.available ? "Online" : "Offline"}</strong>
                    {provider.badge && (
                      <span
                        className={`metrics-voice-badge ${provider.available ? "badge-available" : "badge-unavailable"}`}
                      >
                        {provider.badge}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="metrics-placeholder">
                Voice system status unavailable.
              </div>
            )}
          </section>

          <footer className="metrics-footer">
            <span>
              Last updated {lastUpdated ? formatTime(lastUpdated) : "?"}
            </span>
            <span>
              Metrics timestamp{" "}
              {metrics?.timestamp
                ? new Date(metrics.timestamp).toLocaleTimeString()
                : "?"}
            </span>
          </footer>
        </div>
      )}
    </div>
  );
}
