#!/bin/bash
PLIST_DEST="$HOME/Library/LaunchAgents/com.mystudio.invoicesync.plist"
launchctl unload "$PLIST_DEST" 2>/dev/null
rm -f "$PLIST_DEST"
echo ""
echo "✓ Auto-sync stopped."
echo ""
echo "Press any key to close..."
read -n 1
