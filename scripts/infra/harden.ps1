Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'
if ($PSVersionTable.PSVersion.Major -ge 7) {
  $PSNativeCommandUseErrorActionPreference = $false
}

function Invoke-External {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $false)][string[]]$Arguments = @(),
    [switch]$AllowFailure
  )

  $output = & $FilePath @Arguments 2>&1
  $exitCode = $LASTEXITCODE

  if (-not $AllowFailure -and $exitCode -ne 0) {
    $argsText = $Arguments -join ' '
    $outText = ($output | Out-String).Trim()
    throw "Command failed ($FilePath $argsText): $outText"
  }

  return @{
    Output = $output
    ExitCode = $exitCode
  }
}

function Get-AwsCliPath {
  $paths = @('aws', 'C:\Program Files\Amazon\AWSCLIV2\aws.exe')
  foreach ($path in $paths) {
    if ($path -eq 'aws') {
      try {
        $null = Get-Command aws -ErrorAction Stop
        return 'aws'
      } catch {
        continue
      }
    }

    if (Test-Path $path) {
      return $path
    }
  }

  throw 'AWS CLI not found. Install AWS CLI v2 before running this script.'
}

$aws = Get-AwsCliPath
$profile = 'root'
$region = if ($env:AWS_REGION) { $env:AWS_REGION } else { 'us-east-1' }
$appTagValue = 'DailyBibleVerseBot'

Write-Host "Hardening DailyBibleVerseBot infra in $region (profile=$profile)"

# 1) Remove SSH ingress rule from the bot security group (SSM is used instead).
$sgIdResult = Invoke-External -FilePath $aws -Arguments @(
  '--profile', $profile,
  '--region', $region,
  'ec2',
  'describe-security-groups',
  '--filters',
  "Name=group-name,Values=daily-bible-verse-bot-sg",
  "Name=tag:App,Values=$appTagValue",
  '--query', 'SecurityGroups[0].GroupId',
  '--output', 'text'
) -AllowFailure

$sgId = ([string]($sgIdResult.Output | Out-String)).Trim()
if ($sgId -and $sgId -ne 'None') {
  $null = Invoke-External -FilePath $aws -Arguments @(
    '--profile', $profile,
    '--region', $region,
    'ec2',
    'revoke-security-group-ingress',
    '--group-id', $sgId,
    '--protocol', 'tcp',
    '--port', '22',
    '--cidr', '0.0.0.0/0'
  ) -AllowFailure

  Write-Host "Security group SSH ingress revoked (or already absent): $sgId"
} else {
  Write-Host 'Security group not found; skipping SSH ingress revoke.'
}

# 2) Release canary EIP so a stopped canary does not retain a billable public IPv4.
$addressesRaw = Invoke-External -FilePath $aws -Arguments @(
  '--profile', $profile,
  '--region', $region,
  'ec2',
  'describe-addresses',
  '--filters',
  "Name=tag:App,Values=$appTagValue",
  'Name=tag:Environment,Values=canary',
  '--output', 'json'
)

$addresses = (($addressesRaw.Output | Out-String) | ConvertFrom-Json).Addresses
if ($addresses -and $addresses.Count -gt 0) {
  foreach ($addr in $addresses) {
    $allocationId = [string]$addr.AllocationId
    $associationId = [string]$addr.AssociationId
    if ($associationId) {
      $null = Invoke-External -FilePath $aws -Arguments @(
        '--profile', $profile,
        '--region', $region,
        'ec2',
        'disassociate-address',
        '--association-id', $associationId
      ) -AllowFailure
    }

    if ($allocationId) {
      $null = Invoke-External -FilePath $aws -Arguments @(
        '--profile', $profile,
        '--region', $region,
        'ec2',
        'release-address',
        '--allocation-id', $allocationId
      ) -AllowFailure
      Write-Host "Released canary EIP allocation: $allocationId"
    }
  }
} else {
  Write-Host 'No canary EIP allocations found; skipping EIP release.'
}

Write-Host 'Hardening complete.'

