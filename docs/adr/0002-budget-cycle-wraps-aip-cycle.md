# BudgetCycle wraps AIPCycle instead of replacing it

A new **BudgetCycle** (one per fiscal year) holds the cycle's stage and the public switches. The
existing **AIPCycle** stays as the AIP stage of it, one to one and optional, so historical years can
have an Ordinance without any AIP. The cleaner option, renaming AIPCycle to BudgetCycle, would have
touched every `aipCycleId` reference in the schema, API and client for no behavioural gain. The AIP
keeps its own state machine and its ceilings. LOCKED becomes ADOPTED, because "locked" mixed up "edits
frozen" with "ordinance enacted". A year now counts as an Annual Budget when it has an enacted
Ordinance, never because of the AIP's status.
