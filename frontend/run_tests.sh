#!/bin/bash
cd /home/bhaswat/projects/RaceControlEngine/frontend
export PATH=$(echo $PATH | tr ':' '\n' | grep -v '/mnt/' | tr '\n' ':')
npx vitest run src/tests/DashboardHUD.test.jsx
