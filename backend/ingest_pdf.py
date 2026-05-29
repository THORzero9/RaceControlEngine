import os
import sys
import re
import argparse
import asyncio
from typing import List, Optional
import pdfplumber
from pydantic import BaseModel, Field

# Ensure project root is in the Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.database import db_manager

# --- 1. PYDANTIC SCHEMAS FOR IMPORT VALIDATION ---
class PDFRuleSchema(BaseModel):
    series: str = Field(..., description="Championship series code (e.g. F1, MOTOGP, WEC)")
    rule_code: str = Field(..., description="Extracted coordinate code of the rule (e.g. Article 33.3, Appendix L)")
    title: str = Field(..., description="Clean parsed title of the rule")
    raw_text: str = Field(..., description="Raw text block associated with this regulation")
    search_tags: List[str] = Field(default_factory=list, description="Keywords for indexing search queries")

# --- 1B. BILINGUAL FRENCH FILTER & CLEANUP UTILITIES ---
def is_french_line(line: str) -> bool:
    words = [w.strip().lower() for w in re.split(r'\W+', line) if w.strip()]
    if not words:
        return False
    french_identifiers = {
        "le", "la", "les", "un", "une", "des", "du", "de", "et", "en", "dans", "par", "pour", "avec",
        "qui", "que", "est", "sont", "ont", "ce", "cette", "ces", "se", "sa", "son", "ses", "leur",
        "leurs", "mais", "ou", "donc", "or", "ni", "car", "ne", "pas", "plus", "tout", "tous",
        "toute", "toutes", "comme", "si", "lorsque", "puisque", "quand", "pilote", "pilotes",
        "voiture", "voitures", "piste", "course", "pénalité", "pénalités", "steward", "stewards",
        "décision", "décisions", "signal", "signaux", "drapeau", "drapeaux", "temps", "tour", "tours",
        "règlement", "règlements", "sportif", "sportifs", "préambule", "annexe", "annexes", "clause",
        "dispositions", "générales", "générale", "sélection", "comité", "engagements", "engagement", 
        "partie", "concurrent", "concurrents", "infraction", "infractions", "sanction", "sanctions",
        "interprétative", "interprétation", "chaque", "édition", "éditions", "compétition", "compétitions",
        "championnat", "championnats", "aux", "sous", "sur"
    }
    english_identifiers = {
        "the", "of", "and", "to", "a", "in", "is", "that", "it", "for", "on", "are", "as", "with",
        "driver", "drivers", "car", "cars", "track", "race", "penalty", "penalties", "steward",
        "stewards", "decision", "decisions", "signal", "signals", "flag", "flags", "time", "lap", "laps",
        "regulations", "sporting", "foreword", "appendix", "appendixes", "clause", "provisions", "general",
        "selection", "committee", "entries", "entry", "part", "competitor", "competitors", "infringement",
        "infringements", "sanction", "sanctions", "interpretive", "interpretation", "each", "edition", "editions",
        "competition", "competitions", "championship", "championships"
    }
    english_must_keep = {
        "the", "driver", "drivers", "car", "cars", "steward", "stewards", "shall", "must", "will", "penalty", 
        "penalties", "lap", "laps", "race", "championship", "stewarding", "incident", "competitor", "competitors"
    }
    
    if any(w in english_must_keep for w in words):
        return False
        
    french_score = sum(1 for w in words if w in french_identifiers)
    english_score = sum(1 for w in words if w in english_identifiers)
    return french_score > english_score

def reconstruct_page_text(page) -> str:
    from collections import defaultdict
    words = page.extract_words()
    if not words:
        return ""
        
    lines_dict = defaultdict(list)
    for word in words:
        top_group = round(word['top'] / 3) * 3
        lines_dict[top_group].append(word)
        
    left_lines = []
    right_lines = []
    
    for top in sorted(lines_dict.keys()):
        line_words = sorted(lines_dict[top], key=lambda w: w['x0'])
        
        split_idx = -1
        for idx in range(len(line_words) - 1):
            gap = line_words[idx+1]['x0'] - line_words[idx]['x1']
            if gap >= 15:
                split_idx = idx
                break
                
        if split_idx != -1:
            left_text = " ".join([w['text'] for w in line_words[:split_idx+1]])
            right_text = " ".join([w['text'] for w in line_words[split_idx+1:]])
            left_lines.append(left_text)
            right_lines.append(right_text)
        else:
            line_str = " ".join([w['text'] for w in line_words])
            avg_x0 = sum(w['x0'] for w in line_words) / len(line_words)
            if avg_x0 >= 235:
                right_lines.append(line_str)
            elif avg_x0 < 220:
                left_lines.append(line_str)
            else:
                if is_french_line(line_str):
                    left_lines.append(line_str)
                else:
                    right_lines.append(line_str)
                    
    return "\n".join(left_lines) + "\n\n" + "\n".join(right_lines)

