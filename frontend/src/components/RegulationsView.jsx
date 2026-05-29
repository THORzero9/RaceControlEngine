import { useState, useEffect, useRef } from 'react';
import { formatRuleText } from './RuleFormatter';

function RuleCard({ rule, onSelectRule }) {
  const [isLong, setIsLong] = useState(false);
  const contentRef = useRef(null);

  useEffect(() => {
    if (contentRef.current) {
      // Check if content height exceeds 250px
      if (contentRef.current.scrollHeight > 250) {
        setIsLong(true);
      }
    }
  }, [rule.raw_text]);

  return (
    <div className="border border-outline-variant bg-surface-container-low hover:border-primary-container/60 hover:bg-surface-container-high/40 transition-all p-md flex flex-col gap-sm relative group">
      
      {/* Header bar of the rule card */}
      <div className="flex justify-between items-start gap-md border-b border-outline-variant/30 pb-xs">
        <div className="flex flex-col">
          <span className="text-[10px] font-label-caps text-secondary-container font-bold tracking-widest uppercase">
            {rule.series_id} RULEBOOK • CHAPTER {rule.chapter || 'N/A'} • ARTICLE {rule.article || 'N/A'}
          </span>
          <h4 className="font-display-mono text-base text-primary-container uppercase mt-micro group-hover:text-primary-container transition-colors">
            {rule.title}
          </h4>
        </div>
        <span className="font-data-xs text-[10px] px-sm py-micro bg-black border border-outline-variant text-on-surface-variant select-all uppercase">
          {rule._id}
        </span>
      </div>

      {/* Rule Body Text with height constraints */}
      <div 
        ref={contentRef}
        className={`relative ${isLong ? 'max-h-[250px] overflow-hidden' : ''}`}
      >
        <div className="text-[13px] font-sans text-on-surface leading-relaxed">
          {formatRuleText(rule.raw_text)}
        </div>
        {isLong && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-surface-container-low to-transparent pointer-events-none" />
        )}
      </div>

      {/* Crisp trigger button if height threshold is triggered */}
      {isLong && (
        <div className="flex justify-center mt-xs">
          <button
            onClick={() => onSelectRule(rule)}
            className="px-md py-xs bg-surface-container-high hover:bg-primary-container hover:text-on-primary text-primary-container border border-outline-variant hover:border-primary-container text-xs font-label-caps font-bold transition-all flex items-center gap-xs rounded-sm shadow-sm"
          >
            <span className="material-symbols-outlined text-[14px]">visibility</span>
            View Detailed Rule
          </button>
        </div>
      )}

      {/* Search Tags / Metadata Footer */}
      {rule.search_tags && rule.search_tags.length > 0 && (
        <div className="flex flex-wrap gap-xs mt-xs pt-xs border-t border-outline-variant/10">
          {rule.search_tags.map((tag) => (
            <span
              key={tag}
              className="text-[9px] font-label-caps px-sm py-micro bg-surface-dim border border-outline-variant/50 text-on-surface-variant rounded-full"
            >
              #{tag.toUpperCase()}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RegulationsView() {
  const [regulations, setRegulations] = useState([]);
  const [filteredRegulations, setFilteredRegulations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeries, setSelectedSeries] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRule, setSelectedRule] = useState(null);

  useEffect(() => {
    const fetchRegulations = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/v1/regulations');
        if (response.ok) {
          const data = await response.json();
          setRegulations(data);
          setFilteredRegulations(data);
        } else {
          setError('Failed to retrieve sporting regulations from the server.');
        }
      } catch (err) {
        setError('Network interruption: Unable to establish connection to the database.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchRegulations();
  }, []);

  useEffect(() => {
    let result = regulations;
    if (selectedSeries !== 'ALL') {
      result = result.filter(rule => rule.series_id.toUpperCase() === selectedSeries.toUpperCase());
    }
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      result = result.filter(rule => 
        rule.title.toLowerCase().includes(query) ||
        rule.raw_text.toLowerCase().includes(query) ||
        rule.chapter?.toLowerCase().includes(query) ||
        rule.article?.toLowerCase().includes(query) ||
        (rule.search_tags && rule.search_tags.some(tag => tag.toLowerCase().includes(query)))
      );
    }
    setFilteredRegulations(result);
  }, [searchQuery, selectedSeries, regulations]);

  return (
    <main className="flex-1 flex p-gutter gap-gutter bg-background overflow-hidden w-full animate-fadeIn">
      <div className="flex-1 bg-surface-container border border-outline-variant flex flex-col h-full overflow-hidden">
        
        {/* Sub Bar */}
        <div className="bg-surface-container-low p-sm flex items-center justify-between border-b border-outline-variant flex-none">
          <span className="font-label-caps text-[11px] font-bold text-on-surface-variant tracking-widest">SPORTING REGULATIONS ENGINE</span>
          <span className="font-data-xs text-[10px] text-primary-container">OFFICIAL RULEBOOKS</span>
        </div>

        {/* Search & Filter Header */}
        <div className="p-md bg-surface-container-low border-b border-outline-variant flex flex-col md:flex-row gap-md items-center justify-between flex-none">
          <div className="relative w-full md:w-96">
            <span className="absolute left-sm top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant text-base">search</span>
            <input
              type="text"
              placeholder="SEARCH RULE COORDINATES, TITLE OR KEYWORDS..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-lg pr-sm py-sm bg-black border border-outline-variant focus:border-primary-container focus:outline-none text-xs font-data-md text-primary-container tracking-wider placeholder-on-surface-variant/40"
            />
          </div>

          <div className="flex gap-sm w-full md:w-auto">
            {['ALL', 'F1', 'MOTOGP', 'WEC'].map((series) => (
              <button
                key={series}
                onClick={() => setSelectedSeries(series)}
                className={`flex-1 md:flex-initial px-md py-sm text-xs font-label-caps font-bold transition-all border ${
                  selectedSeries === series
                    ? 'bg-primary-container text-on-primary border-primary-container'
                    : 'bg-transparent text-on-surface-variant border-outline-variant hover:bg-surface-container-high'
                }`}
              >
                {series}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Reader Layout */}
        <div className="flex-1 overflow-y-auto scrolling-terminal p-md flex flex-col gap-md">
          {isLoading ? (
            <div className="h-full flex items-center justify-center flex-col gap-sm text-secondary-container font-display-mono text-xs py-xl">
              <span className="animate-spin material-symbols-outlined text-[32px]">sync</span>
              RETRIEVING SPORTING CODES DATABASE...
            </div>
          ) : error ? (
            <div className="p-md border border-red-500/30 bg-red-500/5 text-red-400 text-xs font-data-md flex items-center gap-sm">
              <span className="material-symbols-outlined">error</span>
              {error}
            </div>
          ) : filteredRegulations.length === 0 ? (
            <div className="h-full flex flex-col justify-center items-center opacity-50 text-center gap-sm py-xl">
              <span className="material-symbols-outlined text-[48px] text-on-surface-variant/30">search_off</span>
              <div className="font-semibold text-[11px] uppercase tracking-wider text-on-surface-variant">No Matching Regulation Clauses Found</div>
              <div className="text-[11px] text-on-surface-variant max-w-[320px]">
                Try adjusting your search filters or typing different keywords.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-md">
              <div className="text-xs text-on-surface-variant uppercase tracking-wider font-label-caps mb-xs">
                Active sporting codes count: {filteredRegulations.length}
              </div>
              
              <div className="grid grid-cols-1 gap-md">
                {filteredRegulations.map((rule) => (
                  <RuleCard 
                    key={rule._id} 
                    rule={rule} 
                    onSelectRule={setSelectedRule} 
                  />
                ))}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Detailed Rule Modal Overlay */}
      {selectedRule && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-md z-50 animate-fadeIn">
          <div className="bg-surface-container border border-outline-variant flex flex-col w-full max-w-2xl max-h-[85vh] shadow-2xl rounded-sm overflow-hidden animate-scaleIn">
            
            {/* Modal Header */}
            <div className="bg-surface-container-low p-md border-b border-outline-variant flex items-center justify-between flex-none">
              <div className="flex flex-col">
                <span className="text-[10px] font-label-caps text-secondary-container font-bold tracking-widest uppercase">
                  {selectedRule.series_id} Sporting Regulations
                </span>
                <h4 className="font-display-mono text-sm text-primary-container uppercase mt-micro">
                  {selectedRule.title}
                </h4>
              </div>
              <button 
                onClick={() => setSelectedRule(null)}
                className="text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high p-sm rounded-sm transition-all flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto scrolling-terminal p-md font-sans text-sm text-on-surface leading-relaxed select-text">
              <div className="bg-surface-container-lowest p-md border border-outline-variant/40 rounded-sm">
                <div className="text-[10px] font-label-caps text-on-surface-variant mb-sm tracking-wider uppercase border-b border-outline-variant/20 pb-xs flex justify-between items-center">
                  <span>Coordinates: Ch {selectedRule.chapter || 'N/A'} • Art {selectedRule.article || 'N/A'}</span>
                  <span className="font-data-xs">{selectedRule._id}</span>
                </div>
                <div>
                  {formatRuleText(selectedRule.raw_text)}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-surface-container-low p-md border-t border-outline-variant flex justify-end flex-none">
              <button 
                onClick={() => setSelectedRule(null)}
                className="px-lg py-sm bg-primary-container text-on-primary font-label-caps text-xs font-bold hover:bg-primary-container/80 transition-all border border-primary-container"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default RegulationsView;
