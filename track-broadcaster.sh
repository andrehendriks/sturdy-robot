#!/bin/bash
# Script to monitor Liquidsoap logs and send track info to Shoutcast board

BOARD_ENDPOINT="${BOARD_ENDPOINT:-http://localhost:8080/update}"
LOGFILE="/var/log/liquidsoap/radio.log"

echo "Starting track info broadcaster"
echo "Board endpoint: $BOARD_ENDPOINT"

# Follow the log file and extract DJ track info
tail -f "$LOGFILE" 2>/dev/null | while read -r line; do
  # Look for "DJ TRACK:" log entries
  if [[ $line =~ "DJ TRACK:"\ (.*)\ -\ (.*) ]]; then
    artist="${BASH_REMATCH[1]}"
    title="${BASH_REMATCH[2]}"
    
    echo "Extracted: Artist=$artist, Title=$title"
    
    # Send to Shoutcast board via HTTP POST
    if [ -n "$artist" ] && [ -n "$title" ]; then
      response=$(curl -s -X POST "$BOARD_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "{\"artist\":\"$artist\",\"title\":\"$title\",\"stream\":\"dj-sl\"}" \
        2>&1)
      
      if [ $? -eq 0 ]; then
        echo "[$(date)] Sent to board: $artist - $title"
      else
        echo "[$(date)] Failed to send: $response"
      fi
    fi
  fi
done
