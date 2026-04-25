import { useEffect, useState } from 'react';
import { Button, Input, Modal, useOverlayState } from '@heroui/react';
import { fetchSimbriefPlan, getSettings, saveSettings } from '../api/rest.js';
import { useViewStore } from '../store/view.js';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const overlayState = useOverlayState({
    isOpen: true,
    onOpenChange: (isOpen) => {
      if (!isOpen) onClose();
    },
  });

  useEffect(() => {
    getSettings().then((s) => setUserId(s.simbriefUserId ?? ''));
  }, []);

  async function onSave() {
    setBusy(true);
    try {
      await saveSettings({ simbriefUserId: userId.trim() || null });
      setStatus('Saved.');
    } catch (err) {
      setStatus(`Save failed: ${(err as Error).message}`);
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
      view.setMode('overview');
      view.requestFitOverview();
      setStatus('Plan fetched.');
    } catch (err) {
      setStatus(`Fetch failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const statusOk = status === 'Saved.' || status === 'Plan fetched.';

  return (
    <Modal state={overlayState}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>Settings</Modal.Header>
            <Modal.Body>
              <section aria-labelledby="simbrief-section">
                <h3
                  id="simbrief-section"
                  style={{
                    margin: '0 0 8px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--ff-fg-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                  }}
                >
                  Simbrief
                </h3>
                <Input
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="123456"
                />
              </section>
              {status && (
                <p style={{ margin: '8px 0 0', color: statusOk ? '#16a34a' : '#dc2626', fontSize: 13 }}>
                  {status}
                </p>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onPress={onSave} isDisabled={busy}>Save</Button>
              <Button variant="primary" onPress={onFetch} isDisabled={busy || !userId.trim()}>
                Fetch latest plan
              </Button>
              <Button variant="ghost" onPress={overlayState.close}>Close</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
