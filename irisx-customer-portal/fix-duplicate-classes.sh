#!/bin/bash

for file in src/views/*.vue src/views/dashboard/*.vue; do
  if [ -f "$file" ]; then
    # Fix: <svg class="h-6 w-6" ... class="other stuff"
    # Merge them into one class attribute
    perl -i -pe 's/<svg class="([^"]*)" ([^>]*?)class="([^"]*)"/<svg class="$1 $3" $2/g' "$file"
    perl -i -pe 's/<svg class="([^"]*)" ([^>]*?)class="([^"]*)"/<svg class="$1 $3" $2/g' "$file"
  fi
done

echo "Fixed duplicate class attributes"
