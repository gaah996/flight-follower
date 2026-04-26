import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Input,
  InputGroup,
  Label,
  Modal,
  Separator,
  TextField,
  useOverlayState,
} from "@heroui/react";
import {
  fetchSimbriefPlan,
  getSettings,
  resetSession,
  saveSettings,
  type ResetScope,
} from "../api/rest.js";
import { useViewStore } from "../store/view.js";
import { Gear, Xmark } from "@gravity-ui/icons";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState<{
    kind: "success" | "danger";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const overlayState = useOverlayState({
    isOpen: true,
    onOpenChange: (isOpen) => {
      if (!isOpen) onClose();
    },
  });

  useEffect(() => {
    getSettings().then((s) => setUserId(s.simbriefUserId ?? ""));
  }, []);

  async function onSave() {
    setBusy(true);
    setStatus(null);
    try {
      await saveSettings({ simbriefUserId: userId.trim() || null });
      setStatus({ kind: "success", text: "Saved." });
    } catch (err) {
      setStatus({
        kind: "danger",
        text: `Save failed: ${(err as Error).message}`,
      });
    } finally {
      setBusy(false);
    }
  }

  async function onFetch() {
    setBusy(true);
    setStatus(null);
    try {
      await saveSettings({ simbriefUserId: userId.trim() || null });
      await fetchSimbriefPlan();
      const view = useViewStore.getState();
      view.setMode("overview");
      view.requestFitOverview();
      setStatus({ kind: "success", text: "Plan fetched." });
    } catch (err) {
      setStatus({
        kind: "danger",
        text: `Fetch failed: ${(err as Error).message}`,
      });
    } finally {
      setBusy(false);
    }
  }

  const RESET_LABELS: Record<ResetScope, string> = {
    aircraft: "Aircraft data reset.",
    plan: "Flight plan reset.",
    all: "Session reset.",
  };

  async function onReset(scope: ResetScope) {
    setBusy(true);
    setStatus(null);
    try {
      await resetSession(scope);
      setStatus({ kind: "success", text: RESET_LABELS[scope] });
    } catch (err) {
      setStatus({
        kind: "danger",
        text: `Reset failed: ${(err as Error).message}`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal state={overlayState}>
      <Modal.Backdrop variant="blur">
        <Modal.Container size="md">
          <Modal.Dialog>
            <Modal.CloseTrigger aria-label="Close" />
            <Modal.Header>
              <Modal.Icon className="bg-default text-foreground">
                <Gear width={24} height={24} />
              </Modal.Icon>
              <Modal.Heading>Settings</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="py-4">
              <TextField>
                <Label>Simbrief User ID</Label>
                <div className="flex gap-2">
                  <Input
                    variant="secondary"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="123456"
                    aria-label="Pilot ID"
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    onPress={onSave}
                    isDisabled={busy}
                    className="text-accent-soft-foreground"
                  >
                    Save
                  </Button>
                </div>
              </TextField>
              {status && (
                <Alert status={status.kind}>
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>{status.text}</Alert.Title>
                  </Alert.Content>
                </Alert>
              )}
              <Separator className="my-2" />
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">Fetch latest plan</div>
                    <div className="text-xs text-fg-muted">
                      Pull the latest OFP from Simbrief.
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    onPress={onFetch}
                    isDisabled={busy || !userId.trim()}
                  >
                    Fetch
                  </Button>
                </div>
              </div>
              <Separator className="my-2" />
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">Aircraft data</div>
                    <div className="text-xs text-fg-muted">
                      Clears the breadcrumb trail and flight time.
                    </div>
                  </div>
                  <Button
                    variant="danger-soft"
                    onPress={() => onReset("aircraft")}
                    isDisabled={busy}
                  >
                    Reset
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">Flight plan</div>
                    <div className="text-xs text-fg-muted">
                      Clears the loaded flight plan.
                    </div>
                  </div>
                  <Button
                    variant="danger-soft"
                    onPress={() => onReset("plan")}
                    isDisabled={busy}
                  >
                    Reset
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">Everything</div>
                    <div className="text-xs text-fg-muted">
                      Clears aircraft data and flight plan.
                    </div>
                  </div>
                  <Button
                    variant="danger"
                    onPress={() => onReset("all")}
                    isDisabled={busy}
                  >
                    Reset all
                  </Button>
                </div>
              </div>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
