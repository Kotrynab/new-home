#!/bin/bash
cd "$(dirname "$0")"
echo "Scanning saskaitos/2026 for new invoices..."
python3 sync-invoices.py
echo ""
echo "Press any key to close this window..."
read -n 1
