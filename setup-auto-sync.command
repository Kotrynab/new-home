#!/bin/bash
SCRIPT_DIR="$(dirname "$0")"
PLIST_SRC="$SCRIPT_DIR/com.mystudio.invoicesync.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.mystudio.invoicesync.plist"

# Stop existing if running
launchctl unload "$PLIST_DEST" 2>/dev/null

# Copy and activate
cp "$PLIST_SRC" "$PLIST_DEST"
launchctl load "$PLIST_DEST"

echo ""
echo "✓ Auto-sync is now active."
echo ""
echo "From now on, every time you add a new invoice PDF"
echo "to Desktop/saskaitos/2026, it will be automatically"
echo "added to your dashboard. Just refresh Safari."
echo ""
echo "Press any key to close..."
read -n 1
