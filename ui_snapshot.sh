#!/bin/bash

OUTPUT="project_snapshot.txt"

# Files to show name only, not content (large reference docs)
PLACEHOLDER_FILES=(
  "./CONTRIBUTING.md"
)

is_placeholder() {
  local file="$1"
  for pf in "${PLACEHOLDER_FILES[@]}"; do
    [[ "$file" == "$pf" ]] && return 0
  done
  return 1
}

{
  echo "# PROJECT SNAPSHOT - src/ui + root files"
  echo "Generated: $(date)"
  echo ""

  echo "## DIRECTORY STRUCTURE"
  echo '```'
  tree -a ./src/ui -I 'node_modules|.git|out|*.map' --noreport
  echo '```'
  echo ""

  # Root CSS files
  for file in ./*.css; do
    [[ -f "$file" ]] || continue
    ext="${file##*.}"
    echo "## FILE: $file"
    echo '```'"$ext"
    cat "$file"
    echo '```'
    echo ""
  done

  # Root type files (globals.d.ts, types.ts, etc.)
  for file in ./globals.d.ts ./src/types.ts; do
    [[ -f "$file" ]] || continue
    ext="${file##*.}"
    echo "## FILE: $file"
    echo '```'"$ext"
    cat "$file"
    echo '```'
    echo ""
  done

  # src/ui files
  find ./src/ui \
    -type f \
    \( -name "*.ts" -o -name "*.js" -o -name "*.json" -o -name "*.html" -o -name "*.css" -o -name "*.md" -o -name "*.yml" -o -name "*.yaml" -o -name "*.sh" \) \
    2>/dev/null \
    | sort \
    | while read -r file; do
      ext="${file##*.}"
      echo "## FILE: $file"
      if is_placeholder "$file"; then
        echo '```'"$ext"
        echo "[Large reference document - $(wc -l < "$file") lines, $(wc -c < "$file" | xargs) bytes]"
        echo '```'
      else
        echo '```'"$ext"
        cat "$file"
        echo '```'
      fi
      echo ""
    done

} > "$OUTPUT"

echo "Snapshot saved to $OUTPUT"
