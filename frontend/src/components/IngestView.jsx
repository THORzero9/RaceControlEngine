import { useState, useRef } from 'react';
import axios from 'axios';

function IngestView() {
  const [selectedSeries, setSelectedSeries] = useState('F1');
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState([
    { timestamp: new Date().toISOString(), type: 'SYSTEM', text: 'INGESTION TELEMETRY COCKPIT ONLINE.' },
    { timestamp: new Date().toISOString(), type: 'STANDBY', text: 'AWAITING PDF REGULATION TARGET PATH AND SERIES SPECIFICATION...' }
  ]);
  
  const fileInputRef = useRef(null);

  const addLog = (type, text) => {
    setLogs((prev) => [
      ...prev,
      { timestamp: new Date().toISOString(), type, text }
    ]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf' || droppedFile.name.endsWith('.pdf')) {
        setFile(droppedFile);
        addLog('FILE_STAGE', `STAGED PDF FOR ANALYSIS: "${droppedFile.name}" (${(droppedFile.size / 1024).toFixed(2)} KB)`);
      } else {
        addLog('ERROR', 'REJECTED: ONLY SPORTING REGULATION PDF FORMATS ARE ACCEPTED.');
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      addLog('FILE_STAGE', `STAGED PDF FOR ANALYSIS: "${selectedFile.name}" (${(selectedFile.size / 1024).toFixed(2)} KB)`);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current.click();
  };

  const clearStagedFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    addLog('SYSTEM', 'STAGED PDF BUFFER CLEARED.');
  };

  const handleUpload = async () => {
    if (!file) {
      addLog('ERROR', 'ABORTED: NO FILE STAGED IN RECEPTACLE.');
      return;
    }

    setIsLoading(true);
    addLog('NETWORK', `COMMENCING TRANSMISSION. TARGET ENDPOINT: /api/v1/ingest/pdf | SERIES: ${selectedSeries}`);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('series', selectedSeries);

    try {
      const response = await axios.post('/api/v1/ingest/pdf', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data && response.data.status === 'success') {
        addLog('SUCCESS', `TRANSMISSION COMPLETE. ${response.data.message}`);
        addLog('SYSTEM', `DATABASE RE-INDEXED: Wiped old ${selectedSeries} rules, batch inserted new rules.`);
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        addLog('ERROR', `INCOMPLETE: Server returned status ${response.data?.status}`);
      }
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.detail || err.message || 'Unknown network error.';
      addLog('ERROR', `PIPELINE INTERRUPTED: ${errMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex-1 flex p-gutter gap-gutter bg-background overflow-hidden w-full animate-fadeIn">
      <div className="flex-1 bg-surface-container border border-outline-variant flex flex-col h-full overflow-hidden">
        
        {/* Header Title bar */}
        <div className="bg-surface-container-low p-sm flex items-center justify-between border-b border-outline-variant flex-none">
          <span className="font-label-caps text-[11px] font-bold text-on-surface-variant tracking-widest">SPORTING REGULATIONS UPLOAD PIPELINE</span>
          <span className="font-data-xs text-[10px] text-primary-container">INGESTION ENGINE v1.0</span>
        </div>

        {/* Configuration & Stage Workspace */}
        <div className="flex-1 p-md flex flex-col md:flex-row gap-md overflow-hidden min-h-0">
          
          {/* Left panel: Controls & Dropzone */}
          <div className="flex-1 flex flex-col gap-md">
            
            {/* Series Configuration Selector */}
            <div className="bg-surface-container-low border border-outline-variant p-md flex flex-col gap-sm flex-none">
              <label className="font-label-caps text-[10px] font-bold text-on-surface-variant tracking-widest">CHAMPIONSHIP TARGET SERIES</label>
              
              <div className="grid grid-cols-3 gap-sm mt-xs">
                {['F1', 'MOTOGP', 'WEC'].map((series) => (
                  <button
                    key={series}
                    type="button"
                    onClick={() => {
                      setSelectedSeries(series);
                      addLog('SYSTEM', `TARGET CHAMPIONSHIP SERIES SET TO: ${series}`);
                    }}
                    className={`py-md font-label-caps text-xs font-bold tracking-wider transition-all rounded-none border ${
                      selectedSeries === series
                        ? 'bg-primary-container/20 border-primary-container text-primary-container font-bold'
                        : 'bg-surface-dim border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {series === 'F1' ? 'FORMULA 1 (FIA)' : series === 'MOTOGP' ? 'MOTOGP (FIM)' : 'WEC (ACO)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Receptacle Dropzone */}
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex-1 border-2 border-dashed flex flex-col items-center justify-center p-xl text-center transition-all duration-300 relative group cursor-pointer ${
                dragOver 
                  ? 'border-primary-container bg-primary-container/5 shadow-[0_0_15px_rgba(57,255,20,0.15)] animate-pulse' 
                  : file 
                    ? 'border-primary-container/50 bg-black/30' 
                    : 'border-outline-variant bg-surface-container-low hover:border-primary-container/30 hover:bg-surface-container-low/80'
              }`}
              onClick={triggerFileSelect}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="application/pdf"
                className="hidden"
              />

              {file ? (
                <div className="flex flex-col items-center gap-md animate-fadeIn" onClick={(e) => e.stopPropagation()}>
                  <span className="material-symbols-outlined text-[64px] text-primary-container">picture_as_pdf</span>
                  <div className="flex flex-col gap-xs">
                    <span className="font-display-mono text-sm text-primary-container tracking-wider uppercase font-semibold">{file.name}</span>
                    <span className="font-data-xs text-[11px] text-on-surface-variant">SIZE: {(file.size / 1024).toFixed(2)} KB</span>
                  </div>
                  <div className="flex gap-sm mt-md">
                    <button
                      type="button"
                      onClick={clearStagedFile}
                      className="px-md py-sm bg-red-600/20 text-red-400 border border-red-500/50 hover:bg-red-600/30 text-[10px] font-label-caps font-bold transition-all"
                    >
                      CLEAR RECEPTACLE
                    </button>
                    <button
                      type="button"
                      onClick={handleUpload}
                      disabled={isLoading}
                      className="px-md py-sm bg-primary-container text-on-primary text-[10px] font-label-caps font-bold transition-all glow-hover flex items-center gap-xs"
                    >
                      <span className="material-symbols-outlined text-sm">cloud_upload</span>
                      INITIALIZE PARSING SEQUENCE
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-sm">
                  <span className={`material-symbols-outlined text-[48px] transition-transform duration-300 group-hover:scale-110 ${dragOver ? 'text-primary-container' : 'text-on-surface-variant/40'}`}>
                    upload_file
                  </span>
                  <div className="font-label-caps text-xs font-bold text-on-surface tracking-wider">
                    DRAG & DROP OFFICIAL RULEBOOK PDF HERE
                  </div>
                  <div className="font-body-sm text-[10px] text-on-surface-variant max-w-[280px]">
                    or click to search system directories. Only standard PDF formats will pass validation checks.
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Right panel: Terminal Logs Console */}
          <div className="flex-1 flex flex-col bg-black border border-outline-variant overflow-hidden h-full">
            <div className="bg-surface-container-low p-sm flex items-center justify-between border-b border-outline-variant flex-none">
              <span className="font-display-mono text-[10px] text-primary-container font-bold">// REAL-TIME PIPELINE LOGS</span>
              <button 
                onClick={() => setLogs([{ timestamp: new Date().toISOString(), type: 'SYSTEM', text: 'INGESTION TELEMETRY COCKPIT ONLINE.' }])}
                className="text-[9px] font-label-caps text-on-surface-variant hover:text-primary-container transition-colors"
              >
                RESET TERMINAL
              </button>
            </div>
            
            {/* Scrollable logger container */}
            <div className="flex-1 p-md overflow-y-auto scrolling-terminal font-mono text-[11px] leading-relaxed flex flex-col gap-xs">
              {logs.map((log, index) => {
                let colorClass = 'text-primary-container';
                if (log.type === 'ERROR') colorClass = 'text-red-400';
                if (log.type === 'SUCCESS') colorClass = 'text-green-400';
                if (log.type === 'NETWORK') colorClass = 'text-secondary-container';
                if (log.type === 'FILE_STAGE') colorClass = 'text-amber-400';
                if (log.type === 'SYSTEM') colorClass = 'text-on-surface-variant';
                
                return (
                  <div key={index} className="flex gap-sm border-b border-zinc-900/50 pb-micro">
                    <span className="text-[10px] text-zinc-600 flex-none font-sans">
                      [{log.timestamp.split('T')[1].slice(0, 8)}]
                    </span>
                    <span className="font-bold flex-none text-[9px] w-14 select-none text-zinc-500">
                      {log.type}
                    </span>
                    <span className={`flex-1 select-text ${colorClass}`}>
                      {log.text}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>
    </main>
  );
}

export default IngestView;
