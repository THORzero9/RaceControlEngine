import os
import sys
import asyncio
import subprocess

# Ensure project root is in the Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.database import db_manager

PDF_PATH = "/home/bhaswat/projects/RaceControlEngine/backend/data/2026 WEC Sporting Regulations – Clean.pdf"

def run_ingest_cli():
    print(f"📖 Running backend/ingest_pdf.py on: '{PDF_PATH}'...")
    cmd = [
        "python", 
        "backend/ingest_pdf.py", 
        "--pdf", PDF_PATH, 
        "--series", "WEC"
    ]
    env = os.environ.copy()
    env["PYTHONPATH"] = "/home/bhaswat/projects/RaceControlEngine"
    
    result = subprocess.run(cmd, cwd="/home/bhaswat/projects/RaceControlEngine", capture_output=True, text=True, env=env)
    print("CLI STDOUT:")
    print(result.stdout)
    if result.stderr:
        print("CLI STDERR:")
        print(result.stderr)
        
    if result.returncode != 0:
        print(f"❌ Ingestion CLI failed with exit code: {result.returncode}")
        sys.exit(1)
    else:
        print("✅ CLI Ingestion finished successfully.")

async def verify_database():
    await db_manager.connect_to_database()
    print("\n🔍 Querying sporting_codes collection for WEC rules...")
    
    cursor = db_manager.sporting_codes.find({"series_id": "WEC"})
    rules = []
    async for doc in cursor:
        rules.append(doc)
        
    print(f"Found {len(rules)} WEC rules in database.")
    
    if len(rules) == 0:
        print("❌ DATABASE SYNC ERROR: No WEC rules found in collection.")
        sys.exit(1)
        
    # Sample a few rules to inspect
    print("\n--- SAMPLE RULES VERIFICATION ---")
    for r in rules[:5]:
        print(f"ID: {r['_id']}")
        print(f"Title: {r['title']}")
        print(f"Chapter/Article: Ch={r.get('chapter')}, Art={r.get('article')}")
        print(f"Tags: {r['search_tags']}")
        print(f"Text Preview:\n{r['raw_text'][:300]}")
        print("-" * 50)
        
        # Verify markdown structure presence
        if not r['raw_text'].startswith("### ") or "**" not in r['raw_text']:
            print("❌ FORMATTING ERROR: Rule text does not follow structural markdown layout.")
            sys.exit(1)
            
        # Verify English contents (must contain English words and not French)
        content_lower = r['raw_text'].lower()
        french_words = ["le", "la", "les", "pour", "piste", "concurrent", "pilotes"]
        french_matches = [w for w in french_words if f" {w} " in content_lower]
        if len(french_matches) > 3:
            print(f"❌ BILINGUAL ERROR: French text detected inside English rule blocks: {french_matches}")
            sys.exit(1)
            
    print("✅ DATABASE SYNC VERIFIED: All rules successfully parsed in clean English Markdown format.")
    await db_manager.close_database_connection()

def main():
    if not os.path.exists(PDF_PATH):
        print(f"❌ Error: {PDF_PATH} does not exist. Copy the PDF first.")
        sys.exit(1)
    run_ingest_cli()
    asyncio.run(verify_database())

if __name__ == "__main__":
    main()
