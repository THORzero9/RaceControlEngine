import { useState } from 'react';

function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!username.trim() || !password.trim()) {
      setError('Both username and password are required.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (response.ok) {
        const data = await response.json();
        // Return token and user details to App state
        onLoginSuccess(data.token, data);
      } else {
        const data = await response.json();
        setError(data?.detail || 'Authentication failed. Please check credentials.');
      }
    } catch (err) {
      setError('Connection failed: Authentication server unreachable.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background z-50 overflow-hidden font-data-md">
      {/* Background Neon Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-10">
        <div className="absolute w-[200%] h-[200%] top-[-50%] left-[-50%] bg-[radial-gradient(circle_at_center,#39ff14_0%,transparent_15%)] opacity-30 blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(39,39,42,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(39,39,42,0.15)_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      </div>

      {/* Login Card Container */}
      <div className="w-full max-w-md mx-4 bg-surface-container border border-outline-variant rounded-sm shadow-[0_0_30px_rgba(57,255,20,0.08)] flex flex-col overflow-hidden animate-scaleIn">
        {/* Card Header */}
        <div className="bg-surface-container-low p-md border-b border-outline-variant flex flex-col gap-micro">
          <span className="font-label-caps text-[10px] font-bold text-primary-container tracking-widest uppercase">
            SECURE CHECKPOINT
          </span>
          <h2 className="font-semibold text-lg text-on-surface uppercase tracking-wider">
            RACE CONTROL ENGINE
          </h2>
        </div>

        {/* Card Body */}
        <div className="p-md flex flex-col gap-md">
          {error && (
            <div className="p-sm border border-red-500/30 bg-red-500/5 text-red-400 text-xs flex items-center gap-sm">
              <span className="material-symbols-outlined text-sm">error</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-md">
            <div className="flex flex-col gap-micro">
              <label className="font-label-caps text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                Steward Username
              </label>
              <input
                type="text"
                placeholder="e.g. chief_steward"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-background border border-outline-variant text-on-surface text-xs p-sm focus:outline-none focus:border-primary-container focus:shadow-[0_0_8px_rgba(57,255,20,0.15)] rounded-sm transition-all"
                disabled={loading}
              />
            </div>

            <div className="flex flex-col gap-micro">
              <label className="font-label-caps text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                Access Password
              </label>
              <input
                type="password"
                placeholder="Enter passcode"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-background border border-outline-variant text-on-surface text-xs p-sm focus:outline-none focus:border-primary-container focus:shadow-[0_0_8px_rgba(57,255,20,0.15)] rounded-sm transition-all"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-md mt-sm bg-primary-container text-on-primary font-label-caps text-xs font-bold hover:bg-primary-container/85 hover:shadow-[0_0_15px_rgba(57,255,20,0.3)] transition-all border border-primary-container flex justify-center items-center gap-sm disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="animate-spin material-symbols-outlined text-sm">sync</span>
                  VERIFYING CREDENTIALS...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">lock_open</span>
                  AUTHORIZE SIGN-ON
                </>
              )}
            </button>
          </form>

          {/* Seeded Credentials Helper Box */}
          <div className="bg-surface-container-low border border-outline-variant/60 p-sm rounded-sm flex flex-col gap-micro">
            <span className="font-label-caps text-[9px] font-bold text-secondary-container tracking-wider uppercase">
              Seeded Admin Credentials (Out-of-the-Box)
            </span>
            <div className="font-display-mono text-[11px] text-on-surface-variant flex flex-col gap-xxs pt-xxs">
              <div>
                <span className="text-on-surface font-semibold">Username:</span> chief_steward
              </div>
              <div>
                <span className="text-on-surface font-semibold">Password:</span> racecontrol2026
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
