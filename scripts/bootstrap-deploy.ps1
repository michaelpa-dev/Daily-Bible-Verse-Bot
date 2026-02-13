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

function Invoke-AwsJson {
  param(
    [string]$AwsCliPath,
    [string]$Profile,
    [string]$Region,
    [string[]]$Arguments
  )

  $args = @()
  if ($Profile) {
    $args += @('--profile', $Profile)
  }
  if ($Region) {
    $args += @('--region', $Region)
  }
  $args += $Arguments
  $args += @('--output', 'json')

  $result = Invoke-External -FilePath $AwsCliPath -Arguments $args
  $raw = ($result.Output | Out-String).Trim()
  if (-not $raw) {
    return $null
  }

  return ($raw | ConvertFrom-Json)
}

function Invoke-AwsText {
  param(
    [string]$AwsCliPath,
    [string]$Profile,
    [string]$Region,
    [string[]]$Arguments
  )

  $args = @()
  if ($Profile) {
    $args += @('--profile', $Profile)
  }
  if ($Region) {
    $args += @('--region', $Region)
  }
  $args += $Arguments
  $args += @('--output', 'text')

  $result = Invoke-External -FilePath $AwsCliPath -Arguments $args
  return (($result.Output | Out-String).Trim())
}

function Parse-Tokens {
  param(
    [string]$TokenFilePath,
    [string]$ConfigFilePath
  )

  $prod = $null
  $canary = $null

  if (Test-Path $TokenFilePath) {
    $content = Get-Content $TokenFilePath -Raw
    $prodMatch = [regex]::Match($content, '(?im)^\s*prod\s*:\s*(\S+)\s*$')
    $canaryMatch = [regex]::Match($content, '(?im)^\s*canary\s*:\s*(\S+)\s*$')

    if ($prodMatch.Success) {
      $prod = $prodMatch.Groups[1].Value.Trim()
    }
    if ($canaryMatch.Success) {
      $canary = $canaryMatch.Groups[1].Value.Trim()
    }
  }

  if (-not $prod -and (Test-Path $ConfigFilePath)) {
    try {
      $config = Get-Content $ConfigFilePath -Raw | ConvertFrom-Json
      if ($config.botToken) {
        $prod = [string]$config.botToken
      }
    } catch {
      # Ignore malformed local config.
    }
  }

  if (-not $canary) {
    $canary = $prod
  }

  if (-not $prod) {
    throw "Unable to determine production token. Expected 'Prod: <token>' in $TokenFilePath or botToken in $ConfigFilePath."
  }

  return @{
    Prod = $prod
    Canary = $canary
  }
}

function Ensure-GitHubEnvironment {
  param(
    [string]$Repo,
    [string]$EnvironmentName
  )

  $null = Invoke-External -FilePath 'gh' -Arguments @('api', '--method', 'PUT', "repos/$Repo/environments/$EnvironmentName")
}

function Set-GhEnvSecret {
  param(
    [string]$EnvironmentName,
    [string]$Name,
    [string]$Value
  )

  $null = Invoke-External -FilePath 'gh' -Arguments @('secret', 'set', $Name, '--env', $EnvironmentName, '--body', $Value)
}

function Remove-GhEnvSecretIfExists {
  param(
    [string]$EnvironmentName,
    [string]$Name
  )

  $result = Invoke-External -FilePath 'gh' -Arguments @('secret', 'delete', $Name, '--env', $EnvironmentName) -AllowFailure
  if ($result.ExitCode -ne 0) {
    # Secret might not exist; ignore.
  }
}

