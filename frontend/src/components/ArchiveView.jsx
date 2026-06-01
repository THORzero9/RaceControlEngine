import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { formatRuleText } from './RuleFormatter';

function ArchiveView() {
  const [archive, setArchive] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [expandedClauses, setExpandedClauses] = useState({});

  const formatPenaltyAction = (incident) => {
    if (!incident) return 'N/A';
    const type = incident.penalty_type || 'N/A';
    const val = incident.penalty_value;
    const typeUpper = type.toUpperCase();
    
    if (typeUpper.includes('TIME')) {
      return val ? `${val}S TIME PENALTY` : 'TIME PENALTY';
    }
    if (typeUpper.includes('LAP')) {
      if (val === 2) return 'DOUBLE LONG LAP';
      return val ? `${val}X LONG LAP` : 'LONG LAP';
    }
    if (typeUpper.includes('STOP') && typeUpper.includes('GO')) {
      if (typeUpper.includes('HOLD') || typeUpper.includes('STOP & GO HOLD') || typeUpper.includes('STOP_GO_HOLD')) {
        return val ? `${val}S HOLD STOP & GO` : 'STOP & GO HOLD';
      }
      return val ? `STOP & GO (${val}s)` : 'STOP & GO';
    }
    if (typeUpper.includes('DRIVE') || typeUpper.includes('THROUGH')) {
      return 'DRIVE THROUGH';
    }
    if (typeUpper.includes('POSITION') || typeUpper.includes('DROP')) {
      return val ? `DROP ${val} POSITIONS` : 'POSITION DROP';
    }
    if (typeUpper.includes('WARNING') || typeUpper.includes('REPRIMAND')) {
      return 'WARNING / REPRIMAND';
    }
    return val ? `${type} (${val})` : type;
  };

  const toggleClause = (id) => {
    setExpandedClauses(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  useEffect(() => {
    const fetchArchive = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/v1/archive');
        if (response.ok) {
          const data = await response.json();
          setArchive(data);
        } else {
          setError('Failed to retrieve incident logs from the archive cluster.');
        }
      } catch (err) {
        setError('Network interruption: Unable to establish connection to the database.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchArchive();
  }, []);

  return (
    <main className="flex-1 flex p-gutter gap-gutter bg-background overflow-hidden w-full animate-fadeIn">
      <div className="flex-1 bg-surface-container border border-outline-variant flex flex-col h-full overflow-hidden">
        
        {/* Header telemetry sub-bar */}
        <div className="bg-surface-container-low p-sm flex items-center justify-between border-b border-outline-variant flex-none">
          <span className="font-label-caps text-[11px] font-bold text-on-surface-variant tracking-widest">JUDICIAL ARCHIVE TELEMETRY</span>
          <span className="font-data-xs text-[10px] text-secondary-container">CONNECTED TO ATLAS CLUSTER</span>
        </div>

        {/* Scrollable Data Table Panel */}
        <div className="flex-1 overflow-y-auto scrolling-terminal p-md">
          {isLoading ? (
            <div className="h-full flex items-center justify-center flex-col gap-sm text-secondary-container font-display-mono text-xs py-xl">
              <span className="animate-spin material-symbols-outlined text-[32px]">sync</span>
              RETRIEVING PERSISTED HISTORICAL ENTRIES...
            </div>
          ) : error ? (
            <div className="p-md border border-red-500/30 bg-red-500/5 text-red-400 text-xs font-data-md flex items-center gap-sm">
              <span className="material-symbols-outlined">error</span>
              {error}
            </div>
          ) : archive.length === 0 ? (
            <div className="h-full flex flex-col justify-center items-center opacity-50 text-center gap-sm py-xl">
              <span className="material-symbols-outlined text-[48px] text-on-surface-variant/30">folder_open</span>
              <div className="font-semibold text-[11px] uppercase tracking-wider text-on-surface-variant">No Persisted Adjudications Found</div>
              <div className="text-[11px] text-on-surface-variant max-w-[320px]">
                Steward judgments will appear here in real-time once you hit "APPROVE ADJUDICATION" on the main dashboard.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-md">
              <div className="text-xs text-on-surface-variant uppercase tracking-wider font-label-caps mb-xs">
                Total Archived Records: {archive.length}
              </div>
              
              <div className="overflow-x-auto border border-outline-variant/60">
                <table className="w-full text-left border-collapse text-xs font-data-md bg-surface-container-low">
                  <thead>
                    <tr className="border-b border-outline-variant bg-surface-dim text-on-surface-variant font-label-caps uppercase text-[10px]">
                      <th className="p-md font-bold tracking-wider">Timestamp (UTC)</th>
                      <th className="p-md font-bold tracking-wider">Series</th>
                      <th className="p-md font-bold tracking-wider">Circuit</th>
                      <th className="p-md font-bold tracking-wider">Applied Rule</th>
                      <th className="p-md font-bold tracking-wider">Final Penalty Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archive.map((entry) => {
                      const dateStr = entry.timestamp 
                        ? new Date(entry.timestamp).toISOString().replace('T', ' ').substring(0, 19)
                        : 'N/A';
                      
                      // Extract rule IDs or join them
                      const ruleIds = entry.applicable_clauses && entry.applicable_clauses.length > 0
                        ? entry.applicable_clauses.map(c => c.rule_id || c._id).join(', ')
                        : 'N/A';

                      // Highlight status
                      const isApproved = entry.final_status === 'APPROVED';

                      return (
                        <tr 
                          key={entry._id} 
                          onClick={() => {
                            setExpandedClauses({});
                            setSelectedIncident(entry);
                          }}
                          className="border-b border-outline-variant/30 hover:bg-surface-container-high transition-colors cursor-pointer"
                        >
                          <td className="p-md text-secondary-container whitespace-nowrap">{dateStr}</td>
                          <td className="p-md font-semibold text-on-surface">{entry.incident_details?.series_id || 'N/A'}</td>
                          <td className="p-md text-on-surface-variant">
                            {entry.incident_details?.track_layout || 'N/A'} 
                            {entry.incident_details?.turn_number !== undefined && ` (Turn ${entry.incident_details.turn_number})`}
                          </td>
                          <td className="p-md font-semibold text-primary-container max-w-xs truncate" title={ruleIds}>
                            {ruleIds}
                          </td>
                          <td className="p-md">
                            <span className={`px-sm py-xs font-label-caps text-[10px] font-bold border ${
                              isApproved 
                                ? 'bg-primary-container/10 border-primary-container text-primary-container' 
                                : 'bg-amber-500/10 border-amber-500/80 text-amber-400'
                            }`}>
                              {entry.final_status || 'PENDING'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Archive Inspection Modal Overlay */}
      {selectedIncident && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-md z-50 animate-fadeIn">
          <div className="bg-surface-container border border-outline-variant flex flex-col w-full max-w-3xl max-h-[90vh] shadow-2xl rounded-sm overflow-hidden animate-scaleIn">
            
            {/* Modal Header */}
            <div className="bg-surface-container-low p-md border-b border-outline-variant flex items-center justify-between flex-none">
              <div className="flex items-center gap-md">
                <span className="font-label-caps text-xs font-bold text-primary-container tracking-wider uppercase">
                  ARCHIVE INCIDENT RECORD
                </span>
                <span className="px-sm py-micro bg-secondary-container/10 border border-secondary-container/30 text-secondary-container font-display-mono text-[10px] font-bold rounded-sm">
                  {selectedIncident.incident_details?.series_id}
                </span>
                <span className={`px-sm py-micro text-[10px] font-bold border rounded-sm font-label-caps ${
                  selectedIncident.final_status === 'APPROVED'
                    ? 'bg-primary-container/10 border-primary-container text-primary-container' 
                    : 'bg-amber-500/10 border-amber-500/80 text-amber-400'
                }`}>
                  {selectedIncident.final_status}
                </span>
              </div>
              <button 
                onClick={() => {
                  setExpandedClauses({});
                  setSelectedIncident(null);
                }}
                className="text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high p-sm rounded-sm transition-all flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto scrolling-terminal p-md flex flex-col gap-lg">
              
              {/* Timestamp & Location Metadata */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-md bg-surface-container-lowest p-sm border border-outline-variant/30 text-[11px] font-data-md">
                <div>
                  <span className="text-on-surface-variant block uppercase text-[9px] font-label-caps">Timestamp (UTC)</span>
                  <span className="text-secondary-container">
                    {selectedIncident.timestamp 
                      ? new Date(selectedIncident.timestamp).toISOString().replace('T', ' ').substring(0, 19)
                      : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-on-surface-variant block uppercase text-[9px] font-label-caps">Circuit Layout</span>
                  <span className="text-on-surface">{selectedIncident.incident_details?.track_layout || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-on-surface-variant block uppercase text-[9px] font-label-caps">Turn Coordinate</span>
                  <span className="text-on-surface">Turn {selectedIncident.incident_details?.turn_number ?? 'N/A'}</span>
                </div>
                <div>
                  <span className="text-on-surface-variant block uppercase text-[9px] font-label-caps">Surface Conditions</span>
                  <span className="text-on-surface">{selectedIncident.incident_details?.track_conditions || 'N/A'}</span>
                </div>
              </div>

              {/* Section 1: Telemetry & Marshal Notes */}
              <div className="flex flex-col gap-sm">
                <div className="flex items-center gap-sm border-b border-outline-variant/30 pb-xs">
                  <span className="material-symbols-outlined text-secondary-container text-base">description</span>
                  <h4 className="font-label-caps text-xs font-bold text-on-surface tracking-wider">MARSHAL NOTES & TELEMETRY SNAPSHOT</h4>
                </div>
                <div className="bg-surface-container-lowest p-md border border-outline-variant/40 rounded-sm font-sans text-xs text-on-surface-variant leading-relaxed whitespace-pre-wrap select-text">
                  {selectedIncident.incident_details?.marshal_notes}
                </div>
              </div>

              {/* Section 2: Applied Rule Clauses */}
              <div className="flex flex-col gap-sm">
                <div className="flex items-center gap-sm border-b border-outline-variant/30 pb-xs">
                  <span className="material-symbols-outlined text-primary-container text-base">gavel</span>
                  <h4 className="font-label-caps text-xs font-bold text-on-surface tracking-wider">APPLIED REGULATORY CLAUSES</h4>
                </div>
                <div className="flex flex-col gap-sm">
                  {selectedIncident.applicable_clauses && selectedIncident.applicable_clauses.length > 0 ? (
                    selectedIncident.applicable_clauses.map((clause, idx) => {
                      const clauseId = clause.rule_id || clause._id || `idx-${idx}`;
                      const isExpanded = !!expandedClauses[clauseId];
                      return (
                        <div 
                          key={clauseId} 
                          className="bg-surface-container-lowest border border-outline-variant/40 rounded-sm flex flex-col transition-all overflow-hidden"
                        >
                          {/* Collapsible Header */}
                          <div 
                            onClick={() => toggleClause(clauseId)}
                            className="p-md flex justify-between items-center cursor-pointer hover:bg-surface-container-high/40 transition-colors select-none"
                          >
                            <div className="flex flex-col md:flex-row md:items-center gap-xs md:gap-md">
                              <span className="font-display-mono text-xs font-bold text-primary-container whitespace-nowrap">
                                {clause.rule_id || clause._id}
                              </span>
                              <span className="font-label-caps text-[9px] text-on-surface-variant font-bold tracking-widest uppercase truncate max-w-md">
                                {clause.title}
                              </span>
                            </div>
                            <span className="material-symbols-outlined text-on-surface-variant transition-transform duration-200">
                              {isExpanded ? 'expand_less' : 'expand_more'}
                            </span>
                          </div>
                          
                          {/* Collapsible Content */}
                          {isExpanded && (
                            <div className="px-md pb-md font-sans text-xs leading-relaxed text-on-surface border-t border-outline-variant/10 pt-md animate-fadeIn">
                              {formatRuleText(clause.raw_text)}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-md text-xs text-on-surface-variant italic text-center bg-surface-container-lowest border border-outline-variant/30">
                      No rule clauses recorded for this incident.
                    </div>
                  )}
                </div>
              </div>

              {/* Section 3: Judicial Co-Pilot Analysis */}
              <div className="flex flex-col gap-sm">
                <div className="flex items-center gap-sm border-b border-outline-variant/30 pb-xs">
                  <span className="material-symbols-outlined text-tertiary-container text-base">analytics</span>
                  <h4 className="font-label-caps text-xs font-bold text-on-surface tracking-wider">JUDICIAL CO-PILOT ANALYSIS REPORT</h4>
                </div>
                <div className="bg-surface-container-lowest p-md border border-outline-variant/40 rounded-sm font-sans text-xs text-on-surface-variant leading-relaxed select-text prose prose-invert max-w-none">
                  <ReactMarkdown>
                    {selectedIncident.steward_draft_ruling}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Section 4: Human Steward Additions (if any) */}
              {(selectedIncident.steward_notes || selectedIncident.penalty_type) && (
                <div className="flex flex-col gap-sm bg-surface-container-low/40 p-md border border-outline-variant/20 rounded-sm">
                  <div className="flex items-center gap-sm border-b border-outline-variant/20 pb-xs">
                    <span className="material-symbols-outlined text-amber-500 text-base">assignment_ind</span>
                    <h4 className="font-label-caps text-xs font-bold text-on-surface tracking-wider">HUMAN STEWARD FINAL ADJUDICATION ACTION</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-md text-xs">
                    <div>
                      <span className="text-on-surface-variant block uppercase text-[9px] font-label-caps">Penalty Action Applied</span>
                      <span className="text-amber-400 font-semibold uppercase">{formatPenaltyAction(selectedIncident)}</span>
                    </div>
                    {selectedIncident.steward_notes && (
                      <div className="md:col-span-2">
                        <span className="text-on-surface-variant block uppercase text-[9px] font-label-caps">Human Steward Adjudication Notes</span>
                        <p className="text-on-surface italic mt-micro">{selectedIncident.steward_notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-surface-container-low p-md border-t border-outline-variant flex justify-end flex-none">
              <button 
                onClick={() => {
                  setExpandedClauses({});
                  setSelectedIncident(null);
                }}
                className="px-lg py-sm bg-primary-container text-on-primary font-label-caps text-xs font-bold hover:bg-primary-container/80 transition-all border border-primary-container"
              >
                CLOSE RECORD
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default ArchiveView;
