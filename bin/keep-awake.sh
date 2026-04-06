#!/bin/bash
# Single-shot: assert user activity to prevent macOS sleep. Invoked by the weaver server.
caffeinate -u -t 1