function Ensure-Ec2SecurityGroup {
  param(
    [string]$AwsCliPath,
    [string]$Profile,
    [string]$Region,
    [string]$VpcId,
    [string]$GroupName
  )

  $groups = Invoke-AwsJson -AwsCliPath $AwsCliPath -Profile $Profile -Region $Region -Arguments @(
    'ec2',
    'describe-security-groups',
    '--filters',
    "Name=vpc-id,Values=$VpcId",
    "Name=group-name,Values=$GroupName"
  )

  if ($groups.SecurityGroups.Count -gt 0) {
    $groupId = [string]$groups.SecurityGroups[0].GroupId
  } else {
    $create = Invoke-AwsJson -AwsCliPath $AwsCliPath -Profile $Profile -Region $Region -Arguments @(
      'ec2',
      'create-security-group',
      '--group-name', $GroupName,
      '--description', 'Daily Bible Verse bot deploy access',
      '--vpc-id', $VpcId
    )
    $groupId = [string]$create.GroupId

    $null = Invoke-External -FilePath $AwsCliPath -Arguments @(
      '--profile', $Profile,
      '--region', $Region,
      'ec2',
      'create-tags',
      '--resources', $groupId,
      '--tags',
      'Key=App,Value=DailyBibleVerseBot',
      'Key=ManagedBy,Value=codex'
    )
  }

  $ingress = Invoke-External -FilePath $AwsCliPath -Arguments @(
    '--profile', $Profile,
    '--region', $Region,
    'ec2',
    'authorize-security-group-ingress',
    '--group-id', $groupId,
    '--protocol', 'tcp',
    '--port', '22',
    '--cidr', '0.0.0.0/0'
  ) -AllowFailure

  if ($ingress.ExitCode -ne 0 -and (($ingress.Output | Out-String) -notmatch 'InvalidPermission\.Duplicate')) {
    throw "Failed to authorize SSH ingress on security group $groupId"
  }

  return $groupId
}

function Ensure-KeyPair {
  param(
    [string]$AwsCliPath,
    [string]$Profile,
    [string]$Region,
    [string]$KeyName,
    [string]$PublicKeyPath
  )

  $check = Invoke-External -FilePath $AwsCliPath -Arguments @(
    '--profile', $Profile,
    '--region', $Region,
    'ec2',
    'describe-key-pairs',
    '--key-names', $KeyName
  ) -AllowFailure

  if ($check.ExitCode -ne 0) {
    $null = Invoke-External -FilePath $AwsCliPath -Arguments @(
      '--profile', $Profile,
      '--region', $Region,
      'ec2',
      'import-key-pair',
      '--key-name', $KeyName,
      '--public-key-material', "fileb://$PublicKeyPath"
    )
  }
}

