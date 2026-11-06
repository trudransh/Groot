# One ENS Permissioned Resolver instance per plant

Superseded by ADR 0005.

ENS v2's Permissioned Resolver scopes roles by record key but not by name: "a role holder can write the covered records on every name served by the resolver instance". We want each plant agent to write only its own status and decision records, so every plant name is served by its own resolver instance, with the agent's key granted only those text keys. A single shared resolver would let any plant agent overwrite every other plant's records.
