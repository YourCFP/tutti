# 2026-06-24 Feishu Bug Records

## Wb7grfq2ZewOJfcB9wucxkHrnvb

- Link: https://ccn53rwonxso.feishu.cn/record/Wb7grfq2ZewOJfcB9wucxkHrnvb
- Base record id: `recvnqw6wR47aJ`
- Base: `CEHMbNF8Zavq5wsAO3ecrpQ6nPc`, table `tblieImZwMnvZ8My` (`Bug 管理`)
- Bug: 应用中心卡片右上角的主操作文案在版本号较长时超出卡片边界。
- Evidence: `image.png` from Feishu attachment `EMgVbwMC4ozXBmxa6EpchvyLnWb` shows labels such as `可更新到 0.0.20+78abd4a...` overflowing from the first app card into the next card.
- Cause: `AppCard` rendered the top-right action group as `shrink-0`, and the primary action button used an unconstrained width. Long update labels could force the action group wider than the card instead of truncating.
- Fix: Allow the action group to shrink within the card header, constrain the primary action button with `min-w-0 max-w-full`, truncate long labels, and keep the full label in the button title.
- Verification:
  - `pnpm --filter @tutti-os/workspace-app-center test`
  - `pnpm --filter @tutti-os/workspace-app-center typecheck`
- Status: fixed locally
- Commit: this commit
- Feishu status update: pending after commit and verification.
