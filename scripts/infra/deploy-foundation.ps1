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

function Ensure-GitHubOidcProvider {
  param(
    [string]$AwsCliPath,
    [string]$Profile
  )

  $list = Invoke-External -FilePath $AwsCliPath -Arguments @(
    '--profile', $Profile,
    'iam',
    'list-open-id-connect-providers',
    '--output', 'json'
  )
  $providers = ($list.Output | Out-String | ConvertFrom-Json).OpenIDConnectProviderList

  foreach ($provider in $providers) {
    $arn = [string]$provider.Arn
    if (-not $arn) { continue }

    $get = Invoke-External -FilePath $AwsCliPath -Arguments @(
      '--profile', $Profile,
      'iam',
      'get-open-id-connect-provider',
      '--open-id-connect-provider-arn', $arn,
      '--output', 'json'
    ) -AllowFailure

    if ($get.ExitCode -ne 0) { continue }
    $url = ([string]((($get.Output | Out-String) | ConvertFrom-Json).Url)).Trim()
    if ($url -eq 'token.actions.githubusercontent.com') {
      return $arn
    }
  }

  # GitHub's Actions OIDC root CA thumbprint (subject to change).
  $thumbprint = '6938fd4d98bab03faadb97b34396831e3780aea1'
  $create = Invoke-External -FilePath $AwsCliPath -Arguments @(
    '--profile', $Profile,
    'iam',
    'create-open-id-connect-provider',
    '--url', 'https://token.actions.githubusercontent.com',
    '--client-id-list', 'sts.amazonaws.com',
    '--thumbprint-list', $thumbprint,
    '--output', 'json'
  )
  return ([string]((($create.Output | Out-String) | ConvertFrom-Json).OpenIDConnectProviderArn)).Trim()
}

function Get-StackOutputs {
  param(
    [string]$AwsCliPath,
    [string]$Profile,
    [string]$Region,
    [string]$StackName
  )

  $describe = Invoke-External -FilePath $AwsCliPath -Arguments @(
    '--profile', $Profile,
    '--region', $Region,
    'cloudformation',
    'describe-stacks',
    '--stack-name', $StackName,
    '--output', 'json'
  )

  $stack = (($describe.Output | Out-String) | ConvertFrom-Json).Stacks[0]
  $map = @{}
  foreach ($output in ($stack.Outputs | Where-Object { $_ })) {
    $map[[string]$output.OutputKey] = [string]$output.OutputValue
  }

  return $map
}

function Get-InstanceIdByTags {
  param(
    [string]$AwsCliPath,
    [string]$Profile,
    [string]$Region,
    [string]$AppTagValue,
    [string]$EnvironmentTagValue
  )

  $json = Invoke-External -FilePath $AwsCliPath -Arguments @(
    '--profile', $Profile,
    '--region', $Region,
    'ec2',
    'describe-instances',
    '--filters',
    "Name=tag:App,Values=$AppTagValue",
    "Name=tag:Environment,Values=$EnvironmentTagValue",
    'Name=instance-state-name,Values=pending,running,stopping,stopped',
    '--output', 'json'
  )

  $obj = ($json.Output | Out-String) | ConvertFrom-Json
  $instances = @()
  foreach ($reservation in ($obj.Reservations | Where-Object { $_ })) {
    foreach ($instance in ($reservation.Instances | Where-Object { $_ })) {
      $instances += $instance
    }
  }

  if ($instances.Count -eq 0) {
    throw "No instances found for App=$AppTagValue Environment=$EnvironmentTagValue in $Region"
  }
  if ($instances.Count -ne 1) {
    $ids = ($instances | ForEach-Object { $_.InstanceId }) -join ', '
    throw "Expected exactly 1 instance for App=$AppTagValue Environment=$EnvironmentTagValue, found: $ids"
  }

  return [string]$instances[0].InstanceId
}

function Ensure-IamInstanceProfileAssociation {
  param(
    [string]$AwsCliPath,
    [string]$Profile,
    [string]$Region,
    [string]$InstanceId,
    [string]$InstanceProfileName
  )

  $assocRaw = Invoke-External -FilePath $AwsCliPath -Arguments @(
    '--profile', $Profile,
    '--region', $Region,
    'ec2',
    'describe-iam-instance-profile-associations',
    '--filters',
    "Name=instance-id,Values=$InstanceId",
    '--output', 'json'
  )

  $associations = (($assocRaw.Output | Out-String) | ConvertFrom-Json).IamInstanceProfileAssociations
  if ($associations -and $associations.Count -gt 0) {
    # Prefer the active association when multiple entries exist.
    $association = ($associations | Where-Object { $_.State -eq 'associated' } | Select-Object -First 1)
    if (-not $association) {
      $association = $associations[0]
    }

    $associationId = [string]$association.AssociationId
    $currentArn = [string]$association.IamInstanceProfile.Arn
    $currentName = ''
    if ($currentArn) {
      $parts = $currentArn.Split('/')
      $currentName = $parts[$parts.Length - 1]
    }

    if ($currentName -eq $InstanceProfileName) {
      Write-Host "Instance profile already attached to ${InstanceId}: $InstanceProfileName"
      return
    }

    $currentLabel = if ($currentName) { $currentName } else { $currentArn }
    Write-Host "Replacing instance profile for ${InstanceId}: $currentLabel -> $InstanceProfileName"
    $null = Invoke-External -FilePath $AwsCliPath -Arguments @(
      '--profile', $Profile,
      '--region', $Region,
      'ec2',
      'replace-iam-instance-profile-association',
      '--association-id', $associationId,
      '--iam-instance-profile', "Name=$InstanceProfileName"
    )
    return
  }

  Write-Host "Associating instance profile to ${InstanceId}: $InstanceProfileName"
  $null = Invoke-External -FilePath $AwsCliPath -Arguments @(
    '--profile', $Profile,
    '--region', $Region,
    'ec2',
    'associate-iam-instance-profile',
    '--instance-id', $InstanceId,
    '--iam-instance-profile', "Name=$InstanceProfileName"
  )
}

