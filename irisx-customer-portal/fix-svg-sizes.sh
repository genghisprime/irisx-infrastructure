#!/bin/bash

# Find all Vue files and fix SVG sizing issues
for file in src/views/*.vue src/views/dashboard/*.vue; do
  if [ -f "$file" ]; then
    # Backup the file
    cp "$file" "$file.backup"
    
    # Fix SVGs without any class attribute
    sed -i '' 's/<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">/<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">/g' "$file"
    
    # Fix SVGs with only other attributes but no size
    sed -i '' 's/<svg class="text-/<svg class="h-6 w-6 text-/g' "$file"
    sed -i '' 's/<svg class="animate-/<svg class="h-6 w-6 animate-/g' "$file"
    
    # Fix icon classes that might not have size
    sed -i '' 's/class="icon "/class="icon h-5 w-5 "/g' "$file"
    sed -i '' 's/class="icon-sm "/class="icon-sm h-4 w-4 "/g' "$file"
    sed -i '' 's/class="empty-icon "/class="empty-icon h-12 w-12 "/g' "$file"
    
    # Check if file changed
    if ! cmp -s "$file" "$file.backup"; then
      echo "Fixed: $file"
    fi
    rm "$file.backup"
  fi
done
