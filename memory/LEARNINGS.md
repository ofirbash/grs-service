# Agent learnings

- Preview frontend is a static build served by `serve build` — after frontend edits run `cd /app/frontend && yarn build`.
- Preview URL: https://bashari-lab-direct.preview.emergentagent.com (frontend uses relative NEXT_PUBLIC_API_URL=/api).
- UI login is blocked by Cloudflare Turnstile in screenshots: get a token via `POST localhost:8001/api/auth/login`, then set sessionStorage `token` and `auth-storage` ({"state":{token,user,isAuthenticated:true},"version":0}) before navigating.
- /tmp is wiped; keep scratch files in /root.
- Memo HTML can be unit-checked by transpiling `shipment-memo.ts` with node_modules/typescript and stubbing `openPrintWindow` (see /root/memo_test2.js).