def clean_bilingual_line(line: str) -> str:
    if "/" in line:
        parts = line.split("/")
        if len(parts) == 2:
            first, second = parts[0].strip(), parts[1].strip()
            if is_french_line(first) or not is_french_line(second):
                return second
    return line

def clean_headers_footers(line: str) -> bool:
    HEADER_FOOTER_PATTERNS = [
        # WEC bilingual headers
        r"^[Rr]èglement\s+[Ss]portif\s+du\s+[Cc]hampionship\s+du\s+[Mm]onde.*$",
        r"^[Rr]èglement\s+[Ss]portif\s+du\s+[Cc]hampionnat\s+du\s+[Mm]onde.*$",
        r"^[Ss]porting\s+[Rr]egulations\s+of\s+the\s+fia\s+world.*$",
        r"^Publié le/published on:.*$",
        r"^DE LA FIA.*$",
        r"^WORLD ENDURANCE CHAMPIONSHIP.*$",
        r"^CHAMPIONNAT DU MONDE.*$",
        # FIM MotoGP headers, footers, and title page noise
        r"^FIM Grand Prix World Championship Regulations$",
        r"^\d+\s+update\s+\d+\s+[A-Za-z]+\s+\d{4}$",
        r"^FEDERATION INTERNATIONALE DE MOTOCYCLISME.*$",
        r"^FIM GRAND PRIX$",
        r"^WORLD CHAMPIONSHIP$",
        r"^REGULATIONS$",
        r"^EDITION\s+\d{4}$",
        r"^update\s+\d+\s+[A-Za-z]+\s+\d{4}$",
    ]
    for pattern in HEADER_FOOTER_PATTERNS:
        if re.search(pattern, line, re.IGNORECASE):
            return True
    # Only drop pure integers (page numbers) or pure dots/spaces.
    # Keep multi-part numbers like "1.1.1" or "3.2.1.1" as they are section headings.
    if re.match(r'^\s*\d+\s*$', line) or re.match(r'^\s*\.+\s*$', line):
        return True
    return False

# --- 2. AUTOMATIC TAG GENERATOR ---
def generate_search_tags(title: str, text: str, rule_code: str = "") -> List[str]:
    content = f"{title} {text}".lower()
    is_appendix = "appendix" in rule_code.lower() or "appendix" in title.lower()
    
    keyword_mapping = {
        "contact": ["contact", "collision", "hit", "collide", "struck", "impact"],
        "track limits": ["track limits", "off track", "left the track", "run wide", "track edge"],
        "overtake": ["overtake", "overtaking", "pass", "passing", "inside pass", "outside pass", "lapping"],
        "unsafe": ["unsafe", "dangerous", "reckless", "aggressive", "irresponsible"],
        "penalty": ["penalty", "penalize", "sanction", "infraction", "violation"],
        "speed": ["speed", "braking", "late braking", "acceleration", "deceleration"],
        "position": ["position", "forced off", "squeezed", "pushed", "blocked", "impeded", "weaving", "defending"],
    }
    
    tags = set()
    for tag_name, keywords in keyword_mapping.items():
        # Exclude sporting tags from appendices to prevent keyword collision
        if is_appendix and tag_name in ["contact", "overtake", "track limits"]:
            continue
            
        # Refine physical contact keyword check to skip administrative email/phone contact details
        if tag_name == "contact":
            has_contact = False
            for kw in keywords:
                if kw in content:
                    if kw == "contact":
                        admin_contexts = [
                            "contact the", "contact michelin", "contact goodyear", 
                            "contact fia", "contact details", "contacts", "contact info",
                            "contact person", "contact us"
                        ]
                        if any(ac in content for ac in admin_contexts):
                            # Check if it also has other collision words, otherwise skip
                            other_kws = ["collision", "hit", "collide", "struck", "impact"]
                            if not any(okw in content for okw in other_kws):
                                continue
                    has_contact = True
                    break
            if has_contact:
                tags.add(tag_name.split()[0])
            continue
            
        if any(kw in content for kw in keywords):
            tags.add(tag_name.split()[0])  # store first word of tag or full tag
    return list(tags)

