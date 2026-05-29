import React from 'react';

/**
 * Global utility function to format sporting regulations typography.
 * Detects coordinate coordinates like Article 9.1.11 and styles list indents.
 */
export function formatRuleText(text) {
  if (!text) return null;

  // Split by line breaks
  const lines = text.split('\n');

  return lines.map((line, index) => {
    let cleanLine = line.trim();
    if (!cleanLine) {
      return <div key={index} className="h-2" />;
    }

    // Detect if this line is a heading (markdown headers)
    const headingMatch = cleanLine.match(/^(#{1,6})\s*(.*)$/);
    let isHeading = false;
    let headingLevel = 0;
    if (headingMatch) {
      isHeading = true;
      headingLevel = headingMatch[1].length;
      cleanLine = headingMatch[2].trim();
    }

    // Detect if this line is bold markdown (e.g. **Applicable penalty**)
    const boldMatch = cleanLine.match(/^\*\*(.*)\*\*$/);
    let isBoldText = false;
    if (boldMatch) {
      isBoldText = true;
      cleanLine = boldMatch[1].trim();
    }

    // Detect alpha-numeric headers: e.g. Article 9.1.11, ARTICLE B1, Appendix 4, APPENDIX 5
    const headerRegex = /\b(Articles?|Appendices|Appendix)\s+[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*\b|\b\d+\.\d+(?:\.\d+)*\b/gi;
    
    // Parse lists and sub-lists
    const listMatch = cleanLine.match(/^([\-\*•])\s+(.*)$/) || cleanLine.match(/^([a-z\d]+[\.\)])\s+(.*)$/i);
    
    let indentClass = "";
    let listPrefix = "";
    let lineContent = cleanLine;
    let isSublist = false;

    if (listMatch) {
      listPrefix = listMatch[1];
      lineContent = listMatch[2];
      
      // Determine indent level based on prefix
      if (listPrefix.match(/^[a-z]\./i) || listPrefix.match(/^[ivxlcdm]+\./i)) {
        indentClass = "pl-6";
        isSublist = true;
      } else {
        indentClass = "pl-4";
      }

      // Check if item contains an nested sub-list coordinate (e.g. "- a. something")
      if (listPrefix === '-' || listPrefix === '*' || listPrefix === '•') {
        const sublistMatch = lineContent.match(/^([a-z\d]+[\.\)])\s+(.*)$/i);
        if (sublistMatch) {
          listPrefix = listPrefix + " " + sublistMatch[1];
          lineContent = sublistMatch[2];
          indentClass = "pl-8";
          isSublist = true;
        }
      }
    }

    // Wrap matched coordinates in bold, monospace high-vis neon green span blocks
    const parts = [];
    let lastIndex = 0;
    let match;

    headerRegex.lastIndex = 0;
    while ((match = headerRegex.exec(lineContent)) !== null) {
      const matchText = match[0];
      const matchIndex = match.index;

      if (matchIndex > lastIndex) {
        parts.push(lineContent.substring(lastIndex, matchIndex));
      }

      parts.push(
        <span 
          key={matchIndex} 
          className="font-display-mono font-bold text-primary-container bg-primary-container/15 border border-primary-container/30 px-sm py-[1px] mx-[2px] rounded text-[10.5px] uppercase tracking-wider inline-block shadow-[0_0_4px_rgba(57,255,20,0.15)]"
        >
          {matchText}
        </span>
      );

      lastIndex = headerRegex.lastIndex;
    }

    if (lastIndex < lineContent.length) {
      parts.push(lineContent.substring(lastIndex));
    }

    const contentElements = parts.length > 0 ? parts : lineContent;

    if (isHeading) {
      return (
        <div key={index} className="my-sm flex items-center">
          <span className="text-primary-container font-display-mono font-bold mr-xs">#</span>
          <span className="font-display-mono font-bold text-primary-container text-xs tracking-wide uppercase">
            {contentElements}
          </span>
        </div>
      );
    }

    if (isBoldText) {
      return (
        <div key={index} className="font-bold text-on-background/90 text-[12px] my-[2px]">
          {contentElements}
        </div>
      );
    }

    if (listPrefix) {
      return (
        <div key={index} className={`flex items-start ${indentClass} my-micro leading-relaxed text-[11px]`}>
          <span className="font-display-mono text-secondary-container font-semibold mr-sm select-none">
            {listPrefix}
          </span>
          <span className="text-on-surface-variant flex-1">
            {contentElements}
          </span>
        </div>
      );
    }

    return (
      <div key={index} className="leading-relaxed text-on-surface-variant text-[11.5px] my-micro">
        {contentElements}
      </div>
    );
  });
}