function Ensure-InstanceAndAddress {
  param(
    [string]$AwsCliPath,
    [string]$Profile,
    [string]$Region,
    [string]$EnvironmentName,
    [string]$AmiId,
    [string]$InstanceType,
    [string]$SubnetId,
    [string]$SecurityGroupId,
    [string]$KeyName,
    [string]$UserDataPath
  )

  $reservations = Invoke-AwsJson -AwsCliPath $AwsCliPath -Profile $Profile -Region $Region -Arguments @(
    'ec2',
    'describe-instances',
    '--filters',
    'Name=tag:App,Values=DailyBibleVerseBot',
    "Name=tag:Environment,Values=$EnvironmentName",
    'Name=instance-state-name,Values=pending,running,stopping,stopped'
  )

  $instance = $null
  foreach ($reservation in $reservations.Reservations) {
    foreach ($candidate in $reservation.Instances) {
      $instance = $candidate
      break
    }
    if ($instance) {
      break
    }
  }

  if (-not $instance) {
    $run = Invoke-AwsJson -AwsCliPath $AwsCliPath -Profile $Profile -Region $Region -Arguments @(
      'ec2',
      'run-instances',
      '--image-id', $AmiId,
      '--instance-type', $InstanceType,
      '--key-name', $KeyName,
      '--subnet-id', $SubnetId,
      '--security-group-ids', $SecurityGroupId,
      '--user-data', "file://$UserDataPath",
      '--tag-specifications',
      "ResourceType=instance,Tags=[{Key=Name,Value=daily-bible-verse-$EnvironmentName},{Key=App,Value=DailyBibleVerseBot},{Key=Environment,Value=$EnvironmentName},{Key=ManagedBy,Value=codex}]",
      '--count', '1'
    )
    $instanceId = [string]$run.Instances[0].InstanceId
  } else {
    $instanceId = [string]$instance.InstanceId
    $state = [string]$instance.State.Name
    $currentKeyName = [string]$instance.KeyName

    if ($currentKeyName -ne $KeyName) {
      $null = Invoke-External -FilePath $AwsCliPath -Arguments @(
        '--profile', $Profile,
        '--region', $Region,
        'ec2',
        'terminate-instances',
        '--instance-ids', $instanceId
      )
      $null = Invoke-External -FilePath $AwsCliPath -Arguments @(
        '--profile', $Profile,
        '--region', $Region,
        'ec2',
        'wait',
        'instance-terminated',
        '--instance-ids', $instanceId
      )

      $run = Invoke-AwsJson -AwsCliPath $AwsCliPath -Profile $Profile -Region $Region -Arguments @(
        'ec2',
        'run-instances',
        '--image-id', $AmiId,
        '--instance-type', $InstanceType,
        '--key-name', $KeyName,
        '--subnet-id', $SubnetId,
        '--security-group-ids', $SecurityGroupId,
        '--user-data', "file://$UserDataPath",
        '--tag-specifications',
        "ResourceType=instance,Tags=[{Key=Name,Value=daily-bible-verse-$EnvironmentName},{Key=App,Value=DailyBibleVerseBot},{Key=Environment,Value=$EnvironmentName},{Key=ManagedBy,Value=codex}]",
        '--count', '1'
      )
      $instanceId = [string]$run.Instances[0].InstanceId
      $state = 'pending'
    }

    if ($state -in @('stopped', 'stopping')) {
      $null = Invoke-External -FilePath $AwsCliPath -Arguments @(
        '--profile', $Profile,
        '--region', $Region,
        'ec2',
        'start-instances',
        '--instance-ids', $instanceId
      )
    }
  }

  $null = Invoke-External -FilePath $AwsCliPath -Arguments @(
    '--profile', $Profile,
    '--region', $Region,
    'ec2',
    'wait',
    'instance-running',
    '--instance-ids', $instanceId
  )

  $addresses = Invoke-AwsJson -AwsCliPath $AwsCliPath -Profile $Profile -Region $Region -Arguments @(
    'ec2',
    'describe-addresses',
    '--filters',
    'Name=tag:App,Values=DailyBibleVerseBot',
    "Name=tag:Environment,Values=$EnvironmentName"
  )

  $allocationId = $null
  if ($addresses.Addresses.Count -gt 0) {
    $allocationId = [string]$addresses.Addresses[0].AllocationId
  } else {
    $alloc = Invoke-AwsJson -AwsCliPath $AwsCliPath -Profile $Profile -Region $Region -Arguments @(
      'ec2',
      'allocate-address',
      '--domain', 'vpc'
    )
    $allocationId = [string]$alloc.AllocationId

    $null = Invoke-External -FilePath $AwsCliPath -Arguments @(
      '--profile', $Profile,
      '--region', $Region,
      'ec2',
      'create-tags',
      '--resources', $allocationId,
      '--tags',
      'Key=App,Value=DailyBibleVerseBot',
      "Key=Environment,Value=$EnvironmentName",
      'Key=ManagedBy,Value=codex'
    )
  }

  $null = Invoke-External -FilePath $AwsCliPath -Arguments @(
    '--profile', $Profile,
    '--region', $Region,
    'ec2',
    'associate-address',
    '--instance-id', $instanceId,
    '--allocation-id', $allocationId,
    '--allow-reassociation'
  )

  $address = Invoke-AwsJson -AwsCliPath $AwsCliPath -Profile $Profile -Region $Region -Arguments @(
    'ec2',
    'describe-addresses',
    '--allocation-ids', $allocationId
  )

  return @{
    InstanceId = $instanceId
    PublicIp = [string]$address.Addresses[0].PublicIp
  }
}

$awsCli = Get-AwsCliPath
$awsProfile = 'root'
$region = if ($env:AWS_REGION) { $env:AWS_REGION } else { 'us-east-1' }

$null = Invoke-External -FilePath 'gh' -Arguments @('auth', 'status')
$repo = (Invoke-External -FilePath 'gh' -Arguments @('repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner')).Output.ToString().Trim()
if (-not $repo) {
  throw 'Unable to resolve GitHub repository slug from gh CLI.'
}

$tokenFilePath = Join-Path $HOME 'Downloads\Bot Tokens.txt'
$configPath = Join-Path (Get-Location) 'cfg\config.json'
$tokens = Parse-Tokens -TokenFilePath $tokenFilePath -ConfigFilePath $configPath

$configJson = Get-Content $configPath -Raw | ConvertFrom-Json
$bibleApiUrl = [string]$configJson.bibleApiUrl
$translationApiUrl = [string]$configJson.translationApiUrl
$defaultTranslation = [string]$configJson.defaultTranslation
$logLevel = [string]$configJson.logLevel
if (-not $bibleApiUrl) { $bibleApiUrl = 'https://labs.bible.org/api/?type=json&passage=' }
if (-not $translationApiUrl) { $translationApiUrl = 'https://bible-api.com/' }
if (-not $defaultTranslation) { $defaultTranslation = 'web' }
if (-not $logLevel) { $logLevel = 'debug' }