function Get-InstanceState {
  param(
    [string]$AwsCliPath,
    [string]$Profile,
    [string]$Region,
    [string]$InstanceId
  )

  $raw = Invoke-External -FilePath $AwsCliPath -Arguments @(
    '--profile', $Profile,
    '--region', $Region,
    'ec2',
    'describe-instances',
    '--instance-ids', $InstanceId,
    '--query', 'Reservations[0].Instances[0].State.Name',
    '--output', 'text'
  )

  return ([string]($raw.Output | Out-String)).Trim()
}

function Wait-ForSsmManagedInstance {
  param(
    [string]$AwsCliPath,
    [string]$Profile,
    [string]$Region,
    [string]$InstanceId,
    [int]$TimeoutSeconds = 600
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $raw = Invoke-External -FilePath $AwsCliPath -Arguments @(
      '--profile', $Profile,
      '--region', $Region,
      'ssm',
      'describe-instance-information',
      '--filters', "Key=InstanceIds,Values=$InstanceId",
      '--output', 'json'
    ) -AllowFailure

    if ($raw.ExitCode -eq 0) {
      $list = (($raw.Output | Out-String) | ConvertFrom-Json).InstanceInformationList
      if ($list -and $list.Count -gt 0) {
        $info = $list[0]
        Write-Host "SSM managed instance is registered: $InstanceId (ping $($info.PingStatus), agent $($info.AgentVersion))"
        return
      }
    }

    Start-Sleep -Seconds 6
  }

  throw "Timed out waiting for SSM managed instance registration: $InstanceId"
}

$aws = Get-AwsCliPath
$profile = 'root'
$region = if ($env:AWS_REGION) { $env:AWS_REGION } else { 'us-east-1' }

$oidcArn = Ensure-GitHubOidcProvider -AwsCliPath $aws -Profile $profile
if (-not $oidcArn) {
  throw 'Unable to determine or create GitHub OIDC provider.'
}

$template = Join-Path (Get-Location) 'infra\cloudformation\deploy-foundation.yml'
if (-not (Test-Path $template)) {
  throw "Missing template: $template"
}

$stackName = 'daily-bible-verse-bot-foundation'

$null = Invoke-External -FilePath $aws -Arguments @(
  '--profile', $profile,
  '--region', $region,
  'cloudformation',
  'deploy',
  '--stack-name', $stackName,
  '--template-file', $template,
  '--capabilities', 'CAPABILITY_NAMED_IAM',
  '--parameter-overrides',
  "GitHubOidcProviderArn=$oidcArn",
  'GitHubOrg=michaelpa-dev',
  'GitHubRepo=Daily-Bible-Verse-Bot',
  'AppTagValue=DailyBibleVerseBot'
)

Write-Host "CloudFormation stack deployed: $stackName"

$outputs = Get-StackOutputs -AwsCliPath $aws -Profile $profile -Region $region -StackName $stackName
$prodProfileName = $outputs['ProductionInstanceProfileName']
$canaryProfileName = $outputs['CanaryInstanceProfileName']
$deployRoleArn = $outputs['GitHubActionsRoleArn']

if (-not $prodProfileName -or -not $canaryProfileName -or -not $deployRoleArn) {
  throw 'Missing one or more expected CloudFormation outputs (ProductionInstanceProfileName, CanaryInstanceProfileName, GitHubActionsRoleArn).'
}

$appTagValue = 'DailyBibleVerseBot'

$prodInstanceId = Get-InstanceIdByTags -AwsCliPath $aws -Profile $profile -Region $region -AppTagValue $appTagValue -EnvironmentTagValue 'production'
$canaryInstanceId = Get-InstanceIdByTags -AwsCliPath $aws -Profile $profile -Region $region -AppTagValue $appTagValue -EnvironmentTagValue 'canary'

Ensure-IamInstanceProfileAssociation -AwsCliPath $aws -Profile $profile -Region $region -InstanceId $prodInstanceId -InstanceProfileName $prodProfileName
Ensure-IamInstanceProfileAssociation -AwsCliPath $aws -Profile $profile -Region $region -InstanceId $canaryInstanceId -InstanceProfileName $canaryProfileName

$prodState = Get-InstanceState -AwsCliPath $aws -Profile $profile -Region $region -InstanceId $prodInstanceId
$canaryState = Get-InstanceState -AwsCliPath $aws -Profile $profile -Region $region -InstanceId $canaryInstanceId

if ($prodState -eq 'running') {
  Wait-ForSsmManagedInstance -AwsCliPath $aws -Profile $profile -Region $region -InstanceId $prodInstanceId
} else {
  Write-Host "Production instance is $prodState; skipping SSM online wait."
}

if ($canaryState -eq 'running') {
  Wait-ForSsmManagedInstance -AwsCliPath $aws -Profile $profile -Region $region -InstanceId $canaryInstanceId
} else {
  Write-Host "Canary instance is $canaryState; skipping SSM online wait."
}

Write-Host ''
Write-Host 'Foundation summary:'
Write-Host "  Region: $region"
Write-Host "  Production instance: $prodInstanceId (profile: $prodProfileName)"
Write-Host "  Canary instance:     $canaryInstanceId (profile: $canaryProfileName)"
Write-Host "  GitHub deploy role:  $deployRoleArn"