# --- 3. CORE REGEX CHUNKING ENGINE ---
def parse_pdf_text(text: str, series_id: str) -> List[PDFRuleSchema]:
    is_motogp = (series_id.upper() == "MOTOGP")
    if is_motogp:
        # For MotoGP, match subsection coordinates like 1.25, 1.25.1 or Appendix A/1 at line starts.
        # Ensure it is followed by a space and letter or end of line (to avoid matching inline references).
        boundary_pattern = r"(?mi)^\s*(Appendix\s+[a-zA-Z0-9]+|\d+\.\d+(?:\.\d+)*)(?:\s+[a-zA-Z]|\s*$)"
    else:
        # Match boundaries like "Article 33.3", "Appendix L/4/5", or section digits like "4.1.1"
        boundary_pattern = r"(?mi)^\s*(Article\s+\d+(?:\.\d+)*[a-zA-Z]?|Appendix\s+[a-zA-Z0-9]+|\d+\.\d+(?:\.\d+)*[a-zA-Z]?)\b"
    
    matches = list(re.finditer(boundary_pattern, text))
    
    parsed_rules = []
    
    if not matches:
        print("⚠️ WARNING: No rule boundaries matched using standard pattern. Checking line-by-line fallback...")
        # Fallback check: find occurrences anywhere if not start of line
        matches = list(re.finditer(r"(?i)\b(Article\s+\d+(?:\.\d+)*[a-zA-Z]?|Appendix\s+[a-zA-Z])\b", text))
        if not matches:
            return parsed_rules

    for i, match in enumerate(matches):
        start_idx = match.start()
        end_idx = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        
        block = text[start_idx:end_idx].strip()
        
        # If the entire block is French, drop it!
        if is_french_line(block):
            continue
            
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        if not lines:
            continue
            
        first_line = lines[0]
        
        # Isolate coordinate and title
        if is_motogp:
            coord_match = re.match(r"(?i)^\s*(Appendix\s+[a-zA-Z0-9]+|\d+\.\d+(?:\.\d+)*)", first_line)
        else:
            coord_match = re.match(r"(?i)^\s*(Article\s+\d+(?:\.\d+)*[a-zA-Z]?|Appendix\s+[a-zA-Z]|\d+\.\d+(?:\.\d+)*[a-zA-Z]?)", first_line)
        if coord_match:
            rule_code = coord_match.group(1).strip()
            title_part = first_line[coord_match.end():].strip(" -:").strip()
        else:
            rule_code = match.group(1).strip()
            title_part = ""
            
        # Strip TOC dot-leader sequences and trailing page numbers from titles
        # e.g. "Introduction .......................................................................... 5" -> "Introduction"
        title_part = re.sub(r'\s*\.{3,}\s*\d*\s*$', '', title_part).strip()
            
        # Skip if the title part itself is French
        if title_part and is_french_line(title_part):
            continue
            
        # Normalize rule code naming
        if re.match(r'^\d', rule_code):
            formatted_code = f"Article {rule_code}"
        else:
            formatted_code = rule_code.capitalize()
            
        if not title_part:
            title_part = f"Sporting Regulation {formatted_code}"
            
        if len(title_part) > 100:
            title_part = title_part[:97] + "..."
            
        # Paragraph grouping & raw layout line-breaks cleanup
        body_lines = lines[1:] if len(lines) > 1 else []
        paragraphs = []
        current_p = []
        
        for line in body_lines:
            is_list_item = re.match(r'^\s*([a-zA-Z\d]+[\.\)]|[\-\*•o])\s+', line)
            is_new_paragraph = False
            if not current_p:
                is_new_paragraph = True
            elif is_list_item:
                is_new_paragraph = True
            elif current_p[-1].endswith(('.', ':', ';', '!')):
                if re.match(r'^[A-Z]', line):
                    is_new_paragraph = True
                    
            if is_new_paragraph:
                if current_p:
                    paragraphs.append(" ".join(current_p))
                current_p = [line]
            else:
                current_p.append(line)
                
        if current_p:
            paragraphs.append(" ".join(current_p))
            
        md_blocks = []
        for p in paragraphs:
            p = p.strip()
            if not p:
                continue
            # Drop the paragraph if it scores highly for French identifiers
            if is_french_line(p):
                continue
            p_clean = re.sub(r'\s+', ' ', p).strip()
            list_match = re.match(r'^\s*([a-zA-Z\d]+[\.\)]|[\-\*•o])\s*(.*)', p_clean)
            if list_match:
                bullet = list_match.group(1)
                content = list_match.group(2)
                md_blocks.append(f"- {content}")
            else:
                md_blocks.append(p_clean)
                
        # Prepend proper markdown tracking characters
        raw_text_md = f"### {formatted_code}\n\n**{title_part}**\n\n" + "\n\n".join(md_blocks)
        
        tags = generate_search_tags(title_part, raw_text_md, formatted_code)
        rule_obj = PDFRuleSchema(
            series=series_id.upper(),
            rule_code=formatted_code,
            title=title_part,
            raw_text=raw_text_md,
            search_tags=tags
        )
        parsed_rules.append(rule_obj)
        
    return parsed_rules

