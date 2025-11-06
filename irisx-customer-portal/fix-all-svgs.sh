#!/bin/bash

for file in src/views/*.vue src/views/dashboard/*.vue; do
  if [ -f "$file" ] && grep -q "<svg" "$file"; then
    cp "$file" "$file.bak2"
    
    # Fix ALL SVGs that don't have h- and w- classes
    # Match SVGs with class attribute but no size
    perl -i -pe 's/<svg class="(?!.*\bh-\d)(?!.*\bw-\d)([^"]*)"/<svg class="h-6 w-6 $1"/g' "$file"
    
    # Match SVGs with no class at all
    perl -i -pe 's/<svg ((?!class=)[^>]*?)>/<svg class="h-6 w-6" $1>/g' "$file"
    
    if ! cmp -s "$file" "$file.bak2"; then
      echo "Fixed: $file"
    fi
    rm "$file.bak2"
  fi
done

echo "Done fixing all SVG sizes!"
