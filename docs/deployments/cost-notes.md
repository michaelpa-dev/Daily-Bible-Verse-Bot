# Cost Notes

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

- Activity signal: `CanaryLastPushEpoch` tag updated on each push to `master`.
- Stop condition: now - last push >= 4 hours.
- Schedule cadence: every 15 minutes (cheap and meets the requirement without constant polling).
- Canary EIP was released so a stopped canary does not retain a billable public IPv4 address.

## Instance Type Notes

Current instance types are `t3.micro` in `us-east-1` for both environments.

If cost pressure is high:

- Consider `t4g.micro` (ARM) if your Docker base image and dependencies are compatible.
- Keep EBS volume size minimal but with enough headroom for Docker images and logs.
