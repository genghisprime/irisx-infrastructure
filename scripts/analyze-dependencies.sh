#!/bin/bash

# Week 28 Phase 1: Dependency Analysis Script
# Analyzes all 92 JavaScript files to find missing imports and dependencies

echo "=========================================="
echo "IRISX Dependency Analysis"
echo "Week 28 Phase 1: Dependency Discovery"
echo "=========================================="
echo ""

OUTPUT_DIR="/tmp/irisx-dependency-analysis"
mkdir -p "$OUTPUT_DIR"

SRC_DIR="/Users/gamer/Documents/GitHub/IRISX/api/src"
ALL_IMPORTS="$OUTPUT_DIR/all-imports.txt"
MISSING_FILES="$OUTPUT_DIR/missing-files.txt"
ENV_VARS="$OUTPUT_DIR/env-variables.txt"
REPORT="$OUTPUT_DIR/dependency-report.md"

# Clear previous results
> "$ALL_IMPORTS"
> "$MISSING_FILES"
> "$ENV_VARS"
> "$REPORT"

echo "## IRISX Dependency Analysis Report" >> "$REPORT"
echo "**Generated:** $(date)" >> "$REPORT"
echo "" >> "$REPORT"

# Step 1: Extract all import statements
echo "Step 1: Extracting all import statements from 92 files..."
find "$SRC_DIR" -name "*.js" -type f | while read file; do
    echo "=== $file ===" >> "$ALL_IMPORTS"
    grep -E "^import .* from ['\"]" "$file" 2>/dev/null >> "$ALL_IMPORTS" || true
    echo "" >> "$ALL_IMPORTS"
done

TOTAL_FILES=$(find "$SRC_DIR" -name "*.js" -type f | wc -l | tr -d ' ')
TOTAL_IMPORTS=$(grep -c "^import" "$ALL_IMPORTS" || echo 0)

echo "✅ Found $TOTAL_IMPORTS import statements across $TOTAL_FILES files"
echo "" >> "$REPORT"
echo "### Summary" >> "$REPORT"
echo "- **Total Files Analyzed:** $TOTAL_FILES" >> "$REPORT"
echo "- **Total Import Statements:** $TOTAL_IMPORTS" >> "$REPORT"
echo "" >> "$REPORT"

# Step 2: Extract local file imports (starting with ./ or ../)
echo "Step 2: Identifying local file imports..."
grep -oE "from ['\"](\.|\.\.)/[^'\"]+['\"]" "$ALL_IMPORTS" | \
    sed "s/from ['\"]//g" | sed "s/['\"]//g" | \
    sort -u > "$OUTPUT_DIR/local-imports.txt"

LOCAL_IMPORT_COUNT=$(wc -l < "$OUTPUT_DIR/local-imports.txt" | tr -d ' ')
echo "✅ Found $LOCAL_IMPORT_COUNT unique local file imports"

# Step 3: Check which imported files exist
echo "Step 3: Checking which imported files exist..."
echo "### Missing Local Files" >> "$REPORT"
echo "" >> "$REPORT"

