import React, { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Key,
  Eye,
  EyeOff,
  Check,
  X,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  Edit,
  Save,
  Activity,
  Lock,
  Unlock,
  Settings,
  Database,
} from "lucide-react";

interface Credential {
  id: string;
  service: string;
  name: string;
  metadata: {
    created: string;
    lastUsed?: string;
    healthStatus: "active" | "warning" | "expired" | "invalid";
    validationCount: number;
    failureCount: number;
    expiresAt?: string;
    rotationDate?: string;
  };
}

interface CredentialStatus {
  service: string;
  name: string;
  isActive: boolean;
  isValid: boolean;
  healthStatus: "active" | "warning" | "expired" | "invalid";
  lastChecked: string;
  errorCount: number;
  successCount: number;
  details: string;
  responseTime?: number;
}

interface HealthReport {
  totalCredentials: number;
  activeCredentials: number;
  expiredCredentials: number;
  invalidCredentials: number;
  credentialsNeedingRotation: number;
  lastHealthCheck: string;
  recommendations: string[];
}

/**
 * Enterprise Credential Management UI
 *
 * Features:
 * - Secure credential input with masked display
 * - Real-time validation and health monitoring
 * - Visual health dashboard
 * - Automatic rotation scheduling
 * - Security audit logs
 * - Windows keystore integration status
 */
