#!/bin/bash
# Single-shot: press fn key to prevent macOS sleep. Invoked by the weaver server.
osascript -e 'tell application "System Events" to key code 63'