MISSING_COUNT=0
while IFS= read -r import_path; do
    # Try to resolve the path from different base directories
    found=false

    # Check from routes directory
    if [[ "$import_path" == ../* ]]; then
        test_path="$SRC_DIR/routes/${import_path#../}"
        if [ ! -f "$test_path" ]; then
            test_path="$SRC_DIR/services/${import_path#../}"
        fi
    elif [[ "$import_path" == ./* ]]; then
        # Relative to same directory - we'd need context, skip for now
        continue
    else
        test_path="$SRC_DIR/$import_path"
    fi

    # Add .js if not present
    if [[ "$test_path" != *.js ]]; then
        test_path="${test_path}.js"
    fi

    # Check if file exists
    if [ ! -f "$test_path" ]; then
        echo "$import_path" >> "$MISSING_FILES"
        echo "- ❌ \`$import_path\`" >> "$REPORT"
        ((MISSING_COUNT++))
    fi
done < "$OUTPUT_DIR/local-imports.txt"

echo "⚠️  Found $MISSING_COUNT potentially missing files"
echo "" >> "$REPORT"
echo "**Total Missing:** $MISSING_COUNT files" >> "$REPORT"
echo "" >> "$REPORT"

# Step 4: Extract environment variable references
echo "Step 4: Extracting environment variable references..."
echo "### Environment Variables Used" >> "$REPORT"
echo "" >> "$REPORT"

find "$SRC_DIR" -name "*.js" -type f -exec grep -oE "process\.env\.[A-Z_0-9]+" {} \; 2>/dev/null | \
    sed 's/process\.env\.//g' | \
    sort -u > "$ENV_VARS"

ENV_VAR_COUNT=$(wc -l < "$ENV_VARS" | tr -d ' ')
echo "✅ Found $ENV_VAR_COUNT unique environment variables referenced"

while IFS= read -r var; do
    echo "- \`$var\`" >> "$REPORT"
done < "$ENV_VARS"

echo "" >> "$REPORT"

# Step 5: Analyze external dependencies (npm packages)
echo "Step 5: Analyzing external package dependencies..."
echo "### External Package Imports" >> "$REPORT"
echo "" >> "$REPORT"

grep -oE "from ['\"][^./][^'\"]+['\"]" "$ALL_IMPORTS" | \
    sed "s/from ['\"]//g" | sed "s/['\"]//g" | \
    grep -v "^node:" | \
    sort -u > "$OUTPUT_DIR/external-imports.txt"

EXTERNAL_COUNT=$(wc -l < "$OUTPUT_DIR/external-imports.txt" | tr -d ' ')
echo "✅ Found $EXTERNAL_COUNT unique external package imports"

head -20 "$OUTPUT_DIR/external-imports.txt" | while IFS= read -r pkg; do
    echo "- \`$pkg\`" >> "$REPORT"
done

if [ $EXTERNAL_COUNT -gt 20 ]; then
    echo "- ... and $((EXTERNAL_COUNT - 20)) more" >> "$REPORT"
fi

echo "" >> "$REPORT"

# Step 6: Create priority list
echo "Step 6: Creating priority resolution list..."
echo "### Resolution Priority" >> "$REPORT"
echo "" >> "$REPORT"
echo "**Files that need attention:**" >> "$REPORT"
echo "" >> "$REPORT"

# Files we know have issues from deployment attempts
echo "1. **High Priority (Known Issues):**" >> "$REPORT"
echo "   - \`public-signup.js\` → imports \`signup-email.js\` (doesn't exist)" >> "$REPORT"
echo "   - \`system-status.js\` → requires \`DATABASE_URL\` env var" >> "$REPORT"
echo "   - \`admin-auth.js\` → imported by system-status.js" >> "$REPORT"
echo "" >> "$REPORT"

echo "2. **Medium Priority (Imported but not in index.js):**" >> "$REPORT"
echo "   - Check files in routes/ that aren't loaded" >> "$REPORT"
echo "   - Review service dependencies" >> "$REPORT"
echo "" >> "$REPORT"

echo "3. **Low Priority (Commented out in production):**" >> "$REPORT"
echo "   - recordings.js, phone-numbers.js, tenants.js, etc." >> "$REPORT"
echo "" >> "$REPORT"

# Summary
echo ""
echo "=========================================="
echo "Analysis Complete!"
echo "=========================================="
echo ""
echo "Results saved to: $OUTPUT_DIR"
echo ""
echo "Files generated:"
echo "  - all-imports.txt: All import statements"
echo "  - local-imports.txt: Local file imports"
echo "  - missing-files.txt: Potentially missing files ($MISSING_COUNT)"
echo "  - env-variables.txt: Environment variables ($ENV_VAR_COUNT)"
echo "  - external-imports.txt: NPM packages ($EXTERNAL_COUNT)"
echo "  - dependency-report.md: Human-readable report"
echo ""
echo "📊 Quick Stats:"
echo "  Total Files: $TOTAL_FILES"
echo "  Total Imports: $TOTAL_IMPORTS"
echo "  Missing Files: $MISSING_COUNT"
echo "  Env Variables: $ENV_VAR_COUNT"
echo "  External Packages: $EXTERNAL_COUNT"
echo ""
echo "Next: Review $OUTPUT_DIR/dependency-report.md"
