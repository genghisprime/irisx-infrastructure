#!/bin/bash

echo "Starting comprehensive SVG and layout fixes..."

# Fix ALL SVGs by adding forced inline sizing
for file in src/views/*.vue src/views/dashboard/*.vue; do
  if [ -f "$file" ]; then
    # Replace h-12 w-12 SVGs with forced 48px sizing
    perl -i -pe 's/<svg class="(.*?)h-12 w-12(.*?)"/<svg style="width: 48px; height: 48px; min-width: 48px; min-height: 48px; max-width: 48px; max-height: 48px;" class="$1$2"/g' "$file"
    
    # Replace h-6 w-6 SVGs with forced 24px sizing
    perl -i -pe 's/<svg class="(.*?)h-6 w-6(.*?)"/<svg style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; max-width: 24px; max-height: 24px;" class="$1$2"/g' "$file"
    
    # Replace h-5 w-5 SVGs with forced 20px sizing
    perl -i -pe 's/<svg class="(.*?)h-5 w-5(.*?)"/<svg style="width: 20px; height: 20px; min-width: 20px; min-height: 20px; max-width: 20px; max-height: 20px;" class="$1$2"/g' "$file"
    
    # Replace h-4 w-4 SVGs with forced 16px sizing
    perl -i -pe 's/<svg class="(.*?)h-4 w-4(.*?)"/<svg style="width: 16px; height: 16px; min-width: 16px; min-height: 16px; max-width: 16px; max-height: 16px;" class="$1$2"/g' "$file"
    
    # Replace h-8 w-8 SVGs with forced 32px sizing
    perl -i -pe 's/<svg class="(.*?)h-8 w-8(.*?)"/<svg style="width: 32px; height: 32px; min-width: 32px; min-height: 32px; max-width: 32px; max-height: 32px;" class="$1$2"/g' "$file"
  fi
done

echo "Fixed all SVG sizing across all views"
echo "Total files processed: $(find src/views -name "*.vue" | wc -l)"
