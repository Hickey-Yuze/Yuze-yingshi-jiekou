#!/bin/bash
set -e
KV=JUZHI_CACHE

npx wrangler kv bulk put --binding "$KV" --preview false index/chunk_0.json
npx wrangler kv bulk put --binding "$KV" --preview false index/chunk_1.json
npx wrangler kv bulk put --binding "$KV" --preview false index/chunk_2.json
npx wrangler kv bulk put --binding "$KV" --preview false index/chunk_3.json
npx wrangler kv bulk put --binding "$KV" --preview false index/chunk_4.json
npx wrangler kv bulk put --binding "$KV" --preview false index/chunk_5.json
npx wrangler kv bulk put --binding "$KV" --preview false index/chunk_6.json
npx wrangler kv bulk put --binding "$KV" --preview false index/chunk_7.json
npx wrangler kv bulk put --binding "$KV" --preview false index/chunk_8.json
npx wrangler kv bulk put --binding "$KV" --preview false index/chunk_9.json
npx wrangler kv bulk put --binding "$KV" --preview false index/cat_21.json
npx wrangler kv bulk put --binding "$KV" --preview false index/cat_23.json
npx wrangler kv bulk put --binding "$KV" --preview false index/cat_22.json
npx wrangler kv bulk put --binding "$KV" --preview false index/cat_20.json
npx wrangler kv bulk put --binding "$KV" --preview false index/cat_24.json
