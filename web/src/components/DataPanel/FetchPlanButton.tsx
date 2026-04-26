import { useState } from 'react';
import { Alert, Button } from '@heroui/react';
import { fetchSimbriefPlan, SimbriefFetchError } from '../../api/rest.js';
import { useViewStore } from '../../store/view.js';

// Top-of-panel CTA shown by DataPanel when no flight plan is loaded.
// Triggers /api/simbrief/fetch; the resulting plan arrives over the WS,
// which lets the CTA disappear automatically. Surfaces a friendly hint when
// the user hasn't configured a Simbrief ID yet.
export function FetchPlanButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFetch() {
    setBusy(true);
    setError(null);
    try {
      await fetchSimbriefPlan();
      const view = useViewStore.getState();
      view.setMode('overview');
      view.requestFitOverview();
    } catch (err) {
      if (err instanceof SimbriefFetchError && err.code === 'NO_USER_ID') {
        setError('Configure your Simbrief ID in Settings ⚙');
      } else {
        setError((err as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="ghost"
        onPress={onFetch}
        isDisabled={busy}
        className="text-accent-soft-foreground"
      >
        {busy ? 'Fetching…' : 'Fetch latest plan'}
      </Button>
      {error && (
        <Alert status="danger" className="self-stretch">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{error}</Alert.Title>
          </Alert.Content>
        </Alert>
      )}
    </div>
  );
}