# --- 4. ASYNC DB SYNCHRONIZER ---
async def sync_rules_to_db(rules: List[PDFRuleSchema], series_id: str):
    is_standalone = db_manager.client is None or db_manager.db is None
    if is_standalone:
        await db_manager.connect_to_database()
    
    # Strictly target wipe for the specified series flag
    series_key = series_id.upper()
    print(f"🗑️ Wiping existing rules in collection matching series_id: '{series_key}'...")
    delete_result = await db_manager.sporting_codes.delete_many({"series_id": series_key})
    print(f" Wiped {delete_result.deleted_count} rules from sporting_codes.")
    
    # Map Pydantic schema to MongoDB format, merging duplicates
    documents_dict = {}
    for rule in rules:
        # Create a unique database _id prefixed with the series to prevent collisions
        clean_code = re.sub(r'[^a-zA-Z0-9]', '_', rule.rule_code.upper()).strip('_')
        clean_code = re.sub(r'_+', '_', clean_code)
        db_id = f"{series_key}_{clean_code}"
        
        # Parse chapter/article coordinates from the rule_code
        chapter = None
        article = None
        
        art_match = re.search(r'(?i)Article\s+([\d\.]+)', rule.rule_code)
        if art_match:
            article = art_match.group(1)
        else:
            app_match = re.search(r'(?i)Appendix\s+([a-zA-Z]+)', rule.rule_code)
            if app_match:
                chapter = app_match.group(1)
                
        doc = {
            "_id": db_id,
            "series_id": series_key,
            "chapter": chapter,
            "article": article,
            "title": rule.title,
            "raw_text": rule.raw_text,
            "search_tags": rule.search_tags
        }
        
        if db_id in documents_dict:
            # Merge duplicates while stripping duplicate header blocks
            existing = documents_dict[db_id]
            clean_duplicate_text = re.sub(r'^### [^\n]+\n\n(\*\*[^\n]+\*\*\n\n)?', '', rule.raw_text).strip()
            if clean_duplicate_text:
                existing["raw_text"] += "\n\n" + clean_duplicate_text
            existing["search_tags"] = list(set(existing["search_tags"] + rule.search_tags))
        else:
            documents_dict[db_id] = doc
            
    documents = list(documents_dict.values())
        
    if documents:
        print(f"📥 Batch inserting {len(documents)} new rules into sporting_codes...")
        insert_result = await db_manager.sporting_codes.insert_many(documents)
        print(f" SUCCESS: Ingested {len(insert_result.inserted_ids)} rules from PDF")
    else:
        print("⚠️ No valid rules to insert.")
        
    if is_standalone:
        await db_manager.close_database_connection()