$sshKeyPath = Join-Path $HOME '.ssh\dbv_github_actions_nopass'
$sshPubKeyPath = "$sshKeyPath.pub"
if (-not (Test-Path (Split-Path -Parent $sshKeyPath))) {
  New-Item -Path (Split-Path -Parent $sshKeyPath) -ItemType Directory -Force | Out-Null
}
if (-not (Test-Path $sshKeyPath) -or -not (Test-Path $sshPubKeyPath)) {
  # Create the deploy key without a passphrase so GitHub Actions can use it non-interactively.
  $null = Invoke-External -FilePath 'cmd.exe' -Arguments @('/c', 'ssh-keygen', '-t', 'ed25519', '-f', $sshKeyPath, '-C', 'github-actions-deploy', '-N', '""')
}

$keyPairName = 'daily-bible-verse-gha-nopass'
Ensure-KeyPair -AwsCliPath $awsCli -Profile $awsProfile -Region $region -KeyName $keyPairName -PublicKeyPath $sshPubKeyPath
$deploySshKey = (Get-Content $sshKeyPath -Raw).Trim()

$vpcId = Invoke-AwsText -AwsCliPath $awsCli -Profile $awsProfile -Region $region -Arguments @('ec2', 'describe-vpcs', '--filters', 'Name=isDefault,Values=true', '--query', 'Vpcs[0].VpcId')
if (-not $vpcId -or $vpcId -eq 'None') {
  throw 'No default VPC found. Create a VPC/Subnet and set automation script accordingly.'
}

$subnetId = Invoke-AwsText -AwsCliPath $awsCli -Profile $awsProfile -Region $region -Arguments @('ec2', 'describe-subnets', '--filters', "Name=vpc-id,Values=$vpcId", 'Name=default-for-az,Values=true', '--query', 'Subnets[0].SubnetId')
if (-not $subnetId -or $subnetId -eq 'None') {
  throw "No default subnet found in VPC $vpcId"
}

$sgId = Ensure-Ec2SecurityGroup -AwsCliPath $awsCli -Profile $awsProfile -Region $region -VpcId $vpcId -GroupName 'daily-bible-verse-bot-sg'

function Write-UserData {
  param([string]$EnvironmentName)

  $userDataPath = Join-Path $env:TEMP "dbv-user-data-$EnvironmentName.sh"
  $userDataContent = @(
    '#!/bin/bash'
    'set -euxo pipefail'
    'dnf update -y'
    'dnf install -y docker git'
    'systemctl enable docker'
    'systemctl start docker'
    'usermod -aG docker ec2-user || true'
    'mkdir -p /opt/daily-bible-verse-bot'
    'chown -R ec2-user:ec2-user /opt/daily-bible-verse-bot'
    'mkdir -p /opt/daily-bible-verse-bot/db /opt/daily-bible-verse-bot/logs/archive'
    'if ! command -v docker-compose >/dev/null 2>&1; then'
    '  curl -fsSL https://github.com/docker/compose/releases/download/v2.24.6/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose'
    '  chmod +x /usr/local/bin/docker-compose'
    'fi'
    "cat >/opt/daily-bible-verse-bot/.env <<'EOF'"
    "BIBLE_API_URL=$bibleApiUrl"
    "TRANSLATION_API_URL=$translationApiUrl"
    "DEFAULT_TRANSLATION=$defaultTranslation"
    "LOG_LEVEL=$logLevel"
    'EOF'
    'chown ec2-user:ec2-user /opt/daily-bible-verse-bot/.env'
  ) -join "`n"

  # EC2 user-data must not include a UTF-8 BOM, and LF newlines are safest for bash/cloud-init.
  [System.IO.File]::WriteAllText(
    $userDataPath,
    $userDataContent,
    (New-Object System.Text.UTF8Encoding($false))
  )

  return $userDataPath
}

$amiId = Invoke-AwsText -AwsCliPath $awsCli -Profile $awsProfile -Region $region -Arguments @('ssm', 'get-parameter', '--name', '/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64', '--query', 'Parameter.Value')
if (-not $amiId -or $amiId -eq 'None') {
  throw 'Failed to resolve Amazon Linux AMI ID from SSM public parameters.'
}

