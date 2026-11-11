# Codex Quota Hold

Codex failed on quota/credit/rate-limit usage. Suggested retry after 1h (2026-11-10T17:35-08:00).

Kibitz detected provider quota, credit, or rate-limit markers for this lane.
The active driver should acknowledge this to the user and ask when to retry.
If the user does not choose a time, use the suggested retry window above.

To change the built-in retry window, set `KIBITZ_QUOTA_RETRY_AFTER`
(examples: `30m`, `1h`, `4h`, `1d`) before rerunning Kibitz.

## Diagnostic

Codex quota/rate-limit marker detected in agent output:
{"type":"error","message":"You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at 10:06 PM."}
{"type":"turn.failed","error":{"message":"You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at 10:06 PM."}}
