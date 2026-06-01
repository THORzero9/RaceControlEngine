import { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import RegulationsView from './components/RegulationsView';
import ArchiveView from './components/ArchiveView';
import IngestView from './components/IngestView';
import SettingsPage from './components/SettingsPage';
import LoginPage from './components/LoginPage';
import ProfilePage from './components/ProfilePage';
import { formatRuleText } from './components/RuleFormatter';
import { groupCitations } from './components/CitationGrouper';

// Default templates to make testing and demonstration beautiful and premium
const SERIES_TEMPLATES = {
  F1: {
    track_layout: 'SPA-FRANCORCHAMPS',
    turn_number: 17,
    track_conditions: 'MIXED',
    marshal_notes: 'CAR #44 (HAM) MADE CONTACT WITH CAR #33 (VER) AT APEX OF T17. CAR #44 SUSTAINED FRONT WING DAMAGE. CAR #33 FORCED OFF TRACK LIMITS. LATERAL ACCELERATION SPIKE 3.4G RECORDED AT 14:21:44.',
    driver_class: null,
    allowable_penalties: ['5S TIME PENALTY', '10S TIME PENALTY', 'DRIVE THROUGH', 'STOP/GO', 'REPRIMAND'],
    default_rules: [
      {
        rule_id: 'ARTICLE 33.3',
        title: 'TRACK LIMITS AND OVERTAKING SAFETY',
        raw_text: 'Drivers must make every reasonable effort to use the track at all times and may not leave the track without a justifiable reason.'
      },
      {
        rule_id: 'ARTICLE 2.4.1',
        title: 'AVOIDABLE COLLISION CRITERIA',
        raw_text: 'Any driver who is predominantly responsible for a collision will be penalized. In determining responsibility, stewards shall consider telemetry data.'
      }
    ],
    governing_body: 'FIA GOVERNING BODY',
    governing_logo: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBMO_TPe0rgqwnVD94nRS7vb2VusEByvWZXAck9Cs5nLZH8LMDtNKnamHo_LNLDVk6jUdCSZKpXiBb5KqtJkph5Jjp_g_lUuJ3s2vjJKXMnMnuZK_elmkAC9NkUcQWOp7sEiDr56bfZA2eX3X9_UdwaVnno787XzPlsNZeAQAjpeTwHFul2D1EoDqzk-Mr5ijEhk2mFO9kEIgJPfHfOer-EU0vQ4zdoceEgDpcEon7wZeR7XohGDxcNY27AZl7m4cxlQHeOrA-1KtU'
  },
  MOTOGP: {
    track_layout: 'MUGELLO CIRCUIT',
    turn_number: 1,
    track_conditions: 'DRY',
    marshal_notes: 'RIDER #93 (MM93) ATTEMPTED INSIDE PASS ON RIDER #1 (FB1) AT T1 ENTRY. RIDER #93 GAINED POSITION BY FORCING RIDER #1 TO UPRIGHT AND RUN WIDE ONTO RUN-OFF ASPHALT.',
    driver_class: null,
    allowable_penalties: ['LONG LAP PENALTY', 'DOUBLE LONG LAP', 'RIDER DROP POSITION', 'WARNING'],
    default_rules: [
      {
        rule_id: 'ARTICLE 1.21.2',
        title: 'RIDER TRACK LIMITS & ADVANTAGE',
        raw_text: 'Riders must ride in a responsible manner which does not cause danger to other competitors or track officials, either on the track or in the pit-lane.'
      },
      {
        rule_id: 'ARTICLE 1.21.5',
        title: 'CONTACT AND UNSPORTING MANEUVERS',
        raw_text: 'Any contact resulting in another rider losing ground or crashing due to aggressive overtaking will be subject to instant Long Lap penalties.'
      }
    ],
    governing_body: 'FIM STEWARDS PANEL',
    governing_logo: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBMO_TPe0rgqwnVD94nRS7vb2VusEByvWZXAck9Cs5nLZH8LMDtNKnamHo_LNLDVk6jUdCSZKpXiBb5KqtJkph5Jjp_g_lUuJ3s2vjJKXMnMnuZK_elmkAC9NkUcQWOp7sEiDr56bfZA2eX3X9_UdwaVnno787XzPlsNZeAQAjpeTwHFul2D1EoDqzk-Mr5ijEhk2mFO9kEIgJPfHfOer-EU0vQ4zdoceEgDpcEon7wZeR7XohGDxcNY27AZl7m4cxlQHeOrA-1KtU'
  },
  WEC: {
    track_layout: 'CIRCUIT DE LA SARTHE',
    turn_number: 6,
    track_conditions: 'DRY',
    marshal_notes: 'CAR #7 (HYPERCAR - TOYOTA) ATTEMPTED TO OVERTAKE CAR #88 (LMGT3 - PORSCHE) AT ENTRY TO MULSANNE. CONTACT MADE AT REAR QUARTER. CAR #88 SPUN INTO BARRIER. TELEMETRY SHOWS HYPERCAR LATE BRAKING BY 25M.',
    driver_class: 'Hypercar',
    allowable_penalties: ['DRIVE THROUGH', 'STOP-AND-GO 10S', 'STOP-AND-GO 30S', 'WARNING', 'TIME PENALTY'],
    default_rules: [
      {
        rule_id: 'ARTICLE 12.2.1',
        title: 'MULTICLASS OVERTAKING RESPONSIBILITY',
        raw_text: 'Faster cars (Hypercar class) bear the primary responsibility for executing clean, safe overtaking maneuvers on slower classes (LMGT3).'
      },
      {
        rule_id: 'ARTICLE 14.1.2',
        title: 'AVOIDABLE COLLISION & FORCE MAJEURE',
        raw_text: 'Any driver causing a collision which eliminates another competitor or damages another car class will face mandatory stop-and-go sanctions.'
      }
    ],
    governing_body: 'ACO RACE COMMISSION',
    governing_logo: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBMO_TPe0rgqwnVD94nRS7vb2VusEByvWZXAck9Cs5nLZH8LMDtNKnamHo_LNLDVk6jUdCSZKpXiBb5KqtJkph5Jjp_g_lUuJ3s2vjJKXMnMnuZK_elmkAC9NkUcQWOp7sEiDr56bfZA2eX3X9_UdwaVnno787XzPlsNZeAQAjpeTwHFul2D1EoDqzk-Mr5ijEhk2mFO9kEIgJPfHfOer-EU0vQ4zdoceEgDpcEon7wZeR7XohGDxcNY27AZl7m4cxlQHeOrA-1KtU'
  }
};

// Helper function to extract recommended penalty from raw Gemini draft text.
// First attempts structured extraction from PENALTY_TYPE:/INCREMENT: format,
// then falls back to keyword-scanning the allowable penalties list.
const parseProposedAdjudication = (text, penalties) => {
  if (!text || !penalties) return null;

  // 1. Attempt structured extraction from the new grading matrix output format
  const typeMatch = text.match(/\*\*PENALTY_TYPE:\*\*\s*(.+)/i);
  const incrementMatch = text.match(/\*\*INCREMENT:\*\*\s*(.+)/i);

  if (typeMatch && incrementMatch) {
    const penaltyType = typeMatch[1].trim().replace(/[_\s]+/g, ' ').toUpperCase();
    const increment = incrementMatch[1].trim();

    // Try to compose a badge string that matches an allowable penalty entry
    // e.g. TYPE="TIME_PENALTY" + INCREMENT="10 seconds" → "10S TIME PENALTY"
    const secMatch = increment.match(/(\d+)\s*(?:seconds?|s\b)/i);
    const lapMatch = increment.match(/(\d+)x?\s*long\s*lap/i);

    if (secMatch) {
      const composed = `${secMatch[1]}S ${penaltyType}`;
      // Match against the allowable list
      for (const p of penalties) {
        if (p.toUpperCase() === composed || p.toUpperCase().includes(composed)) return p;
      }
      // Fallback: return composed string directly for the badge
      return composed;
    }
    if (lapMatch) {
      const count = parseInt(lapMatch[1], 10);
      const label = count >= 2 ? 'DOUBLE LONG LAP' : 'LONG LAP PENALTY';
      for (const p of penalties) {
        if (p.toUpperCase().includes(label)) return p;
      }
      return label;
    }

    // If increment doesn't contain a number, match by type name only
    for (const p of penalties) {
      if (p.toUpperCase().includes(penaltyType) || penaltyType.includes(p.toUpperCase())) return p;
    }
    // Return a clean composite as last resort
    return `${increment} ${penaltyType}`.trim();
  }

  // 2. Fallback: keyword-scan the full text against allowable penalties
  const upperText = text.toUpperCase();
  for (const penalty of penalties) {
    if (upperText.includes(penalty.toUpperCase())) {
      return penalty;
    }
  }
  return null;
};

// Normalize backend penalties array (which may contain structured objects) into a clean string array
const normalizePenalties = (allowablePenalties) => {
  if (!allowablePenalties || !Array.isArray(allowablePenalties)) return [];
  const normalized = [];
  allowablePenalties.forEach(p => {
    if (typeof p === 'string') {
      normalized.push(p);
    } else if (p && typeof p === 'object') {
      const type = p.type || 'PENALTY';
      const cleanType = type.replace(/_/g, ' ').toUpperCase();
      if (p.increments_seconds && Array.isArray(p.increments_seconds)) {
        p.increments_seconds.forEach(sec => {
          normalized.push(`${sec}S ${cleanType}`);
        });
      } else {
        normalized.push(cleanType);
      }
    }
  });
  return normalized;
};

function App() {
  // Navigation State
  const [activeView, setActiveView] = useState('dashboard');

  // Authentication State
  const [token, setToken] = useState(localStorage.getItem('authToken') || '');
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(!!localStorage.getItem('authToken'));

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setAuthLoading(false);
        return;
      }
      try {
        const response = await fetch('/api/v1/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setUser(data);
        } else {
          localStorage.removeItem('authToken');
          setToken('');
          setUser(null);
        }
      } catch (err) {
        console.error('Failed to verify token', err);
      } finally {
        setAuthLoading(false);
      }
    };
    verifyToken();
  }, [token]);

  const handleLoginSuccess = (newToken, userData) => {
    localStorage.setItem('authToken', newToken);
    setToken(newToken);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setToken('');
    setUser(null);
    setActiveView('dashboard');
  };

  // 1. Core States matching backend IncidentPayload parameters
  const [seriesId, setSeriesId] = useState('F1');
  const [trackLayout, setTrackLayout] = useState(SERIES_TEMPLATES.F1.track_layout);
  const [turnNumber, setTurnNumber] = useState(SERIES_TEMPLATES.F1.turn_number);
  const [trackConditions, setTrackConditions] = useState(SERIES_TEMPLATES.F1.track_conditions);
  const [marshalNotes, setMarshalNotes] = useState(SERIES_TEMPLATES.F1.marshal_notes);
  const [driverClass, setDriverClass] = useState('Hypercar');
  
  // State hook for backend response (default: null)
  const [backendResponse, setBackendResponse] = useState(null);

  // Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [editedRulingText, setEditedRulingText] = useState('');
  const [penaltyType, setPenaltyType] = useState('Time Penalty');
  const [penaltyValue, setPenaltyValue] = useState(5);

  // Live sporting regulations loaded from database
  const [allRegulations, setAllRegulations] = useState([]);

  // Registered circuits loaded from database
  const [circuits, setCircuits] = useState([]);

  // 2. UI / Application States
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState('');
  const [systemAlert, setSystemAlert] = useState(null);
  const [backendOnline, setBackendOnline] = useState(true);
  const [adjudicationArchived, setAdjudicationArchived] = useState(false);
  
  // Chosen Adjudication (displays in dynamic penalty badge)
  const [chosenAdjudication, setChosenAdjudication] = useState('5S TIME PENALTY');

  // Archive data hooks
  const [archivedIncidents, setArchivedIncidents] = useState([]);
  const [loadingArchive, setLoadingArchive] = useState(false);

  // Real-time UTC race clock (ticks every 1000ms, formats as HH:MM:SS UTC using system time)
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const pad = (num) => String(num).padStart(2, '0');
      const timeString = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} UTC`;
      setCurrentTime(timeString);
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Live Backend Heartbeat Polling (queries /health every 10s)
  useEffect(() => {
    const checkHeartbeat = async () => {
      try {
        const response = await fetch('/health');
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'healthy') {
            setBackendOnline(true);
            return;
          }
        }
        setBackendOnline(false);
      } catch (err) {
        setBackendOnline(false);
      }
    };
    checkHeartbeat();
    const interval = setInterval(checkHeartbeat, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch active sporting regulations from MongoDB when mounting or switching views
  useEffect(() => {
    if (activeView === 'dashboard' || activeView === 'regulations') {
      const fetchInitialRegulations = async () => {
        try {
          const response = await fetch('/api/v1/regulations');
          if (response.ok) {
            const data = await response.json();
            setAllRegulations(data);
          }
        } catch (err) {
          console.error("Failed to load initial regulations:", err);
        }
      };
      fetchInitialRegulations();
    }
  }, [activeView]);

  // Fetch active circuits from MongoDB when mounting or switching views
  useEffect(() => {
    if (activeView === 'dashboard' || activeView === 'settings') {
      const fetchInitialCircuits = async () => {
        try {
          const response = await fetch('/api/v1/settings/circuits');
          if (response.ok) {
            const data = await response.json();
            setCircuits(data);
          }
        } catch (err) {
          console.error("Failed to load circuits register:", err);
        }
      };
      fetchInitialCircuits();
    }
  }, [activeView]);

  // Fetch Archive payload when archive tab is loaded
  useEffect(() => {
    if (activeView === 'archive') {
      const fetchArchive = async () => {
        setLoadingArchive(true);
        try {
          const response = await fetch('/api/v1/adjudicate');
          if (response.ok) {
            const data = await response.json();
            setArchivedIncidents(data);
          }
        } catch (err) {
          console.error(err);
        } finally {
          setLoadingArchive(false);
        }
      };
      fetchArchive();
    }
  }, [activeView]);

  // Phase 8: Penalty engine effect hook
  useEffect(() => {
    if (!isEditing) return;
    const typeUpper = String(penaltyType).toUpperCase();
    const headerBand = `### PENALTY ADJUDICATION: ${penaltyValue} ${typeUpper}\n\n`;

    setEditedRulingText((prevText) => {
      const prefixPattern = /^### PENALTY ADJUDICATION:[^\n]*\n\n/;
      if (prefixPattern.test(prevText)) {
        return prevText.replace(prefixPattern, headerBand);
      } else {
        return headerBand + prevText;
      }
    });
  }, [penaltyType, penaltyValue, isEditing]);

  // Synchronizes the internal penaltyType and penaltyValue states with a text penalty choice
  const syncPenaltyStateFromChosen = (penalty) => {
    if (!penalty) return;
    
    // Extract numerical value
    let val = 5; // default
    const numMatch = penalty.match(/\d+/);
    if (numMatch) {
      val = parseInt(numMatch[0], 10);
    } else {
      const lowerPen = penalty.toLowerCase();
      if (lowerPen.includes("double")) {
        val = 2;
      } else if (lowerPen.includes("triple")) {
        val = 3;
      } else if (lowerPen.includes("long lap") || lowerPen.includes("position drop") || lowerPen.includes("reprimand") || lowerPen.includes("warning")) {
        val = 1;
      }
    }

    // Determine mapped type for dropdown
    const lowerType = penalty.toLowerCase();
    let mappedType = "Time Penalty";

    if (lowerType.includes("stop") && lowerType.includes("go") && lowerType.includes("hold")) {
      mappedType = "Stop & Go Hold";
    } else if (lowerType.includes("stop") && lowerType.includes("go")) {
      mappedType = "Stop & Go";
    } else if (lowerType.includes("drive") && lowerType.includes("through")) {
      mappedType = "Drive Through";
    } else if (lowerType.includes("long") && lowerType.includes("lap")) {
      mappedType = "Long Lap";
    } else if (lowerType.includes("position") || lowerType.includes("drop")) {
      mappedType = "Position Drop";
    } else if (lowerType.includes("warning") || lowerType.includes("reprimand")) {
      mappedType = "Warning";
    } else if (lowerType.includes("time") || lowerType.includes("seconds")) {
      mappedType = "Time Penalty";
    } else {
      // Fallback conversion
      const clean = penalty.replace(/\d+S?/gi, '').replace(/[-_]/g, ' ').trim();
      mappedType = clean.split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }

    setPenaltyValue(val);
    setPenaltyType(mappedType);
  };

  // Handle click on sanction chips (only active when isEditing is true)
  const handleChipClick = (penalty) => {
    if (!isEditing) return; // Gate check: do nothing if isEditing is FALSE
    setChosenAdjudication(penalty);
    syncPenaltyStateFromChosen(penalty);
  };

  // Update form fields dynamically when changing the championship series
  const handleSeriesChange = (e) => {
    const nextSeries = e.target.value;
    setSeriesId(nextSeries);
    const template = SERIES_TEMPLATES[nextSeries];
    setTrackLayout(template.track_layout);
    setTurnNumber(template.turn_number);
    setTrackConditions(template.track_conditions);
    setMarshalNotes(template.marshal_notes);
    setBackendResponse(null);
    setIsEditing(false);
    setChosenAdjudication(template.allowable_penalties[0]);
    setAdjudicationArchived(false);
    if (template.driver_class) {
      setDriverClass(template.driver_class);
    }
  };

  // Perform API Post Call to investigation endpoint
  const runCopilotAnalysis = async () => {
    setIsLoading(true);
    setError(null);
    setSystemAlert(null);
    setAdjudicationArchived(false);
    
    // Construct exact IncidentPayload
    const payload = {
      series_id: seriesId,
      track_layout: trackLayout,
      turn_number: parseInt(turnNumber, 10) || 0,
      track_conditions: trackConditions,
      marshal_notes: marshalNotes,
      driver_class: seriesId === 'WEC' ? driverClass : null
    };

    try {
      const response = await fetch('/api/v1/investigate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.detail || `Server error: ${response.status}`);
      }

      const data = await response.json();
      setBackendResponse(data);

      const parsedPenalties = normalizePenalties(data.regulatory_framework?.allowable_penalties);
      // Parse the recommended penalty from the Gemini text or default to the first sanctioned penalty
      const parsedPenalty = parseProposedAdjudication(data.steward_draft_ruling, parsedPenalties);
      
      let selectedPen = parsedPenalties[0] || '5S TIME PENALTY';
      if (parsedPenalty) {
        selectedPen = parsedPenalty;
      }
      setChosenAdjudication(selectedPen);
      syncPenaltyStateFromChosen(selectedPen);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Network connection failed.');
      setSystemAlert({
        type: 'ERROR',
        message: `SYSTEM FAULT: ${err.message || 'API Investigation Failed'}`
      });
      setTimeout(() => setSystemAlert(null), 8000);
    } finally {
      setIsLoading(false);
    }
  };

  // Setup data arrays based on whether we have active API results or fallback template defaults
  const activeTemplate = SERIES_TEMPLATES[seriesId];
  const governingBody = backendResponse?.regulatory_framework?.governing_body || activeTemplate.governing_body;
  const governingLogo = activeTemplate.governing_logo;
  const standbyRules = allRegulations.filter(r => r.series_id.toUpperCase() === seriesId.toUpperCase());
  const draftRuling = backendResponse?.steward_draft_ruling;

  const activeRulingText = useMemo(() => {
    return isEditing ? editedRulingText : (backendResponse?.steward_draft_ruling || '');
  }, [isEditing, editedRulingText, backendResponse?.steward_draft_ruling]);

  const rawRuleIds = useMemo(() => {
    return extractRuleIdsFromText(activeRulingText);
  }, [activeRulingText]);

  const applicableClauses = useMemo(() => {
    // If analysis hasn't run yet, show the standby rules (all regulations for this series)
    if (!backendResponse) {
      return standbyRules;
    }

    // If analysis has run, we only show the ones that are matching (cited)
    if (rawRuleIds.length === 0) {
      return backendResponse?.applicable_clauses || [];
    }

    const sourceRules = standbyRules.length > 0 ? standbyRules : (backendResponse?.applicable_clauses || []);
    const matched = [];
    const matchedCleanedIds = new Set();

    rawRuleIds.forEach((rawId) => {
      const targetClean = cleanRuleIdForMatching(rawId);
      if (!targetClean) return;

      const rule = sourceRules.find(r => {
        const rId = r.rule_id || r._id || '';
        return cleanRuleIdForMatching(rId) === targetClean;
      });

      if (rule && !matchedCleanedIds.has(targetClean)) {
        matched.push(rule);
        matchedCleanedIds.add(targetClean);
      }
    });

    return matched;
  }, [backendResponse, standbyRules, rawRuleIds]);

  const allowablePenalties = normalizePenalties(backendResponse?.regulatory_framework?.allowable_penalties || activeTemplate.allowable_penalties);

  const filteredCircuits = circuits.filter(c => c.championship.toUpperCase() === seriesId.toUpperCase());
  const activeCircuit = filteredCircuits.find(c => c.name.toUpperCase() === trackLayout.toUpperCase());
  const isTurnInvalid = turnNumber !== '' && activeCircuit && (turnNumber < 1 || turnNumber > activeCircuit.turn_count);

  const handleApproveAdjudication = async () => {
    if (!backendResponse) return;
    setIsLoading(true);
    setSystemAlert(null);
    setError(null);

    const payload = {
      incident_details: backendResponse.incident_details,
      regulatory_framework: backendResponse.regulatory_framework,
      applicable_clauses: applicableClauses,
      steward_draft_ruling: isEditing ? editedRulingText : backendResponse.steward_draft_ruling,
      final_status: isEditing ? 'AMENDED' : 'APPROVED',
      steward_notes: `Approved by Steward ${user ? user.name : 'Unknown'}. Chosen Adjudication: ${chosenAdjudication}`,
      penalty_type: penaltyType,
      penalty_value: penaltyValue
    };

    try {
      const response = await fetch('/api/v1/adjudicate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.detail || `Server error: ${response.status}`);
      }

      setSystemAlert({
        type: 'SUCCESS',
        message: isEditing 
          ? 'Amended Judgment Logged Safely to Archive Cluster.'
          : 'Incident Judgment Logged Safely to Archive Cluster.'
      });
      setTimeout(() => setSystemAlert(null), 5000);
      setIsEditing(false);
      setAdjudicationArchived(true);
    } catch (err) {
      console.error(err);
      setSystemAlert({
        type: 'ERROR',
        message: `STORAGE ERROR: ${err.message || 'Adjudication Save Failed'}`
      });
      setTimeout(() => setSystemAlert(null), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="h-screen w-screen bg-background flex flex-col items-center justify-center text-secondary-container font-display-mono text-xs gap-sm">
        <span className="animate-spin material-symbols-outlined text-[32px]">sync</span>
        ESTABLISHING SECURE CONNECTION SESSION...
      </div>
    );
  }

  if (!token || !user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="bg-background text-on-surface flex flex-col h-screen overflow-hidden font-body-md select-none">
      
      {/* Top System Telemetry Bar */}
      <header className="flex justify-between items-center w-full px-margin-safe h-12 border-b border-outline-variant bg-surface-container-low flex-none relative z-10">
        <div className="flex items-center gap-md">
          <span className="font-display-mono text-lg text-primary-container tracking-tight">RACE CONTROL ENGINE</span>
          <nav className="hidden md:flex ml-lg gap-lg items-center">
            <button
              onClick={() => setActiveView('dashboard')}
              className={`font-label-caps text-xs px-sm py-micro transition-all duration-200 outline-none ${
                activeView === 'dashboard' 
                  ? 'text-primary-container border-b-2 border-primary-container font-bold' 
                  : 'text-on-surface-variant hover:text-primary-container'
              }`}
            >
              DASHBOARD
            </button>
            <button
              onClick={() => setActiveView('regulations')}
              className={`font-label-caps text-xs px-sm py-micro transition-all duration-200 outline-none ${
                activeView === 'regulations' 
                  ? 'text-primary-container border-b-2 border-primary-container font-bold' 
                  : 'text-on-surface-variant hover:text-primary-container'
              }`}
            >
              REGULATIONS
            </button>
            <button
              onClick={() => setActiveView('archive')}
              className={`font-label-caps text-xs px-sm py-micro transition-all duration-200 outline-none ${
                activeView === 'archive' 
                  ? 'text-primary-container border-b-2 border-primary-container font-bold' 
                  : 'text-on-surface-variant hover:text-primary-container'
              }`}
            >
              ARCHIVE
            </button>
            <button
              onClick={() => setActiveView('ingest')}
              className={`font-label-caps text-xs px-sm py-micro transition-all duration-200 outline-none ${
                activeView === 'ingest' 
                  ? 'text-primary-container border-b-2 border-primary-container font-bold' 
                  : 'text-on-surface-variant hover:text-primary-container'
              }`}
            >
              INGEST
            </button>
          </nav>
        </div>

        {/* Temporary Red System Alert Strip / Success Strip */}
        {systemAlert && (
          <div className={`absolute top-0 left-1/2 -translate-x-1/2 h-full flex items-center px-lg text-xs font-label-caps tracking-wider border-x ${
            systemAlert.type === 'ERROR' 
              ? 'bg-error-container text-on-error-container border-error/30 animate-pulse' 
              : 'bg-primary-container/20 text-primary-container border-primary-container/30'
          }`}>
            <span className="material-symbols-outlined text-sm mr-sm">
              {systemAlert.type === 'ERROR' ? 'error_outline' : 'check_circle'}
            </span>
            {systemAlert.message}
          </div>
        )}

        <div className="flex items-center gap-lg">
          <div className="flex items-center gap-md">
            <span className="font-label-caps text-xs text-on-surface-variant tracking-wider">{currentTime || '00:00:00 UTC'}</span>
            
            {/* Live Backend Heartbeat Indicator */}
            {backendOnline ? (
              <span className="bg-primary-container/10 border border-primary-container text-primary-container px-md py-micro font-label-caps text-[9px] rounded-sm font-bold tracking-widest transition-all">
                SYS ONLINE
              </span>
            ) : (
              <span className="bg-error-container/20 border border-error text-error px-md py-micro font-label-caps text-[9px] rounded-sm font-bold tracking-widest animate-pulse">
                SYS OFFLINE
              </span>
            )}
          </div>
          <div className="flex items-center gap-sm">
            {user && (
              <span className="font-display-mono text-[10px] text-primary-container mr-xs hidden sm:inline">
                {user.name.toUpperCase()} ({user.role})
              </span>
            )}
            <button className="material-symbols-outlined text-on-surface-variant hover:bg-surface-container-highest p-micro rounded transition-colors text-lg">notifications</button>
            <button 
              onClick={() => setActiveView('settings')}
              className={`material-symbols-outlined hover:bg-surface-container-highest p-micro rounded transition-colors text-lg ${
                activeView === 'settings' ? 'text-primary-container bg-surface-container-highest font-bold shadow-[0_0_10px_rgba(57,255,20,0.2)]' : 'text-on-surface-variant'
              }`}
            >
              settings
            </button>
            <button 
              onClick={() => setActiveView('profile')}
              className={`material-symbols-outlined hover:bg-surface-container-highest p-micro rounded transition-colors text-lg ${
                activeView === 'profile' ? 'text-primary-container bg-surface-container-highest font-bold shadow-[0_0_10px_rgba(57,255,20,0.2)]' : 'text-on-surface-variant'
              }`}
            >
              account_circle
            </button>
          </div>
        </div>
      </header>

      {/* Main View Port Condition Split */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* VIEW 1: STEWARD DASHBOARD */}
        {activeView === 'dashboard' && (
          <main className="flex-1 flex p-gutter gap-gutter bg-background overflow-hidden w-full">
            
            {/* COLUMN 1: INCIDENT CAPTURE (25% width) */}
            <section className="w-1/4 min-w-[280px] max-w-[340px] flex flex-col gap-gutter overflow-hidden">
              <div className="bg-surface-container border border-outline-variant flex flex-col h-full">
                <div className="bg-surface-container-low p-sm flex items-center justify-between border-b border-outline-variant">
                  <span className="font-label-caps text-[11px] font-bold text-on-surface-variant tracking-widest">INCIDENT CAPTURE</span>
                  <span className={`material-symbols-outlined text-primary-container text-sm cursor-pointer hover:rotate-180 transition-transform duration-500 ${isLoading ? 'animate-spin' : ''}`} onClick={() => {
                    setBackendResponse(null);
                    setError(null);
                    setAdjudicationArchived(false);
                  }}>sync</span>
                </div>
                
                <div className="p-md flex flex-col gap-lg flex-1 overflow-y-auto">
                  
                  {/* Series Selection */}
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-caps text-[10px] font-bold text-on-surface-variant tracking-widest">CHAMPIONSHIP SERIES</label>
                    <select 
                      value={seriesId} 
                      onChange={handleSeriesChange}
                      className="bg-surface-dim border border-outline-variant text-on-surface font-data-md text-xs p-sm focus:border-secondary-container focus:ring-0 outline-none transition-colors rounded-none"
                    >
                      <option value="F1">FORMULA 1 (FIA)</option>
                      <option value="MOTOGP">MOTOGP (FIM)</option>
                      <option value="WEC">WEC (ACO)</option>
                    </select>
                  </div>

                  {/* Multiclass WEC specific parameter */}
                  {seriesId === 'WEC' && (
                    <div className="flex flex-col gap-sm animate-fadeIn">
                      <label className="font-label-caps text-[10px] font-bold text-secondary-container tracking-widest">DRIVER CLASS (WEC ROUTING)</label>
                      <select 
                        value={driverClass} 
                        onChange={(e) => {
                          setDriverClass(e.target.value);
                          setBackendResponse(null);
                          setIsEditing(false);
                        }}
                        className="bg-surface-dim border border-secondary-container/40 text-secondary-container font-data-md text-xs p-sm focus:border-secondary-container outline-none rounded-none"
                      >
                        <option value="Hypercar">HYPERCAR</option>
                        <option value="LMGT3">LMGT3</option>
                      </select>
                    </div>
                  )}

                  {/* Circuit Input */}
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-caps text-[10px] font-bold text-on-surface-variant tracking-widest">CIRCUIT / LAYOUT</label>
                    <select 
                      value={trackLayout.toUpperCase()} 
                      onChange={(e) => {
                        setTrackLayout(e.target.value);
                        setBackendResponse(null);
                        setIsEditing(false);
                      }}
                      className="bg-surface-dim border border-outline-variant text-on-surface font-data-md text-xs p-sm focus:border-secondary-container outline-none rounded-none w-full"
                    >
                      {filteredCircuits.map((c) => (
                        <option key={c._id || c.name} value={c.name.toUpperCase()}>
                          {c.name.toUpperCase()}
                        </option>
                      ))}
                      {!filteredCircuits.some(c => c.name.toUpperCase() === trackLayout.toUpperCase()) && (
                        <option value={trackLayout.toUpperCase()}>
                          {trackLayout.toUpperCase()}
                        </option>
                      )}
                    </select>
                  </div>

                  {/* Turn Number Input (Requires int parsing for backend) */}
                  <div className="flex flex-col gap-sm">
                    <div className="flex justify-between items-center">
                      <label className="font-label-caps text-[10px] font-bold text-on-surface-variant tracking-widest">TURN NUMBER (INTEGER)</label>
                      {activeCircuit && (
                        <span className="text-[9px] text-secondary-container font-display-mono uppercase">
                          Max: {activeCircuit.turn_count} turns
                        </span>
                      )}
                    </div>
                    <input 
                      type="number" 
                      min="1"
                      max={activeCircuit ? activeCircuit.turn_count : undefined}
                      value={turnNumber} 
                      onChange={(e) => {
                        setTurnNumber(e.target.value ? parseInt(e.target.value, 10) : '');
                        setBackendResponse(null);
                        setIsEditing(false);
                      }}
                      className={`bg-surface-dim border text-on-surface font-data-md text-xs p-sm focus:border-secondary-container outline-none rounded-none ${
                        isTurnInvalid ? 'border-error/60 focus:border-error text-error font-bold shadow-[0_0_8px_rgba(255,0,0,0.15)]' : 'border-outline-variant'
                      }`}
                      placeholder="e.g. 17"
                    />
                    {isTurnInvalid && (
                      <span className="text-[10px] text-error font-semibold flex items-center gap-xxs animate-fadeIn">
                        <span className="material-symbols-outlined text-[12px]">warning</span>
                        Exceeds track limits (1 - {activeCircuit.turn_count})
                      </span>
                    )}
                  </div>

                  {/* Surface Conditions Toggle */}
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-caps text-[10px] font-bold text-on-surface-variant tracking-widest">SURFACE CONDITIONS</label>
                    <div className="grid grid-cols-3 gap-micro">
                      {['DRY', 'MIXED', 'WET'].map((cond) => (
                        <button
                          key={cond}
                          type="button"
                          onClick={() => {
                            setTrackConditions(cond);
                            setBackendResponse(null);
                            setIsEditing(false);
                          }}
                          className={`py-sm font-label-caps text-[10px] tracking-wider transition-all rounded-none border ${
                            trackConditions === cond 
                              ? 'bg-primary-container/20 border-primary-container text-primary-container' 
                              : 'bg-surface-dim border-outline-variant text-on-surface-variant hover:bg-surface-container-highest'
                          }`}
                        >
                          {cond}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Marshal Notes / Textarea */}
                  <div className="flex flex-col gap-sm flex-1 min-h-[140px]">
                    <label className="font-label-caps text-[10px] font-bold text-on-surface-variant tracking-widest">MARSHAL NOTES / TELEMETRY</label>
                    <textarea 
                      value={marshalNotes}
                      onChange={(e) => {
                        setMarshalNotes(e.target.value);
                        setBackendResponse(null);
                        setIsEditing(false);
                      }}
                      className="flex-1 bg-surface-dim border border-outline-variant text-on-surface font-data-xs text-[11px] p-sm resize-none focus:border-secondary-container outline-none leading-relaxed"
                      placeholder="Awaiting transcription input from trackside marshals or automated telemetry feed..."
                    />
                  </div>

                  {/* Trigger Button */}
                  <button 
                    onClick={runCopilotAnalysis}
                    disabled={isLoading || !marshalNotes.trim()}
                    className={`bg-primary-container text-on-primary font-label-caps text-xs font-bold py-md rounded-sm hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-sm ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className="material-symbols-outlined text-[16px]">{isLoading ? 'hourglass_empty' : 'psychology'}</span>
                    {isLoading ? 'PROCESSING LOGIC...' : 'RUN CO-PILOT ANALYSIS'}
                  </button>
                </div>
              </div>
            </section>

            {/* COLUMN 2: REGULATORY CORE (35% width) */}
            <section className="w-[35%] flex flex-col gap-gutter overflow-hidden">
              <div className="bg-surface-container border border-outline-variant flex flex-col h-full overflow-hidden">
                <div className="bg-surface-container-low p-sm flex items-center justify-between border-b border-outline-variant">
                  <span className="font-label-caps text-[11px] font-bold text-on-surface-variant tracking-widest">REGULATORY CORE</span>
                  <span className="px-sm bg-secondary-container/10 text-secondary-container border border-secondary-container/30 font-data-xs text-[10px]">
                    {seriesId === 'F1' ? 'FIA_SPORTING_REG_2026' : seriesId === 'MOTOGP' ? 'FIM_GRAND_PRIX_REG_2026' : 'ACO_WEC_REG_2026'}
                  </span>
                </div>
                
                <div className="p-md flex flex-col gap-md flex-1 overflow-y-auto scrolling-terminal">
                  
                  {/* Governing Body Card */}
                  <div className="bg-surface-container-high border border-outline-variant p-sm flex gap-md items-center">
                    <div className="w-10 h-10 bg-black/40 border border-outline-variant flex items-center justify-center text-primary-container font-display-mono font-bold text-base">
                      {seriesId}
                    </div>
                    <div>
                      <h4 className="font-headline-sm text-sm text-on-surface font-semibold tracking-wide uppercase">{governingBody}</h4>
                      <p className="font-body-sm text-[10px] text-on-surface-variant uppercase tracking-wider">
                        {seriesId === 'F1' ? 'F1 Sporting Code - Article Group' : seriesId === 'MOTOGP' ? 'Grand Prix Sporting Code' : 'WEC World Championship Regulations'}
                      </p>
                    </div>
                  </div>

                  {/* Rulebook Clauses Matches — Hierarchically Grouped */}
                  <div className="flex flex-col gap-md flex-1">
                    <label className="font-label-caps text-[10px] font-bold text-on-surface-variant tracking-widest block mb-xs">REFERENCED CODE CLAUSES</label>
                    
                    {groupCitations(applicableClauses, seriesId).map((group) => (
                      <div key={group.key} className="flex flex-col gap-sm">
                        {/* Group Category Header */}
                        <div className="flex items-center gap-sm bg-surface-container-high/60 border border-outline-variant/50 px-sm py-xs">
                          <span className="material-symbols-outlined text-secondary-container text-sm">{group.icon}</span>
                          <span className="font-label-caps text-[10px] text-secondary-container tracking-widest font-bold uppercase">
                            {group.label}
                          </span>
                          <span className="ml-auto font-data-xs text-[9px] text-on-surface-variant border border-outline-variant/40 bg-surface-dim px-sm py-micro">
                            {group.clauses.length} {group.clauses.length === 1 ? 'CLAUSE' : 'CLAUSES'}
                          </span>
                        </div>

                        {/* Individual Clauses Under This Group */}
                        {group.clauses.map((clause) => (
                          <div
                            key={clause.originalId || clause.displayId}
                            className={`bg-surface-dim p-sm border-l-2 ml-sm ${
                              clause.matchRank === 0
                                ? 'border-primary-container'
                                : 'border-outline-variant opacity-80'
                            }`}
                          >
                            <div className="flex justify-between items-center mb-micro">
                              <span className="font-display-mono text-[11px] text-primary-container font-semibold">
                                {clause.displayId}
                              </span>
                              <span className="font-label-caps text-[9px] text-on-surface-variant tracking-widest">
                                {clause.matchRank === 0 ? 'PRIMARY MATCH' : `MATCH #${clause.matchRank + 1}`}
                              </span>
                            </div>
                            <h5 className="font-label-caps text-[10px] text-on-surface mb-sm font-semibold">
                              {clause.title}
                            </h5>
                            <div className="font-body-sm text-[11px] text-on-surface-variant leading-relaxed">
                              {formatRuleText(clause.raw_text)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}

                    {applicableClauses.length === 0 && (
                      <div className="h-24 bg-surface-dim border border-outline-variant/40 border-dashed flex items-center justify-center text-xs text-on-surface-variant italic">
                        No matching regulations found.
                      </div>
                    )}
                  </div>

                  {/* Allowable Sanctioned Penalties */}
                  <div className="mt-auto border-t border-outline-variant/40 pt-md">
                    <label className="font-label-caps text-[10px] font-bold text-on-surface-variant block mb-sm tracking-widest">
                      SANCTIONED PENALTIES FOR THIS SERIES
                    </label>
                    <div className="flex flex-wrap gap-sm">
                      {allowablePenalties.map((penalty, idx) => (
                        <span 
                          key={idx} 
                          onClick={() => handleChipClick(penalty)}
                          className={`px-md py-micro font-label-caps text-[10px] rounded-full border tracking-wide transition-all ${
                            isEditing 
                              ? 'cursor-pointer hover:border-primary-container' 
                              : 'cursor-not-allowed opacity-75'
                          } ${
                            chosenAdjudication === penalty
                              ? 'bg-primary-container/20 text-primary-container border-primary-container' 
                              : 'bg-surface-container-highest text-on-surface border-outline-variant'
                          }`}
                        >
                          {penalty}
                        </span>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            </section>

            {/* COLUMN 3: JUDICIAL CO-PILOT (40% width) */}
            <section className="w-[40%] flex flex-col gap-gutter overflow-hidden">
              <div className="bg-surface-container-lowest border border-outline-variant flex flex-col h-full overflow-hidden">
                
                <div className="bg-surface-container-low p-sm flex items-center justify-between border-b border-outline-variant">
                  <span className="font-label-caps text-[11px] font-bold text-primary-container tracking-widest">JUDICIAL CO-PILOT ANALYSIS</span>
                  <div className="flex items-center gap-sm">
                    <span className={`w-2 h-2 rounded-full ${isLoading ? 'bg-secondary-container animate-ping' : backendResponse ? 'bg-primary-container' : 'bg-on-surface-variant opacity-50'}`}></span>
                    <span className={`font-data-xs text-[10px] tracking-wider uppercase ${isLoading ? 'text-secondary-container' : 'text-primary-container'}`}>
                      {isLoading ? 'PROCESSING TELEMETRY...' : backendResponse ? 'ANALYSIS COMPLETE' : 'STANDBY'}
                    </span>
                  </div>
                </div>
                
                {/* Terminal View Output */}
                <div className="flex-1 bg-black overflow-hidden flex flex-col border-b border-outline-variant">
                  {isEditing && (
                    <div className="grid grid-cols-2 gap-md p-sm bg-surface-container-low border-b border-outline-variant flex-none">
                      {/* Penalty Type Select */}
                      <div className="flex flex-col gap-micro">
                        <label className="font-label-caps text-[9px] text-secondary-container tracking-wider font-bold">PENALTY TYPE</label>
                        <select
                          value={penaltyType}
                          onChange={(e) => setPenaltyType(e.target.value)}
                          className="w-full bg-black border border-outline-variant text-xs font-data-md text-primary-container p-xs outline-none focus:border-primary-container"
                        >
                          <option value="Time Penalty">TIME PENALTY</option>
                          <option value="Stop & Go">STOP & GO</option>
                          <option value="Drive Through">DRIVE THROUGH</option>
                          <option value="Long Lap">LONG LAP</option>
                          <option value="Position Drop">POSITION DROP</option>
                          <option value="Stop & Go Hold">STOP & GO HOLD</option>
                          <option value="Warning">WARNING / REPRIMAND</option>
                        </select>
                      </div>

                      {/* Penalty Value Stepper */}
                      <div className="flex flex-col gap-micro">
                        <label className="font-label-caps text-[9px] text-secondary-container tracking-wider font-bold">PENALTY VALUE</label>
                        <div className="flex items-center bg-black border border-outline-variant h-[26px]">
                          <button
                            type="button"
                            onClick={() => setPenaltyValue(prev => Math.max(1, prev - 1))}
                            className="px-sm h-full text-on-surface hover:bg-surface-container-high transition-colors font-bold text-xs"
                          >
                            -
                          </button>
                          <span className="flex-1 text-center font-mono text-xs text-primary-container font-semibold">
                            {penaltyValue}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPenaltyValue(prev => prev + 1)}
                            className="px-sm h-full text-on-surface hover:bg-surface-container-high transition-colors font-bold text-xs"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {isEditing ? (
                    <textarea
                      value={editedRulingText}
                      onChange={(e) => setEditedRulingText(e.target.value)}
                      className="flex-1 w-full h-full p-md bg-black border-none focus:outline-none focus:ring-0 text-primary-container font-mono text-xs leading-relaxed resize-none overflow-y-auto scrolling-terminal"
                    />
                  ) : isLoading ? (
                    <div className="flex-1 p-md overflow-y-auto scrolling-terminal font-data-md text-xs text-primary-container leading-relaxed">
                      <div className="flex flex-col gap-sm font-mono text-[10px]">
                        <span className="text-secondary-container font-semibold">// INGESTING INCIDENT TELEMETRY SNAPSHOT...</span>
                        <span className="text-on-surface-variant">// CORRELATING REGULATIONS UNDER {governingBody}...</span>
                        <span className="text-on-surface-variant">// RUNNING MULTI-AGENT COORDINATION MESH...</span>
                        <span className="text-on-surface-variant">// RESOLVING PRECEDENTS & GRADED PENALTY WINDOW...</span>
                        <span className="text-on-surface-variant">// COMPILING FINAL ADJUDICATION DRAFT...</span>
                        
                        <div className="flex justify-center mt-lg">
                          <pre className="animate-spin text-secondary-container font-mono text-[14px] select-none leading-none inline-block origin-center">
{`     .---.     
   /   |   \\   
  | -- O -- |  
   \\   |   /   
     '---'     `}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ) : draftRuling ? (
                    <div className="flex-1 p-md overflow-y-auto scrolling-terminal font-data-md text-xs text-primary-container leading-relaxed animate-fadeIn">
                      <div className="mb-md border-b border-outline-variant/30 pb-xs">
                        <span className="text-secondary-container font-semibold">[ANALYSIS_REPORT_UUID: RC-{seriesId}-2026]</span><br />
                        <span className="text-on-surface-variant">// INPUT: Incident captured at T{turnNumber} {trackLayout}</span><br />
                        <span className="text-on-surface-variant">// CORRELATION COMPLETE: {applicableClauses.length} Regulation matches found.</span>
                      </div>

                      <div className="text-on-surface text-[13px] leading-relaxed">
                        <ReactMarkdown
                          components={{
                            h1: ({node, ...props}) => <h1 className="font-display-mono text-base text-primary-container uppercase mt-sm mb-xs" {...props} />,
                            h2: ({node, ...props}) => <h2 className="font-display-mono text-sm text-primary-container uppercase mt-sm mb-xs" {...props} />,
                            h3: ({node, ...props}) => <h3 className="font-display-mono text-xs text-primary-container uppercase mt-sm mb-xs font-bold" {...props} />,
                            p: ({node, ...props}) => <p className="text-[13px] font-sans text-on-surface leading-relaxed mb-sm" {...props} />,
                            ul: ({node, ...props}) => <ul className="list-disc pl-md text-xs text-on-surface-variant flex flex-col gap-xs mb-sm" {...props} />,
                            ol: ({node, ...props}) => <ol className="list-decimal pl-md text-xs text-on-surface-variant flex flex-col gap-xs mb-sm" {...props} />,
                            li: ({node, ...props}) => <li className="text-[12px] font-sans leading-relaxed" {...props} />,
                            code: ({node, inline, ...props}) => <code className="bg-surface-dim px-sm py-micro font-mono text-[11px] text-secondary-container border border-outline-variant/50" {...props} />
                          }}
                        >
                          {draftRuling}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 p-md overflow-y-auto scrolling-terminal font-data-md text-xs text-primary-container leading-relaxed flex flex-col gap-sm opacity-50 h-full justify-center items-center text-center px-lg">
                      <span className="material-symbols-outlined text-[36px] text-on-surface-variant/30">terminal</span>
                      <div className="font-semibold text-on-surface-variant uppercase tracking-wider text-[11px]">[SYSTEM STATUS: STANDBY]</div>
                      <div className="text-[11px] text-on-surface-variant max-w-[280px]">
                        Awaiting marshal input. Populate Column 1 and trigger "RUN CO-PILOT ANALYSIS" to generate a regulatory assessment.
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Adjudication Control Tray */}
                <div className="p-md bg-surface-container-low flex flex-col gap-md flex-none border-t border-outline-variant">
                  
                  {/* Proposed Adjudication dynamic badge */}
                  <div className="border-b border-outline-variant/30 pb-md">
                    <span className="font-label-caps text-label-caps text-secondary-container">PROPOSED ADJUDICATION</span>
                    {backendResponse ? (
                      <div className="mt-sm flex items-center gap-md animate-fadeIn">
                        <span className="text-[22px] font-display-mono text-primary-container tracking-tight uppercase leading-none">
                          {chosenAdjudication}
                        </span>
                        <div className="h-8 w-px bg-outline-variant"></div>
                        <div className="flex flex-col">
                          <span className="text-on-surface font-label-caps text-[9px] tracking-wider leading-none">OFFICIAL PENALTY</span>
                          <span className="text-on-surface-variant font-data-xs text-[9px] mt-xs uppercase">
                            {seriesId === 'WEC' ? `CLASS: ${driverClass}` : `SERIES: ${seriesId}`}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-sm text-xs text-on-surface-variant opacity-60 italic tracking-wider font-data-md">
                        Awaiting analysis initialization loop...
                      </div>
                    )}
                  </div>

                  <div className="flex gap-md w-full">
                    {adjudicationArchived ? (
                      <button 
                        disabled
                        className="flex-1 bg-primary-container/10 border border-primary-container/30 text-primary-container/60 font-label-caps text-xs font-bold py-md flex items-center justify-center gap-sm opacity-75 cursor-not-allowed w-full"
                      >
                        <span className="material-symbols-outlined text-base">check_circle</span>
                        ADJUDICATION ARCHIVED & LOCKED
                      </button>
                    ) : isEditing ? (
                      <>
                        <button 
                          onClick={() => setIsEditing(false)}
                          className="flex-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/50 font-label-caps text-xs font-bold py-md hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-sm"
                        >
                          <span className="material-symbols-outlined text-base">cancel</span>
                          CANCEL
                        </button>
                        <button 
                          onClick={handleApproveAdjudication}
                          disabled={isLoading}
                          className="flex-1 bg-primary-container text-on-primary font-label-caps text-xs font-bold py-md hover:opacity-90 active:scale-95 transition-all glow-hover flex items-center justify-center gap-sm"
                        >
                          <span className="material-symbols-outlined text-base">check_circle</span>
                          CONFIRM & ARCHIVE
                        </button>
                      </>
                    ) : (
                      <>
                        <button 
                          onClick={handleApproveAdjudication}
                          disabled={!backendResponse || isLoading}
                          className={`flex-1 bg-primary-container text-on-primary font-label-caps text-xs font-bold py-md hover:opacity-90 active:scale-95 transition-all glow-hover flex items-center justify-center gap-sm ${!backendResponse ? 'opacity-30 cursor-not-allowed border border-outline-variant/35 bg-transparent text-on-surface-variant' : ''}`}
                        >
                          <span className="material-symbols-outlined text-base">check_circle</span>
                          APPROVE ADJUDICATION
                        </button>
                        <button 
                          onClick={() => {
                            if (!backendResponse) return;
                            setIsEditing(true);
                            setEditedRulingText(backendResponse.steward_draft_ruling || '');
                          }}
                          disabled={!backendResponse || isLoading}
                          className={`flex-1 border font-label-caps text-xs font-bold py-md hover:bg-surface-container-highest active:scale-95 transition-all flex items-center justify-center gap-sm ${!backendResponse ? 'opacity-30 cursor-not-allowed border border-outline-variant/35 text-on-surface-variant' : 'border-outline text-on-surface-variant'}`}
                        >
                          <span className="material-symbols-outlined text-base">edit</span>
                          AMEND DRAFT RULING
                        </button>
                      </>
                    )}
                  </div>
                </div>

              </div>
            </section>

          </main>
        )}

        {/* VIEW 2: REGULATIONS READER */}
        {activeView === 'regulations' && <RegulationsView />}

        {/* VIEW 3: LIVE PERSISTENCE DECISION ARCHIVE */}
        {activeView === 'archive' && <ArchiveView />}

        {/* VIEW 4: PDF INGESTION PIPELINE COCKPIT */}
        {activeView === 'ingest' && <IngestView />}

        {/* VIEW 5: SETTINGS CONTROL PLANE VIEW */}
        {activeView === 'settings' && <SettingsPage />}

        {/* VIEW 6: STEWARD PROFILE VIEW */}
        {activeView === 'profile' && user && (
          <ProfilePage user={user} onLogout={handleLogout} />
        )}

      </div>

      {/* Atmospheric Radial Grid Background */}
      <div className="fixed inset-0 pointer-events-none z-[-1] opacity-5 overflow-hidden">
        <div className="absolute w-[200%] h-[200%] top-[-50%] left-[-50%] bg-[radial-gradient(circle_at_center,#39ff14_0%,transparent_15%)] opacity-30 blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(39,39,42,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(39,39,42,0.1)_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      </div>

    </div>
  );
}

function cleanRuleIdForMatching(id) {
  if (!id) return '';
  let clean = id.toUpperCase()
    .replace(/^(?:F1|MOTOGP|WEC)[_\s]*/i, '')
    .replace(/^(?:ARTICLES?|APPENDIX|APPENDICES)[_\s]*/i, '')
    .replace(/[^A-Z0-9]/g, '.');
  clean = clean.replace(/[\.+]+/g, '.').replace(/^\.|\.$/g, '');
  return clean;
}

function extractRuleIdsFromText(text) {
  if (!text) return [];
  const citationSectionRegex = /(?:CITATION|Rule Citation)[\s\S]*?(?:PROPOSED ADJUDICATION|$)/i;
  const sectionMatch = text.match(citationSectionRegex);
  const searchArea = sectionMatch ? sectionMatch[0] : text;

  const matches = [];
  
  // 1. Matches like F1_ARTICLE_7_2, WEC_ARTICLE_9_1_11, F1_APPENDIX_B, etc.
  const regex1 = /(?:F1|MOTOGP|WEC)_(?:ARTICLE|APPENDIX|APPENDICES)_[A-Z0-9_]+/gi;
  let match;
  while ((match = regex1.exec(searchArea)) !== null) {
    matches.push(match[0].toUpperCase());
  }

  // 2. Matches like "Article 12.2.2" or "Appendix B" or "Articles 9.1.11"
  const regex2 = /(?:F1|MOTOGP|WEC)?\s*(?:Articles?|Appendix|Appendices)\s+[A-Z0-9_]+(?:\.[A-Z0-9_]+)*/gi;
  while ((match = regex2.exec(searchArea)) !== null) {
    matches.push(match[0].toUpperCase());
  }

  // Deduplicate matches while preserving order
  const uniqueMatches = [];
  const seen = new Set();
  matches.forEach(m => {
    if (!seen.has(m)) {
      seen.add(m);
      uniqueMatches.push(m);
    }
  });

  return uniqueMatches;
}

export default App;
