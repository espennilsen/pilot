import { useState, useCallback } from 'react';

interface CompanionPairingScreenProps {
  onPaired: () => void;
}

/**
 * Full-screen pairing UI shown in companion mode when no auth token exists.
 * User enters a 6-digit PIN from the desktop app to pair this browser session.
 */
export function CompanionPairingScreen({ onPaired }: CompanionPairingScreenProps) {
  const [pin, setPin] = useState('');
  const [deviceName, setDeviceName] = useState(() => getDefaultDeviceName());
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);

  const handlePair = useCallback(async () => {
    if (pin.length !== 6) {
      setError('Enter the 6-digit PIN from Pilot Desktop');
      return;
    }

    setPairing(true);
    setError(null);

    try {
      const res = await fetch('/api/companion-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: pin, deviceName }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Pairing failed (${res.status})`);
      }

      const { token } = await res.json();
      if (!token) throw new Error('No token received');

      // Persist token so reconnects and new tabs don't require re-pairing.
      // localStorage survives tab close; sessionStorage is only per-tab.
      localStorage.setItem('companion-auth-token', token);
      onPaired();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pairing failed');
    } finally {
      setPairing(false);
    }
  }, [pin, deviceName, onPaired]);

  const handlePinChange = (value: string) => {
    // Only allow digits, max 6
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setPin(digits);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && pin.length === 6) {
      handlePair();
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-bg-base">
      <div className="max-w-md w-full mx-4 space-y-8">
        {/* Logo / Title */}
        <div className="text-center space-y-2">
          <div className="text-4xl">🧑‍✈️</div>
          <h1 className="text-2xl font-bold text-text-primary">Pilot Companion</h1>
          <p className="text-text-secondary text-sm">
            Connect this device to your Pilot Desktop
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-bg-elevated rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-primary">How to pair</h2>
          <ol className="text-sm text-text-secondary space-y-2 list-decimal list-inside">
            <li>Open <strong className="text-text-primary">Pilot Desktop</strong> on your computer</li>
            <li>Go to <strong className="text-text-primary">Settings → Companion</strong></li>
            <li>Make sure the companion server is <strong className="text-text-primary">enabled</strong></li>
            <li>Click <strong className="text-text-primary">"Show PIN"</strong> to get a 6-digit code</li>
            <li>Enter the code below</li>
          </ol>
        </div>

        {/* PIN Entry */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Pairing PIN
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="000000"
              autoFocus
              className="w-full px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] rounded-lg
                bg-bg-base border border-border text-text-primary placeholder:text-text-secondary/30
                focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Device name
            </label>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="My Device"
              className="w-full px-3 py-2 rounded-lg bg-bg-base border border-border text-text-primary
                text-sm placeholder:text-text-secondary/50
                focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          {error && (
            <p className="text-sm text-error text-center">{error}</p>
          )}

          <button
            onClick={handlePair}
            disabled={pin.length !== 6 || pairing || !deviceName.trim()}
            className="w-full py-3 rounded-lg text-sm font-medium transition-colors
              bg-accent text-white hover:bg-accent-hover
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pairing ? 'Pairing…' : 'Pair Device'}
          </button>
        </div>

        {/* Footer */}
        <p className="text-xs text-text-secondary/60 text-center">
          The PIN expires after 30 seconds. Generate a new one if it doesn't work.
        </p>
      </div>
    </div>
  );
}

function getDefaultDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Browser (Mac)';
  if (/Win/.test(ua)) return 'Browser (Windows)';
  if (/Linux/.test(ua)) return 'Browser (Linux)';
  return 'Browser';
}