export const CredentialManager: React.FC = () => {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [keyStatus, setKeyStatus] = useState<CredentialStatus[]>([]);
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedService, setSelectedService] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form state
  const [formData, setFormData] = useState({
    service: "",
    name: "",
    value: "",
    expiresIn: "",
    rotationInterval: "",
  });
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  // Known service configurations
  const serviceConfigs = {
    openai: {
      name: "OpenAI",
      icon: "🤖",
      pattern: "^sk-[a-zA-Z0-9]{48,}$",
      description: "OpenAI API Key (starts with sk-)",
      placeholder: "sk-...",
      testEndpoint: "https://api.openai.com/v1/models",
    },
    anthropic: {
      name: "Anthropic (Claude)",
      icon: "🧠",
      pattern: "^sk-ant-[a-zA-Z0-9\\-_]{95,}$",
      description: "Anthropic API Key (starts with sk-ant-)",
      placeholder: "sk-ant-...",
      testEndpoint: "https://api.anthropic.com/v1/messages",
    },
    supabase: {
      name: "Supabase",
      icon: "🗄️",
      pattern: "^https://[a-zA-Z0-9]+\\.supabase\\.co$",
      description: "Supabase Project URL",
      placeholder: "https://your-project.supabase.co",
      testEndpoint: null,
    },
    elevenlabs: {
      name: "ElevenLabs",
      icon: "🎵",
      pattern: "^[a-zA-Z0-9]+$",
      description: "ElevenLabs API Key",
      placeholder: "Your ElevenLabs API key",
      testEndpoint: "https://api.elevenlabs.io/v1/user",
    },
  };

  // Load credentials and status on component mount
  useEffect(() => {
    loadCredentials();
    loadKeyStatus();
    loadHealthReport();

    // Set up periodic refresh
    const interval = setInterval(() => {
      loadKeyStatus();
      loadHealthReport();
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const loadCredentials = async () => {
    try {
      const response = await fetch("/api/security/credentials");
      if (response.ok) {
        const data = await response.json();
        setCredentials(data);
      }
    } catch (error) {
      console.error("Failed to load credentials:", error);
      setError("Failed to load credentials");
    } finally {
      setIsLoading(false);
    }
  };

  const loadKeyStatus = async () => {
    try {
      const response = await fetch("/api/security/key-status");
      if (response.ok) {
        const data = await response.json();
        setKeyStatus(data);
      }
    } catch (error) {
      console.error("Failed to load key status:", error);
    }
  };

  const loadHealthReport = async () => {
    try {
      const response = await fetch("/api/security/health-report");
      if (response.ok) {
        const data = await response.json();
        setHealthReport(data);
      }
    } catch (error) {
      console.error("Failed to load health report:", error);
    }
  };

  const validateCredential = (
    service: string,
    value: string,
  ): string | null => {
    if (!value.trim()) {
      return "Credential value is required";
    }

    const config = serviceConfigs[service as keyof typeof serviceConfigs];
    if (config?.pattern) {
      const pattern = new RegExp(config.pattern);
      if (!pattern.test(value)) {
        return `Invalid format. ${config.description}`;
      }
    }

    return null;
  };

  const handleAddCredential = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    const errors: Record<string, string> = {};

    if (!formData.service) errors.service = "Service is required";
    if (!formData.name) errors.name = "Name is required";

    const validationError = validateCredential(
      formData.service,
      formData.value,
    );
    if (validationError) {
      errors.value = validationError;
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    try {
      const response = await fetch("/api/security/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: formData.service,
          name: formData.name,
          value: formData.value,
          expiresIn: formData.expiresIn
            ? parseInt(formData.expiresIn) * 24 * 60 * 60 * 1000
            : undefined,
          rotationInterval: formData.rotationInterval
            ? parseInt(formData.rotationInterval) * 24 * 60 * 60 * 1000
            : undefined,
        }),
      });

      if (response.ok) {
        setSuccess("Credential added successfully");
        setFormData({
          service: "",
          name: "",
          value: "",
          expiresIn: "",
          rotationInterval: "",
        });
        setValidationErrors({});
        setShowAddForm(false);
        loadCredentials();
        loadKeyStatus();
      } else {
        const error = await response.json();
        setError(error.message || "Failed to add credential");
      }
    } catch (error) {
      setError("Failed to add credential");
    }
  };

  const handleDeleteCredential = async (service: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${service}:${name}?`)) {
      return;
    }

    try {
      const response = await fetch(
        `/api/security/credentials/${service}/${name}`,
        {
          method: "DELETE",
        },
      );

      if (response.ok) {
        setSuccess("Credential deleted successfully");
        loadCredentials();
        loadKeyStatus();
      } else {
        setError("Failed to delete credential");
      }
    } catch (error) {
      setError("Failed to delete credential");
    }
  };

  const handleRefreshAll = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/security/refresh-keys", {
        method: "POST",
      });

      if (response.ok) {
        const result = await response.json();
        setSuccess(
          `Refreshed all keys: ${result.validated} validated, ${result.failed} failed`,
        );
        loadKeyStatus();
        loadHealthReport();
      } else {
        setError("Failed to refresh keys");
      }
    } catch (error) {
      setError("Failed to refresh keys");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "text-green-500";
      case "warning":
        return "text-yellow-500";
      case "expired":
        return "text-orange-500";
      case "invalid":
        return "text-red-500";
      default:
        return "text-gray-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <Check className="w-4 h-4" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4" />;
      case "expired":
        return <X className="w-4 h-4" />;
      case "invalid":
        return <X className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  if (isLoading && credentials.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" />
          <p className="text-gray-600">Loading credentials...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Shield className="w-8 h-8 text-blue-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Credential Manager
            </h1>
            <p className="text-gray-600">
              Enterprise security credential management
            </p>
          </div>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={handleRefreshAll}
            disabled={isLoading}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
            />
            <span>Refresh All</span>
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
          >
            <Plus className="w-4 h-4" />
            <span>Add Credential</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-2">
          <X className="w-5 h-5 text-red-500" />
          <span className="text-red-700">{error}</span>
          <button
            onClick={() => setError("")}
            className="ml-auto text-red-500 hover:text-red-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center space-x-2">
          <Check className="w-5 h-5 text-green-500" />
          <span className="text-green-700">{success}</span>
          <button
            onClick={() => setSuccess("")}
            className="ml-auto text-green-500 hover:text-green-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Health Dashboard */}
      {healthReport && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Activity className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold">Health Dashboard</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">
                {healthReport.totalCredentials}
              </div>
              <div className="text-sm text-gray-600">Total Credentials</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {healthReport.activeCredentials}
              </div>
              <div className="text-sm text-gray-600">Active</div>
            </div>
            <div className="text-center p-4 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">
                {healthReport.credentialsNeedingRotation}
              </div>
              <div className="text-sm text-gray-600">Need Rotation</div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">
                {healthReport.expiredCredentials +
                  healthReport.invalidCredentials}
              </div>
              <div className="text-sm text-gray-600">Issues</div>
            </div>
          </div>

          {healthReport.recommendations.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-medium text-yellow-800 mb-2">
                Recommendations:
              </h3>
              <ul className="space-y-1">
                {healthReport.recommendations.map((rec, index) => (
                  <li
                    key={index}
                    className="text-yellow-700 text-sm flex items-center space-x-2"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Credentials List */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold flex items-center space-x-2">
            <Database className="w-5 h-5" />
            <span>Stored Credentials</span>
          </h2>
        </div>

        <div className="divide-y divide-gray-200">
          {credentials.map((credential) => {
            const status = keyStatus.find(
              (s) =>
                s.service === credential.service && s.name === credential.name,
            );
            const config =
              serviceConfigs[credential.service as keyof typeof serviceConfigs];

            return (
              <div key={credential.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="text-2xl">{config?.icon || "🔑"}</div>
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {config?.name || credential.service} - {credential.name}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Created:{" "}
                        {new Date(
                          credential.metadata.created,
                        ).toLocaleDateString()}
                        {credential.metadata.lastUsed && (
                          <span className="ml-2">
                            • Last used:{" "}
                            {new Date(
                              credential.metadata.lastUsed,
                            ).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    {/* Status indicator */}
                    <div
                      className={`flex items-center space-x-2 ${getStatusColor(credential.metadata.healthStatus)}`}
                    >
                      {getStatusIcon(credential.metadata.healthStatus)}
                      <span className="text-sm capitalize">
                        {credential.metadata.healthStatus}
                      </span>
                    </div>

                    {/* Performance metrics */}
                    {status && (
                      <div className="text-right text-sm text-gray-600">
                        <div>
                          ✓ {status.successCount} / ❌ {status.errorCount}
                        </div>
                        {status.responseTime && (
                          <div>{status.responseTime}ms</div>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <button
                      onClick={() =>
                        handleDeleteCredential(
                          credential.service,
                          credential.name,
                        )
                      }
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Status details */}
                {status && status.details && (
                  <div className="mt-2 text-sm text-gray-600">
                    <span className="font-medium">Status:</span>{" "}
                    {status.details}
                    <span className="ml-4 font-medium">Last checked:</span>{" "}
                    {new Date(status.lastChecked).toLocaleString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {credentials.length === 0 && (
          <div className="p-12 text-center text-gray-500">
            <Key className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium mb-2">No credentials stored</h3>
            <p>
              Add your first credential to get started with secure API key
              management.
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Add Credential
            </button>
          </div>
        )}
      </div>

      {/* Add Credential Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Add Credential</h2>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setValidationErrors({});
                  setFormData({
                    service: "",
                    name: "",
                    value: "",
                    expiresIn: "",
                    rotationInterval: "",
                  });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleAddCredential} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Service
                </label>
                <select
                  value={formData.service}
                  onChange={(e) => {
                    setFormData({
                      ...formData,
                      service: e.target.value,
                      name: e.target.value === "supabase" ? "url" : "api_key",
                    });
                    setValidationErrors({ ...validationErrors, service: "" });
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    validationErrors.service
                      ? "border-red-300"
                      : "border-gray-300"
                  }`}
                  required
                >
                  <option value="">Select a service</option>
                  {Object.entries(serviceConfigs).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.icon} {config.name}
                    </option>
                  ))}
                </select>
                {validationErrors.service && (
                  <p className="text-red-600 text-sm mt-1">
                    {validationErrors.service}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    setValidationErrors({ ...validationErrors, name: "" });
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    validationErrors.name ? "border-red-300" : "border-gray-300"
                  }`}
                  placeholder="e.g., api_key, url, token"
                  required
                />
                {validationErrors.name && (
                  <p className="text-red-600 text-sm mt-1">
                    {validationErrors.name}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Credential Value
                </label>
                <div className="relative">
                  <input
                    type={showPassword.value ? "text" : "password"}
                    value={formData.value}
                    onChange={(e) => {
                      setFormData({ ...formData, value: e.target.value });
                      setValidationErrors({ ...validationErrors, value: "" });
                    }}
                    className={`w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      validationErrors.value
                        ? "border-red-300"
                        : "border-gray-300"
                    }`}
                    placeholder={
                      formData.service
                        ? serviceConfigs[
                            formData.service as keyof typeof serviceConfigs
                          ]?.placeholder
                        : "Enter credential value"
                    }
                    required
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword({
                        ...showPassword,
                        value: !showPassword.value,
                      })
                    }
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showPassword.value ? (
                      <EyeOff className="w-4 h-4 text-gray-400" />
                    ) : (
                      <Eye className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
                {validationErrors.value && (
                  <p className="text-red-600 text-sm mt-1">
                    {validationErrors.value}
                  </p>
                )}
                {formData.service &&
                  serviceConfigs[
                    formData.service as keyof typeof serviceConfigs
                  ] && (
                    <p className="text-gray-600 text-xs mt-1">
                      {
                        serviceConfigs[
                          formData.service as keyof typeof serviceConfigs
                        ].description
                      }
                    </p>
                  )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expires (days)
                  </label>
                  <input
                    type="number"
                    value={formData.expiresIn}
                    onChange={(e) =>
                      setFormData({ ...formData, expiresIn: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Optional"
                    min="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rotate (days)
                  </label>
                  <input
                    type="number"
                    value={formData.rotationInterval}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        rotationInterval: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Optional"
                    min="1"
                  />
                </div>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Credential</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setValidationErrors({});
                    setFormData({
                      service: "",
                      name: "",
                      value: "",
                      expiresIn: "",
                      rotationInterval: "",
                    });
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CredentialManager;
