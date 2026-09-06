# Example charts

`1claw apply -f chart.yaml` provisions a whole swarm from one file instead of a
sequence of API calls.

```bash
1claw diff -f inbox-swarm/chart.yaml     # what would change
1claw apply -f inbox-swarm/chart.yaml --dry-run
```

## Things worth knowing before you write one

**Names are the reconcile keys.** A second apply finds what the first one made
by name. Renaming an agent does not rename it — it makes a new one, because
apply never deletes anything. `1claw delete` is separate and explicit.

**A resource edited outside the chart is skipped.** If someone changed an agent
by hand — during an incident, say — apply leaves it alone and tells you which
fields differ. Reconcile it yourself, or drop those fields from the chart.

**Guardrails are not chart fields.** Transaction limits, allowlists and approval
policies route through the guardrail approval flow, and a chart cannot go around
that. A chart asking to change one is refused, and says so.

**Connectors need a human.** A chart can install the Gmail connector; someone
still has to sign in. Apply returns the authorization URL rather than pretending
the binding is usable.

**A typo is an error, not a silent no-op.** Unknown fields are rejected — a
misspelled `system_promt` that got quietly dropped would produce an apply that
reported success and did nothing you asked for.