# --- 5. SHARED PDF TEXT EXTRACTION WITH SERIES-SPECIFIC FILTERS ---
def extract_pdf_text_with_filters(pdf_source, series_id: str) -> str:
    """
    Opens a PDF from a file path (str) or file-like object (BytesIO),
    applies series-specific page whitelists, French column separation,
    header/footer cleanup, TOC skipping, and admin page rejection.
    
    Returns the cleaned, concatenated text ready for parse_pdf_text().
    """
    is_wec = (series_id.upper() == "WEC")
    is_motogp = (series_id.upper() == "MOTOGP")
    extracted_text = ""
    
    with pdfplumber.open(pdf_source) as pdf:
        print(f" Pages found: {len(pdf.pages)}")
        for i, page in enumerate(pdf.pages):
            page_num = i + 1
            
            # MotoGP Sporting whitelisting: Chapter 1 is physical pages 10-89
            if is_motogp:
                if not (10 <= page_num <= 89):
                    print(f"🚫 Skipping MotoGP page {page_num} (outside Chapter 1 Sporting Regulations range [10, 89]).")
                    continue
            
            # WEC Sporting whitelisting: Articles 1-17 + Appendix 1 (1-61), and Sporting Appendices 4-9 (70-85)
            if is_wec:
                if not (1 <= page_num <= 61 or 70 <= page_num <= 85):
                    print(f"🚫 Skipping WEC page {page_num} (outside core sporting rules and sporting appendices).")
                    continue

            page_text = page.extract_text()
            
            # Check for WEC-specific page rejection
            if is_wec and page_text:
                text_lower = page_text.lower()
                if (
                    "registrations.fia.com/wec" in text_lower or
                    "boulogne-billancourt" in text_lower or
                    ("iban" in text_lower and "bic" in text_lower)
                ):
                    print(f"🚫 Rejecting WEC administrative/financial page {i+1} due to metadata/financial strings.")
                    continue
                    
            # Skip Table of Contents / Index pages for all series to prevent TOC section header noise
            if page_text:
                text_lower = page_text.lower()
                if "table des matières" in text_lower or "table of contents" in text_lower:
                    print(f"🚫 Skipping Table of Contents page {i+1}...")
                    continue

            if is_wec and page_text:
                # Separate side-by-side columns into left/right sequential blocks
                page_text = reconstruct_page_text(page)
            if page_text:
                # Strip French lines and header/footer noise
                lines = [line.strip() for line in page_text.split("\n") if line.strip()]
                cleaned_lines = []
                for line in lines:
                    line = clean_bilingual_line(line)
                    if is_french_line(line) or clean_headers_footers(line):
                        continue
                    # MotoGP-specific: drop footer timestamp lines embedded mid-text
                    if is_motogp and re.match(r'^\d+\s+update\s+\d+\s+[A-Za-z]+\s+\d{4}', line, re.IGNORECASE):
                        continue
                    cleaned_lines.append(line)
                extracted_text += "\n".join(cleaned_lines) + "\n"
                
    return extracted_text

# --- 6. STANDALONE CLI ENTRYPOINT ---
def main():
    parser = argparse.ArgumentParser(description="Ingest sporting regulations PDF directly into MongoDB.")
    parser.add_argument("--pdf", required=True, help="Path to local PDF file")
    parser.add_argument("--series", required=True, help="Target series code (e.g. F1, MOTOGP, WEC)")
    
    args = parser.parse_args()
    
    pdf_path = args.pdf
    series_id = args.series
    
    if not os.path.exists(pdf_path):
        print(f"❌ ERROR: Specified PDF file does not exist at: '{pdf_path}'")
        sys.exit(1)
        
    print(f"📖 Opening PDF: '{pdf_path}' using pdfplumber...")
    
    try:
        extracted_text = extract_pdf_text_with_filters(pdf_path, series_id)
    except Exception as e:
        print(f"❌ ERROR: Failed to read PDF file: {str(e)}")
        sys.exit(1)
        
    if not extracted_text.strip():
        print(f"❌ ERROR: No text could be extracted from the PDF file.")
        sys.exit(1)
        
    print(f"🔍 Analyzing extracted text (length: {len(extracted_text)} characters)...")
    rules = parse_pdf_text(extracted_text, series_id)
    
    print(f" Found {len(rules)} rule chunks.")
    if not rules:
        print("❌ ERROR: Failed to parse any rules from the document.")
        sys.exit(1)
        
    asyncio.run(sync_rules_to_db(rules, series_id))

if __name__ == "__main__":
    main()
