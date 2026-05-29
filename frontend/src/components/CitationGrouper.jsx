/**
 * CitationGrouper — Hierarchical Citation Grouping Utility
 * 
 * Processes flat citation arrays from the investigation API into
 * hierarchically grouped structures for legal-document-style rendering.
 * Strips redundant database prefixes and formats rule coordinates cleanly.
 */

/**
 * Strips the series database prefix from a rule ID.
 * e.g. "F1_ARTICLE_7_2" → "ARTICLE_7_2"
 *      "MOTOGP_ARTICLE_1_25_1" → "ARTICLE_1_25_1"
 *      "WEC_APPENDIX_4" → "APPENDIX_4"
 */
function stripSeriesPrefix(ruleId, seriesId) {
  const prefix = `${seriesId.toUpperCase()}_`;
  if (ruleId.toUpperCase().startsWith(prefix)) {
    return ruleId.slice(prefix.length);
  }
  return ruleId;
}

/**
 * Converts a cleaned DB key back to a human-readable rule coordinate.
 * e.g. "ARTICLE_7_2"      → "Article 7.2"
 *      "ARTICLE_33_3"     → "Article 33.3"
 *      "APPENDIX_B"       → "Appendix B"
 *      "APPENDIX_L_4_5"   → "§L4.5"
 */
function formatCleanId(cleanId) {
  if (/^ARTICLE_/i.test(cleanId)) {
    const nums = cleanId.replace(/^ARTICLE_/i, '');
    return `Article ${nums.replace(/_/g, '.')}`;
  }
  if (/^APPENDIX_/i.test(cleanId)) {
    const rest = cleanId.replace(/^APPENDIX_/i, '');
    const parts = rest.split('_');
    const letter = parts[0];
    const nums = parts.slice(1).join('.');
    return nums ? `§${letter}${nums}` : `Appendix ${letter}`;
  }
  // Fallback: convert underscores to spaces, title-case
  return cleanId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Derives a descriptive group label for an appendix letter
 * by inspecting the titles of its member clauses.
 */
function deriveAppendixLabel(letter, clauses) {
  // Check if any clause title contains a recognizable appendix descriptor
  for (const clause of clauses) {
    const title = (clause.title || '').toLowerCase();
    if (title.includes('conduct'))    return `Appendix ${letter}: Code of Conduct`;
    if (title.includes('safety'))     return `Appendix ${letter}: Safety Protocol`;
    if (title.includes('technical'))  return `Appendix ${letter}: Technical Regulations`;
    if (title.includes('driving'))    return `Appendix ${letter}: Driving Standards`;
    if (title.includes('signal'))     return `Appendix ${letter}: Signals & Flags`;
    if (title.includes('pit'))        return `Appendix ${letter}: Pit Lane Protocol`;
    if (title.includes('steward'))    return `Appendix ${letter}: Stewarding Procedures`;
    if (title.includes('scrutineer')) return `Appendix ${letter}: Scrutineering`;
  }
  return `Appendix ${letter}`;
}

/**
 * Main grouping function.
 * Processes a flat array of citation clauses into hierarchically
 * grouped categories, stripped of database noise.
 *
 * @param {Array} clauses - Array of clause objects with rule_id/_id, title, raw_text
 * @param {string} seriesId - Active championship series (F1, MOTOGP, WEC)
 * @returns {Array} Sorted array of group objects: { key, label, icon, clauses[] }
 */
export function groupCitations(clauses, seriesId) {
  if (!clauses || clauses.length === 0) return [];

  const groupsMap = {};

  clauses.forEach((clause, idx) => {
    const rawId = clause.rule_id || clause._id || '';
    const cleanId = stripSeriesPrefix(rawId, seriesId);

    let groupKey, groupIcon;

    if (/^APPENDIX_/i.test(cleanId)) {
      // Extract appendix letter for sub-grouping
      const letterMatch = cleanId.match(/^APPENDIX_([A-Z0-9]+)/i);
      const letter = letterMatch ? letterMatch[1].toUpperCase() : '?';
      groupKey = `APPENDIX_${letter}`;
      groupIcon = 'description';
    } else if (/^ARTICLE_/i.test(cleanId)) {
      groupKey = 'ARTICLES';
      groupIcon = 'gavel';
    } else {
      groupKey = 'OTHER';
      groupIcon = 'library_books';
    }

    if (!groupsMap[groupKey]) {
      groupsMap[groupKey] = {
        key: groupKey,
        label: '', // Will be set after all clauses are assigned
        icon: groupIcon,
        clauses: [],
        bestRank: idx,
      };
    }

    groupsMap[groupKey].clauses.push({
      ...clause,
      displayId: formatCleanId(cleanId),
      originalId: rawId,
      matchRank: idx,
    });

    // Track the highest-ranked (lowest index) clause in this group
    if (idx < groupsMap[groupKey].bestRank) {
      groupsMap[groupKey].bestRank = idx;
    }
  });

  // Assign descriptive labels after all clauses are grouped
  Object.values(groupsMap).forEach((group) => {
    if (group.key === 'ARTICLES') {
      group.label = 'Core Sporting Regulations';
    } else if (group.key === 'OTHER') {
      group.label = 'Additional References';
    } else if (group.key.startsWith('APPENDIX_')) {
      const letter = group.key.replace('APPENDIX_', '');
      group.label = deriveAppendixLabel(letter, group.clauses);
    }
  });

  // Sort: group containing the primary match (rank 0) first, then by best rank
  return Object.values(groupsMap).sort((a, b) => a.bestRank - b.bestRank);
}
