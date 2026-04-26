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
import { fetchSimbriefPlan, getSettings, resetSession, saveSettings } from "../api/rest.js";
import { useViewStore } from "../store/view.js";
import { Gear } from "@gravity-ui/icons";

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

  async function onReset() {
    setBusy(true);
    setStatus(null);
    try {
      await resetSession();
      setStatus({ kind: "success", text: "Session reset." });
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
                    onPress={onFetch}
                    isDisabled={busy || !userId.trim()}
                    className="text-accent-soft-foreground"
                  >
                    Fetch latest plan
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
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Reset session</div>
                  <div className="text-xs text-fg-muted">
                    Clears flight plan and breadcrumb trail.
                  </div>
                </div>
                <Button
                  variant="danger-soft"
                  onPress={onReset}
                  isDisabled={busy}
                >
                  Reset
                </Button>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="tertiary" onPress={overlayState.close}>
                Close
              </Button>
              <Button variant="primary" onPress={onSave} isDisabled={busy}>
                Save
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