$prodUserData = Write-UserData -EnvironmentName 'production'
$canaryUserData = Write-UserData -EnvironmentName 'canary'

$prodInstance = Ensure-InstanceAndAddress -AwsCliPath $awsCli -Profile $awsProfile -Region $region -EnvironmentName 'production' -AmiId $amiId -InstanceType 't3.micro' -SubnetId $subnetId -SecurityGroupId $sgId -KeyName $keyPairName -UserDataPath $prodUserData
$canaryInstance = Ensure-InstanceAndAddress -AwsCliPath $awsCli -Profile $awsProfile -Region $region -EnvironmentName 'canary' -AmiId $amiId -InstanceType 't3.micro' -SubnetId $subnetId -SecurityGroupId $sgId -KeyName $keyPairName -UserDataPath $canaryUserData

Ensure-GitHubEnvironment -Repo $repo -EnvironmentName 'production'
Ensure-GitHubEnvironment -Repo $repo -EnvironmentName 'canary'

Set-GhEnvSecret -EnvironmentName 'production' -Name 'DEPLOY_HOST' -Value ([string]$prodInstance.PublicIp)
Set-GhEnvSecret -EnvironmentName 'production' -Name 'DEPLOY_USER' -Value 'ec2-user'
Set-GhEnvSecret -EnvironmentName 'production' -Name 'DEPLOY_PATH' -Value '/opt/daily-bible-verse-bot'
Set-GhEnvSecret -EnvironmentName 'production' -Name 'DEPLOY_PORT' -Value '22'
Set-GhEnvSecret -EnvironmentName 'production' -Name 'DEPLOY_SSH_KEY' -Value $deploySshKey
Set-GhEnvSecret -EnvironmentName 'production' -Name 'BOT_TOKEN' -Value $tokens.Prod

Set-GhEnvSecret -EnvironmentName 'canary' -Name 'DEPLOY_HOST' -Value ([string]$canaryInstance.PublicIp)
Set-GhEnvSecret -EnvironmentName 'canary' -Name 'DEPLOY_USER' -Value 'ec2-user'
Set-GhEnvSecret -EnvironmentName 'canary' -Name 'DEPLOY_PATH' -Value '/opt/daily-bible-verse-bot'
Set-GhEnvSecret -EnvironmentName 'canary' -Name 'DEPLOY_PORT' -Value '22'
Set-GhEnvSecret -EnvironmentName 'canary' -Name 'DEPLOY_SSH_KEY' -Value $deploySshKey
Set-GhEnvSecret -EnvironmentName 'canary' -Name 'BOT_TOKEN' -Value $tokens.Canary

Remove-GhEnvSecretIfExists -EnvironmentName 'production' -Name 'AWS_REGION'
Remove-GhEnvSecretIfExists -EnvironmentName 'production' -Name 'AWS_DEPLOY_ROLE_ARN'
Remove-GhEnvSecretIfExists -EnvironmentName 'production' -Name 'BOT_TOKEN_PARAMETER_NAME'
Remove-GhEnvSecretIfExists -EnvironmentName 'canary' -Name 'AWS_REGION'
Remove-GhEnvSecretIfExists -EnvironmentName 'canary' -Name 'AWS_DEPLOY_ROLE_ARN'
Remove-GhEnvSecretIfExists -EnvironmentName 'canary' -Name 'BOT_TOKEN_PARAMETER_NAME'

if ($env:DISCORD_DEPLOY_WEBHOOK_URL) {
  Set-GhEnvSecret -EnvironmentName 'production' -Name 'DISCORD_DEPLOY_WEBHOOK_URL' -Value $env:DISCORD_DEPLOY_WEBHOOK_URL
  Set-GhEnvSecret -EnvironmentName 'canary' -Name 'DISCORD_DEPLOY_WEBHOOK_URL' -Value $env:DISCORD_DEPLOY_WEBHOOK_URL
}

Write-Host 'EC2 deployment bootstrap complete.'
Write-Host "Repository: $repo"
Write-Host "Region: $region"
Write-Host "Production instance: $($prodInstance.InstanceId) / $($prodInstance.PublicIp)"
Write-Host "Canary instance: $($canaryInstance.InstanceId) / $($canaryInstance.PublicIp)"
