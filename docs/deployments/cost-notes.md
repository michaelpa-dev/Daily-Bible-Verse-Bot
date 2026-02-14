# Cost Notes

This deployment system is intentionally designed for the **lowest ongoing AWS cost** while still being reliable and observable.

## What This Setup Uses (On Purpose)

- 1x production EC2 instance (always on)
- 1x canary EC2 instance (stopped when idle)
- AWS SSM RunCommand (no SSH bastion, no inbound deploy traffic)
- A tiny Lambda + EventBridge schedule to stop canary after inactivity
- Minimal CloudWatch logs (Lambda default logs)

## What This Setup Avoids

- NAT gateways
- Load balancers (ALB/NLB)
- Auto Scaling Groups
- CodeDeploy
- Always-on orchestration services

## Canary Cost Reduction

The canary instance is stopped automatically when inactive:

- Activity signal: `CanaryLastPushEpoch` tag updated on each push to `canary` (via the canary deploy workflow).
- Stop condition: now - last push >= 4 hours.
- Schedule cadence: every 15 minutes (cheap and meets the requirement without constant polling).
- Canary EIP was released so a stopped canary does not retain a billable public IPv4 address.

## Instance Type Notes

Current instance types are `t3.micro` in `us-east-1` for both environments.

If cost pressure is high:

- Consider `t4g.micro` (ARM) if your Docker base image and dependencies are compatible.
- Keep EBS volume size minimal but with enough headroom for Docker images and logs.

## Cost-Saving Reminders (Contributor Checklist)

These rules are intentionally duplicated here so future contributors do not accidentally introduce expensive services.

### A) Canary Must Be Ephemeral

- Canary EC2 must not run permanently.
- Canary is started on demand by the canary deploy workflow.
- Canary auto-stop must stop the instance when `now - CanaryLastPushEpoch >= 4 hours`.
- Any workflow that deploys canary must update `CanaryLastPushEpoch` to extend the window.

### B) Avoid Paid Always-On AWS Services

- Do not add ALB, ASG, NAT Gateway, CodeDeploy, CodeBuild, CodePipeline, RDS, etc.
- Prefer SSM over SSH for all operations.
- Prefer GitHub Actions over AWS CI services.

### C) Minimal Monitoring, But No Silent Failures

- Do not enable detailed monitoring unless needed.
- Keep CloudWatch usage minimal (Lambda default logs are enough for canary auto-stop).
- If adding alarms, keep it to high-signal only.
- Example: instance status checks failing.
- Example: repeated bot restart/crash loops.

### D) Limit Outbound Requests

- Cache bible-api.com responses when paginating (avoid re-fetching the same chapter every button click).
- Cache metadata (chapter/verse counts) locally and commit it (do not re-discover it at runtime).
- Debounce repeated lookups in interactive flows.

### E) Build and Deploy Efficiency

- Keep release artifacts small (do not commit `node_modules` into artifacts).
- Prefer idempotent deploy scripts and avoid rework on each deploy.
- Avoid adding extra infrastructure per deploy.

### F) CI Cost Leak Guard

- Deploy workflows fail if:
  - any EBS volumes exist in `available` state
  - any Elastic IPs exist unassociated
- Keep this guard enabled; it prevents silent recurring charges.

### G) Make Cost Choices Obvious

- Document any AWS service additions in `docs/deployments/cost-notes.md` with a cost justification.
- Prefer deleting resources (EIPs, orphan volumes) over leaving them idle.
