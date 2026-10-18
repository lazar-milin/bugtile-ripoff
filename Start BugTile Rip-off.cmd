@echo off
cd /d "%~dp0"
echo BugTile Rip-off opens at http://127.0.0.1:3007
echo Keep this window open while playing. Press Ctrl+C to stop.
node server.mjs
pause
