import { useState, useEffect } from 'react';

function SettingsPage() {
  const [activeTab, setActiveTab] = useState('circuits');
  const [circuits, setCircuits] = useState([]);
  const [streams, setStreams] = useState([]);
  const [diagnostics, setDiagnostics] = useState(null);
  
  // Loading and Error States
  const [loadingCircuits, setLoadingCircuits] = useState(true);
  const [loadingStreams, setLoadingStreams] = useState(true);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(true);
  const [error, setError] = useState(null);

  // New Circuit Modal State
  const [showAddCircuit, setShowAddCircuit] = useState(false);
  const [newCircuit, setNewCircuit] = useState({
    name: '',
    turn_count: '',
    championship: 'F1',
    micro_sectors: ''
  });
  const [formError, setFormError] = useState('');

  // New Stream Form State
  const [newStream, setNewStream] = useState({
    target: '',
    protocol: 'WebSockets (ws://)',
    active: true
  });
  const [streamFormError, setStreamFormError] = useState('');

  // Fetch Circuits
  const fetchCircuits = async () => {
    setLoadingCircuits(true);
    try {
      const response = await fetch('/api/v1/settings/circuits');
      if (response.ok) {
        const data = await response.json();
        setCircuits(data);
      } else {
        setError('Failed to fetch circuits from database.');
      }
    } catch (err) {
      setError('Connection failed: Circuits API unreachable.');
    } finally {
      setLoadingCircuits(false);
    }
  };

  // Fetch Telemetry Streams
  const fetchStreams = async () => {
    setLoadingStreams(true);
    try {
      const response = await fetch('/api/v1/settings/streams');
      if (response.ok) {
        const data = await response.json();
        setStreams(data);
      } else {
        setError('Failed to fetch telemetry streams.');
      }
    } catch (err) {
      setError('Connection failed: Telemetry streams API unreachable.');
    } finally {
      setLoadingStreams(false);
    }
  };

  // Fetch Diagnostics
  const fetchDiagnostics = async () => {
    setLoadingDiagnostics(true);
    try {
      const response = await fetch('/api/v1/settings/diagnostics');
      if (response.ok) {
        const data = await response.json();
        setDiagnostics(data);
      } else {
        setDiagnostics(null);
      }
    } catch (err) {
      setDiagnostics(null);
    } finally {
      setLoadingDiagnostics(false);
    }
  };

  // Trigger data fetching based on active tab
  useEffect(() => {
    if (activeTab === 'circuits') {
      fetchCircuits();
    } else if (activeTab === 'streams') {
      fetchStreams();
    } else if (activeTab === 'diagnostics') {
      fetchDiagnostics();
      // Poll diagnostics every 5s
      const interval = setInterval(fetchDiagnostics, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  // Handle Add Circuit Submission
  const handleAddCircuitSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!newCircuit.name.trim()) {
      setFormError('Circuit name is required.');
      return;
    }

    const turns = parseInt(newCircuit.turn_count, 10);
    if (isNaN(turns) || turns <= 0) {
      setFormError('Total turns must be a positive integer.');
      return;
    }

    try {
      const response = await fetch('/api/v1/settings/circuits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCircuit.name,
          turn_count: turns,
          championship: newCircuit.championship,
          micro_sectors: newCircuit.micro_sectors
        })
      });

      if (response.ok) {
        setShowAddCircuit(false);
        setNewCircuit({ name: '', turn_count: '', championship: 'F1', micro_sectors: '' });
        fetchCircuits();
      } else {
        const data = await response.json();
        setFormError(data?.detail || 'Failed to save circuit.');
      }
    } catch (err) {
      setFormError('Network error: Unable to submit circuit.');
    }
  };

  // Handle Add Stream Submission
  const handleAddStreamSubmit = async (e) => {
    e.preventDefault();
    setStreamFormError('');

    if (!newStream.target.trim()) {
      setStreamFormError('Stream target is required.');
      return;
    }

    try {
      const response = await fetch('/api/v1/settings/streams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStream)
      });

      if (response.ok) {
        setNewStream({ target: '', protocol: 'WebSockets (ws://)', active: true });
        fetchStreams();
      } else {
        const data = await response.json();
        setStreamFormError(data?.detail || 'Failed to save stream.');
      }
    } catch (err) {
      setStreamFormError('Network error: Unable to submit stream.');
    }
  };

  // Toggle Stream Switch
  const handleToggleStream = async (id, currentActive) => {
    try {
      const response = await fetch('/api/v1/settings/streams/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: id,
          active: !currentActive
        })
      });

      if (response.ok) {
        // Optimistically update state
        setStreams(prev =>
          prev.map(s => (s._id === id ? { ...s, active: !currentActive } : s))
        );
      }
    } catch (err) {
      console.error('Failed to toggle stream:', err);
    }
  };

  return (
    <main className="flex-1 flex p-gutter gap-gutter bg-background overflow-hidden w-full animate-fadeIn">
      {/* Settings Control Panel Sidebar */}
      <section className="w-1/4 min-w-[220px] max-w-[280px] bg-surface-container border border-outline-variant flex flex-col h-full overflow-hidden">
        <div className="bg-surface-container-low p-sm flex items-center justify-between border-b border-outline-variant flex-none">
          <span className="font-label-caps text-[11px] font-bold text-on-surface-variant tracking-widest">CONTROL PLANE Navigation</span>
        </div>
        <nav className="flex flex-col p-md gap-sm">
          <button
            onClick={() => setActiveTab('circuits')}
            className={`w-full flex items-center gap-md px-md py-sm font-label-caps text-xs border rounded transition-all text-left ${
              activeTab === 'circuits'
                ? 'bg-primary-container/10 border-primary-container text-primary-container font-bold shadow-[0_0_10px_rgba(57,255,20,0.15)]'
                : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:text-on-surface hover:border-outline'
            }`}
          >
            <span className="material-symbols-outlined text-base">map</span>
            CIRCUITS DIRECTORY
          </button>
          <button
            onClick={() => setActiveTab('streams')}
            className={`w-full flex items-center gap-md px-md py-sm font-label-caps text-xs border rounded transition-all text-left ${
              activeTab === 'streams'
                ? 'bg-primary-container/10 border-primary-container text-primary-container font-bold shadow-[0_0_10px_rgba(57,255,20,0.15)]'
                : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:text-on-surface hover:border-outline'
            }`}
          >
            <span className="material-symbols-outlined text-base">sensors</span>
            TELEMETRY STREAMS
          </button>
          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`w-full flex items-center gap-md px-md py-sm font-label-caps text-xs border rounded transition-all text-left ${
              activeTab === 'diagnostics'
                ? 'bg-primary-container/10 border-primary-container text-primary-container font-bold shadow-[0_0_10px_rgba(57,255,20,0.15)]'
                : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:text-on-surface hover:border-outline'
            }`}
          >
            <span className="material-symbols-outlined text-base">shield</span>
            SYSTEM DIAGNOSTICS
          </button>
        </nav>
      </section>

      {/* Settings Active Workspace */}
      <section className="flex-1 bg-surface-container border border-outline-variant flex flex-col h-full overflow-hidden">
        {/* Workspace Sub-Header */}
        <div className="bg-surface-container-low p-sm flex items-center justify-between border-b border-outline-variant flex-none">
          <span className="font-label-caps text-[11px] font-bold text-on-surface-variant tracking-widest">
            Settings Workspace / {activeTab.toUpperCase()}
          </span>
          <span className="font-data-xs text-[10px] text-secondary-container">PERSISTENT SYSTEM CONTROL PLANE</span>
        </div>

        {/* Tab 1 Content: Circuits Directory */}
        {activeTab === 'circuits' && (
          <div className="flex-1 overflow-y-auto scrolling-terminal p-md flex flex-col gap-md">
            <div className="flex justify-between items-center flex-none">
              <h3 className="font-label-caps text-sm font-bold text-on-surface tracking-wider">TRACKS & CIRCUITS REGISTER</h3>
              <button
                onClick={() => setShowAddCircuit(true)}
                className="px-md py-sm bg-primary-container text-on-primary font-label-caps text-xs font-bold hover:bg-primary-container/85 hover:shadow-[0_0_15px_rgba(57,255,20,0.3)] transition-all border border-primary-container flex items-center gap-sm"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                ADD NEW CIRCUIT
              </button>
            </div>

            {loadingCircuits ? (
              <div className="h-48 flex items-center justify-center flex-col gap-sm text-secondary-container font-display-mono text-xs animate-pulse">
                <span className="animate-spin material-symbols-outlined text-[32px]">sync</span>
                REFRESHING CIRCUITS REGISTER...
              </div>
            ) : error ? (
              <div className="p-md border border-red-500/30 bg-red-500/5 text-red-400 text-xs font-data-md flex items-center gap-sm">
                <span className="material-symbols-outlined">error</span>
                {error}
              </div>
            ) : circuits.length === 0 ? (
              <div className="p-xl text-center italic text-xs text-on-surface-variant border border-dashed border-outline-variant bg-surface-container-lowest">
                No circuits found. Click [+ ADD NEW CIRCUIT] to configure your first track.
              </div>
            ) : (
              <div className="overflow-x-auto border border-outline-variant/60 rounded-sm bg-surface-container-lowest flex-1">
                <table className="w-full text-left border-collapse text-xs font-data-md">
                  <thead>
                    <tr className="border-b border-outline-variant bg-surface-dim text-on-surface-variant font-label-caps uppercase text-[10px]">
                      <th className="p-md font-bold tracking-wider">Circuit Name</th>
                      <th className="p-md font-bold tracking-wider">Total Turns</th>
                      <th className="p-md font-bold tracking-wider">Championship Affinity</th>
                      <th className="p-md font-bold tracking-wider">Micro-Sector Coordinates</th>
                    </tr>
                  </thead>
                  <tbody>
                    {circuits.map((c, idx) => (
                      <tr key={c._id || idx} className="border-b border-outline-variant/30 hover:bg-surface-container-low transition-colors">
                        <td className="p-md font-bold text-on-surface">{c.name}</td>
                        <td className="p-md text-secondary-container">{c.turn_count}</td>
                        <td className="p-md">
                          <span className={`px-sm py-micro font-label-caps text-[9px] font-bold border rounded-sm ${
                            c.championship === 'F1'
                              ? 'bg-red-500/10 border-red-500/30 text-red-400'
                              : c.championship === 'MotoGP'
                              ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                              : 'bg-green-500/10 border-green-500/30 text-green-400'
                          }`}>
                            {c.championship}
                          </span>
                        </td>
                        <td className="p-md text-on-surface-variant font-display-mono text-[11px] truncate max-w-xs" title={c.micro_sectors}>
                          {c.micro_sectors || 'Default Sectors'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2 Content: Telemetry Streams */}
        {activeTab === 'streams' && (
          <div className="flex-1 overflow-y-auto scrolling-terminal p-md flex flex-col gap-lg">
            <div className="flex flex-col gap-sm">
              <h3 className="font-label-caps text-sm font-bold text-on-surface tracking-wider border-b border-outline-variant/30 pb-xs">
                ACTIVE TELEMETRY STREAMS CONFIGURATION
              </h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Connect or terminate virtual or live telemetry streams dynamically. Active feeds will automatically inject telemetry frames into the adjudication engines.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              {/* Left Column: Stream Card Grid */}
              <div className="flex flex-col gap-md">
                <h4 className="font-label-caps text-xs font-bold text-secondary-container tracking-wider uppercase">Active Pipes</h4>
                
                {loadingStreams ? (
                  <div className="h-32 flex items-center justify-center text-secondary-container font-display-mono text-xs">
                    LOADING FEED PIPES...
                  </div>
                ) : streams.length === 0 ? (
                  <div className="p-md text-xs italic text-on-surface-variant text-center bg-surface-container-lowest border border-outline-variant/30">
                    No active streams. Configure a stream pipe on the right.
                  </div>
                ) : (
                  streams.map((s, idx) => (
                    <div key={s._id || idx} className="bg-surface-container-lowest p-md border border-outline-variant/45 rounded-sm flex items-center justify-between">
                      <div className="flex flex-col gap-micro">
                        <span className="font-semibold text-xs text-on-surface">{s.target}</span>
                        <span className="font-display-mono text-[10px] text-on-surface-variant tracking-wider uppercase">{s.protocol}</span>
                      </div>
                      
                      {/* Active Toggle Switch */}
                      <div className="flex items-center gap-sm">
                        <span className={`font-label-caps text-[9px] font-bold ${s.active ? 'text-primary-container' : 'text-on-surface-variant/40'}`}>
                          {s.active ? 'ACTIVE' : 'IDLE'}
                        </span>
                        <button
                          onClick={() => handleToggleStream(s._id, s.active)}
                          className={`w-10 h-5 rounded-full p-micro transition-all ${
                            s.active ? 'bg-primary-container' : 'bg-outline-variant'
                          }`}
                        >
                          <div className={`w-4 h-4 bg-surface rounded-full transition-all ${
                            s.active ? 'translate-x-5' : 'translate-x-0'
                          }`} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Right Column: Add Stream Form Panel */}
              <div className="bg-surface-container-low p-md border border-outline-variant/40 rounded-sm flex flex-col gap-md h-fit">
                <h4 className="font-label-caps text-xs font-bold text-on-surface tracking-wider uppercase border-b border-outline-variant/20 pb-micro">
                  CONFIG NEW STREAM PIPE
                </h4>
                
                <form onSubmit={handleAddStreamSubmit} className="flex flex-col gap-md">
                  {streamFormError && (
                    <div className="p-sm bg-red-500/5 border border-red-500/30 text-red-400 text-xs font-data-md">
                      {streamFormError}
                    </div>
                  )}
                  
                  <div className="flex flex-col gap-micro">
                    <label className="font-label-caps text-[10px] font-bold text-on-surface-variant">Stream Target Identifier</label>
                    <input
                      type="text"
                      placeholder="e.g. Car #44 F1 Live Feed"
                      value={newStream.target}
                      onChange={(e) => setNewStream(prev => ({ ...prev, target: e.target.value }))}
                      className="bg-surface-container-lowest border border-outline-variant text-on-surface text-xs p-sm focus:outline-none focus:border-primary-container"
                    />
                  </div>

                  <div className="flex flex-col gap-micro">
                    <label className="font-label-caps text-[10px] font-bold text-on-surface-variant">Protocol Selector</label>
                    <select
                      value={newStream.protocol}
                      onChange={(e) => setNewStream(prev => ({ ...prev, protocol: e.target.value }))}
                      className="bg-surface-container-lowest border border-outline-variant text-on-surface text-xs p-sm focus:outline-none"
                    >
                      <option value="WebSockets (ws://)">WebSockets (ws://)</option>
                      <option value="MQTT (mqtt://)">MQTT (mqtt://)</option>
                      <option value="REST (HTTP Polling)">REST (HTTP Polling)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between pt-sm">
                    <span className="font-label-caps text-[10px] font-bold text-on-surface-variant">Auto-Connect Target</span>
                    <button
                      type="button"
                      onClick={() => setNewStream(prev => ({ ...prev, active: !prev.active }))}
                      className={`w-10 h-5 rounded-full p-micro transition-all ${
                        newStream.active ? 'bg-primary-container' : 'bg-outline-variant'
                      }`}
                    >
                      <div className={`w-4 h-4 bg-surface rounded-full transition-all ${
                        newStream.active ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-md mt-sm bg-primary-container text-on-primary font-label-caps text-xs font-bold hover:bg-primary-container/85 hover:shadow-[0_0_15px_rgba(57,255,20,0.3)] transition-all border border-primary-container"
                  >
                    ESTABLISH CONNECTION PIPE
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3 Content: Diagnostics */}
        {activeTab === 'diagnostics' && (
          <div className="flex-1 overflow-y-auto scrolling-terminal p-md flex flex-col gap-lg">
            <div className="flex flex-col gap-sm">
              <h3 className="font-label-caps text-sm font-bold text-on-surface tracking-wider border-b border-outline-variant/30 pb-xs">
                EXTERNAL LINK DIAGNOSTICS & SYSTEM STATUS
              </h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Persistent health matrix monitoring local processes, database connection pools, and machine learning limits.
              </p>
            </div>

            {loadingDiagnostics && !diagnostics ? (
              <div className="h-32 flex items-center justify-center text-secondary-container font-display-mono text-xs">
                PINGING ENVIRONMENT ENDPOINTS...
              </div>
            ) : !diagnostics ? (
              <div className="p-md border border-red-500/30 bg-red-500/5 text-red-400 text-xs font-data-md flex items-center gap-sm">
                <span className="material-symbols-outlined">error</span>
                SYSTEM DIAGNOSTICS UNREACHABLE: Backend API offline.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
                
                {/* Diagnostic Card 1: MongoDB */}
                <div className="bg-surface-container-lowest p-md border border-outline-variant/40 rounded-sm flex flex-col gap-md">
                  <div className="flex justify-between items-start">
                    <span className="font-label-caps text-[10px] font-bold text-on-surface-variant">Database cluster</span>
                    <span className={`px-sm py-micro font-label-caps text-[9px] font-bold border rounded-sm shadow-[0_0_8px_rgba(57,255,20,0.1)] ${
                      diagnostics.mongodb === 'CONNECTED'
                        ? 'bg-primary-container/10 border-primary-container text-primary-container'
                        : 'bg-red-500/10 border-red-500/30 text-red-400 animate-pulse'
                    }`}>
                      {diagnostics.mongodb}
                    </span>
                  </div>
                  <div className="flex flex-col gap-micro">
                    <span className="font-bold text-sm text-on-surface">MongoDB Atlas</span>
                    <span className="text-[11px] text-on-surface-variant leading-relaxed">
                      Persisting incident logs, regulations collections, and circuits. Connection pool: Await drivers.
                    </span>
                  </div>
                </div>

                {/* Diagnostic Card 2: Gemini Agent */}
                <div className="bg-surface-container-lowest p-md border border-outline-variant/40 rounded-sm flex flex-col gap-md">
                  <div className="flex justify-between items-start">
                    <span className="font-label-caps text-[10px] font-bold text-on-surface-variant">Cognitive Agent</span>
                    <span className="px-sm py-micro bg-primary-container/10 border border-primary-container text-primary-container font-label-caps text-[9px] font-bold rounded-sm shadow-[0_0_8px_rgba(57,255,20,0.1)] uppercase">
                      Active
                    </span>
                  </div>
                  <div className="flex flex-col gap-micro">
                    <span className="font-bold text-sm text-on-surface">{diagnostics.gemini_model.toUpperCase()}</span>
                    <span className="text-[11px] text-on-surface-variant leading-relaxed">
                      Rate Limits: {diagnostics.gemini_limit}. Dynamic scoping boundaries enforced.
                    </span>
                  </div>
                </div>

                {/* Diagnostic Card 3: Local MCP Server */}
                <div className="bg-surface-container-lowest p-md border border-outline-variant/40 rounded-sm flex flex-col gap-md">
                  <div className="flex justify-between items-start">
                    <span className="font-label-caps text-[10px] font-bold text-on-surface-variant">Process state</span>
                    <span className="px-sm py-micro bg-primary-container/10 border border-primary-container text-primary-container font-label-caps text-[9px] font-bold rounded-sm shadow-[0_0_8px_rgba(57,255,20,0.1)] uppercase">
                      Running
                    </span>
                  </div>
                  <div className="flex flex-col gap-micro">
                    <span className="font-bold text-sm text-on-surface">Local MCP Server</span>
                    <span className="text-[11px] text-on-surface-variant leading-relaxed">
                      Communication protocol: {diagnostics.mcp_server}. Serves regulations lookup and precedents context.
                    </span>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}
      </section>

      {/* Add Circuit Modal Overlay */}
      {showAddCircuit && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-md z-50 animate-fadeIn">
          <div className="bg-surface-container border border-outline-variant flex flex-col w-full max-w-md shadow-2xl rounded-sm overflow-hidden animate-scaleIn">
            {/* Modal Header */}
            <div className="bg-surface-container-low p-md border-b border-outline-variant flex items-center justify-between flex-none">
              <span className="font-label-caps text-xs font-bold text-primary-container tracking-wider uppercase">
                Add New Circuit Configuration
              </span>
              <button 
                onClick={() => setShowAddCircuit(false)}
                className="text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high p-sm rounded-sm transition-all"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleAddCircuitSubmit} className="p-md flex flex-col gap-md">
              {formError && (
                <div className="p-sm bg-red-500/5 border border-red-500/30 text-red-400 text-xs font-data-md">
                  {formError}
                </div>
              )}

              <div className="flex flex-col gap-micro">
                <label className="font-label-caps text-[10px] font-bold text-on-surface-variant">Circuit Name</label>
                <input
                  type="text"
                  placeholder="e.g. Sepang International Circuit"
                  value={newCircuit.name}
                  onChange={(e) => setNewCircuit(prev => ({ ...prev, name: e.target.value }))}
                  className="bg-surface-container-lowest border border-outline-variant text-on-surface text-xs p-sm focus:outline-none focus:border-primary-container"
                />
              </div>

              <div className="grid grid-cols-2 gap-md">
                <div className="flex flex-col gap-micro">
                  <label className="font-label-caps text-[10px] font-bold text-on-surface-variant">Total Turn Count</label>
                  <input
                    type="number"
                    placeholder="e.g. 15"
                    value={newCircuit.turn_count}
                    onChange={(e) => setNewCircuit(prev => ({ ...prev, turn_count: e.target.value }))}
                    className="bg-surface-container-lowest border border-outline-variant text-on-surface text-xs p-sm focus:outline-none focus:border-primary-container"
                  />
                </div>

                <div className="flex flex-col gap-micro">
                  <label className="font-label-caps text-[10px] font-bold text-on-surface-variant">Championship Affinity</label>
                  <select
                    value={newCircuit.championship}
                    onChange={(e) => setNewCircuit(prev => ({ ...prev, championship: e.target.value }))}
                    className="bg-surface-container-lowest border border-outline-variant text-on-surface text-xs p-sm focus:outline-none"
                  >
                    <option value="F1">Formula 1</option>
                    <option value="MotoGP">MotoGP</option>
                    <option value="WEC">WEC</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-micro">
                <label className="font-label-caps text-[10px] font-bold text-on-surface-variant">Micro-Sector Coordinates</label>
                <input
                  type="text"
                  placeholder="e.g. Sector 1: T1-T5; Sector 2: T6-T10..."
                  value={newCircuit.micro_sectors}
                  onChange={(e) => setNewCircuit(prev => ({ ...prev, micro_sectors: e.target.value }))}
                  className="bg-surface-container-lowest border border-outline-variant text-on-surface text-xs p-sm focus:outline-none focus:border-primary-container"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-md pt-md border-t border-outline-variant/30 mt-sm">
                <button
                  type="button"
                  onClick={() => setShowAddCircuit(false)}
                  className="px-md py-sm bg-surface-container-low text-on-surface border border-outline-variant text-xs font-bold hover:bg-surface-container-high transition-all"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-lg py-sm bg-primary-container text-on-primary font-label-caps text-xs font-bold hover:bg-primary-container/85 hover:shadow-[0_0_15px_rgba(57,255,20,0.3)] transition-all border border-primary-container"
                >
                  ADD CONFIG
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

export default SettingsPage;
