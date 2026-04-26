import { Chip } from "@heroui/react";
import { useFlightStore } from "../store/flight.js";
import { CircleFill } from "@gravity-ui/icons";

export function ConnectionStatus() {
  const simConnected = useFlightStore((s) => s.state.connected);
  const wsConnected = useFlightStore((s) => s.wsConnected);

  const wsText = wsConnected ? "WS connected" : "Reconnecting…";
  const simText = simConnected ? "Sim connected" : "Sim disconnected";

  return (
    <div className="flex gap-2 items-center">
      <Chip
        variant="secondary"
        color={simConnected ? "success" : "danger"}
        size="sm"
        className="px-1.5"
      >
        <CircleFill width={6} />
        <Chip.Label>{simText}</Chip.Label>
      </Chip>
      <Chip
        variant="secondary"
        color={wsConnected ? "success" : "warning"}
        size="sm"
        className="px-1.5"
      >
        <CircleFill width={6} />
        <Chip.Label>{wsText}</Chip.Label>
      </Chip>
    </div>
  );
}
