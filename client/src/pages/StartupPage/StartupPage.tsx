import { useState, useEffect } from "react";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import type { ServiceStatus } from "@weaver/shared/types";
import { useServicesStatus } from "../../hooks/useServicesStatus";
import { serviceStatusType } from "../../utils/serviceStatusType";
import { colors } from "../../theme/colors";

interface StartupPageProps {
  onReady: () => void;
}

export function StartupPage({ onReady }: StartupPageProps) {
  const { status } = useServicesStatus({ pollInterval: 1000 });
  const [showSkip, setShowSkip] = useState(false);

  useEffect(() => {
    if (status?.ready) {
      onReady();
    }
  }, [status?.ready, onReady]);

  useEffect(() => {
    const timer = setTimeout(() => setShowSkip(true), 30_000);
    return () => clearTimeout(timer);
  }, []);

  const pageStyle: React.CSSProperties = {
    background: colors.backgroundPage,
    color: colors.textPrimary,
    minHeight: "100vh",
  };

  if (!status) {
    return (
      <div style={pageStyle}>
        <Box textAlign="center" padding={{ top: "xxxl" }}>
          <StatusIndicator type="loading">
            Connecting to server...
          </StatusIndicator>
        </Box>
      </div>
    );
  }

  const services = [
    { name: "Whisper", status: status.services.whisper },
    { name: "Ollama", status: status.services.ollama },
  ];

  return (
    <div style={pageStyle}>
      <Box textAlign="center" padding={{ top: "xxxl" }}>
        <SpaceBetween size="l">
          <Box variant="h2">Starting services...</Box>
          <SpaceBetween size="xs">
            {services.map((service) => (
              <div key={service.name}>
                <StatusIndicator type={serviceStatusType(service.status.state)}>
                  {service.name}
                  {service.status.error && `: ${service.status.error}`}
                </StatusIndicator>
              </div>
            ))}
          </SpaceBetween>
          {showSkip && (
            <Link onFollow={onReady} variant="secondary">
              Skip and continue
            </Link>
          )}
        </SpaceBetween>
      </Box>
    </div>
  );
}
