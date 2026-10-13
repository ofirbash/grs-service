#!/bin/bash
# Measure main API endpoints (local preview backend). Usage: bash /app/memory/perf_measure.sh [base]
API=${1:-http://localhost:8001/api}
TOKEN=$(curl -s -X POST $API/auth/login -H "Content-Type: application/json" -d '{"email":"admin@bashari.com","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
for ep in "jobs" "jobs?page=1&page_size=50" "shipments" "stones" "clients" "dashboard/stats" "pricing" "jobs/expected-results"; do
  curl -s -o /root/perf_out.json -w "%{time_total}s %{size_download}B  /api/$ep\n" "$API/$ep" -H "Authorization: Bearer $TOKEN"
done
