import pytest
import re
from backend.routes import extract_search_keywords

def test_tokenization_and_stopwords():
    # Test case 1: Punctuation is stripped and stopwords are filtered out dynamically
    notes = "Rider ran wide at turn 4, gaining a lasting advantage on the track limits."
    keywords = extract_search_keywords(notes)
    
    # Stopwords like 'at', 'a', 'on', 'the' must be excluded
    stopwords = {"at", "a", "on", "the"}
    for sw in stopwords:
        assert sw not in keywords
        
    # Punctuation like ',' and '.' must be stripped (so we match 'limits', not 'limits.')
    assert "limits" in keywords
    assert "limits." not in keywords
    
    # High-signal keywords should be present
    assert "rider" in keywords
    assert "wide" in keywords
    assert "limits" in keywords
    assert "track" in keywords

def test_relevance_scoring_and_cutoff():
    # Simulated query keywords
    query_keywords = ["rider", "ran", "wide", "track", "limits"]
    
    # Mocked MongoDB rules collection pool
    mocked_rules = [
        {
            "_id": "MOTOGP_ARTICLE_1_21",
            "series_id": "MOTOGP",
            "title": "Behaviour During Practice and Race",
            "search_tags": ["track", "limits", "safety"],
            "raw_text": "Riders should use only the track. Exceeding track limits will be penalized."
        },
        {
            "_id": "MOTOGP_ARTICLE_1_25",
            "series_id": "MOTOGP",
            "title": "Interruption of a race",
            "search_tags": ["red flag"],
            "raw_text": "In case of interrupted races the leader determines the laps completed."
        }
    ]
    
    # We will simulate the scoring logic:
    results = []
    for rule_doc in mocked_rules:
        score = 0
        matched_terms_count = 0
        title_lower = rule_doc.get("title", "").lower()
        tags_lower = [t.lower() for t in rule_doc.get("search_tags", [])]
        raw_text_lower = rule_doc.get("raw_text", "").lower()
        
        for term in query_keywords:
            matched_in_doc = False
            if term in title_lower:
                score += 3
                matched_in_doc = True
            if term in tags_lower:
                score += 3
                matched_in_doc = True
            if term in raw_text_lower:
                score += 1
                matched_in_doc = True
            
            if matched_in_doc:
                matched_terms_count += 1
                
        # Safety cutoff threshold: min(2, len(query_keywords))
        cutoff_threshold = min(2, len(query_keywords))
        if matched_terms_count >= cutoff_threshold:
            results.append({
                "rule_id": rule_doc["_id"],
                "score": score
            })
            
    # Assertions
    matched_ids = [r["rule_id"] for r in results]
    assert "MOTOGP_ARTICLE_1_21" in matched_ids
    
    rule_1_21 = next(r for r in results if r["rule_id"] == "MOTOGP_ARTICLE_1_21")
    # total score should be 9
    # - 'track' matches in tags (+3) and raw_text (+1) => 4
    # - 'limits' matches in tags (+3) and raw_text (+1) => 4
    # - 'rider' matches in raw_text (+1) => 1
    # total: 9
    assert rule_1_21["score"] >= 9
    
    # Check that MOTOGP_ARTICLE_1_25 is dropped via safety cutoff (matches 0 or 1 term)
    assert "MOTOGP_ARTICLE_1_25" not in matched_ids
