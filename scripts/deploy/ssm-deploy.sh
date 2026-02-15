#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  ssm-deploy.sh --environment <canary|production> --github-repo <owner/repo> --release-tag <tag> --token-parameter <ssm param name> [--deploy-root <path>] [--git-sha <sha>]

Notes:
  - Runs on the EC2 instance via SSM RunCommand as root.
  - Does NOT accept or print the bot token. It pulls BOT_TOKEN from SSM Parameter Store.
  - Deploys into:
      <deploy-root>/
        .env (non-secret runtime defaults; persistent)
        db/   (persistent)
        logs/ (persistent)
        app/  (current code + docker-compose file; replaced each deploy)
USAGE
}

deploy_root="/opt/daily-bible-verse-bot"
environment=""
github_repo=""
release_tag=""
git_sha=""
token_parameter=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --deploy-root)
      deploy_root="$2"
      shift 2
      ;;
    --environment)
      environment="$2"
      shift 2
      ;;
    --github-repo)
      github_repo="$2"
      shift 2
      ;;
    --release-tag)
      release_tag="$2"
      shift 2
      ;;
    --git-sha)
      git_sha="$2"
      shift 2
      ;;
    --token-parameter)
      token_parameter="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "${environment}" || -z "${github_repo}" || -z "${release_tag}" || -z "${token_parameter}" ]]; then
  echo "Missing required arguments." >&2
  usage >&2
  exit 2
fi

if [[ "${environment}" != "canary" && "${environment}" != "production" ]]; then
  echo "Invalid environment: ${environment}" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
artifact_root="$(cd "${script_dir}/../.." && pwd)"

echo "Deploying DailyBibleVerseBot"
echo "  environment:  ${environment}"
echo "  github_repo:   ${github_repo}"
echo "  release_tag:   ${release_tag}"
echo "  git_sha:       ${git_sha:-unknown}"
echo "  deploy_root:   ${deploy_root}"
echo "  artifact_root: ${artifact_root}"

aws_region="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
echo "  aws_region:    ${aws_region}"

container_name="daily-bible-verse-bot"
project_name="daily-bible-verse-bot"

release_tag_file="${deploy_root}/.release_tag"
previous_release_tag=""
if [[ -f "${release_tag_file}" ]]; then
  previous_release_tag="$(tr -d '\r' < "${release_tag_file}" | head -n 1 | xargs || true)"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found on instance. Install Docker first." >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker compose --project-name "${project_name}")
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker-compose -p "${project_name}")
else
  echo "Docker Compose not found on instance." >&2
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI not found; installing (dnf install -y awscli)..."
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y awscli >/dev/null
  else
    echo "dnf not found; cannot install awscli automatically." >&2
    exit 1
  fi
fi

compose_cmd() {
  local app_dir="$1"
  shift
  (cd "${app_dir}" && "${DOCKER_COMPOSE[@]}" -f docker-compose.prod.yml "$@")
}

mkdir -p "${deploy_root}/db" "${deploy_root}/logs/archive"

# Persistent non-secret runtime config lives at <deploy_root>/.env
if [[ ! -f "${deploy_root}/.env" ]]; then
  log_level="info"
  if [[ "${environment}" = "canary" ]]; then
    log_level="debug"
  fi

  cat > "${deploy_root}/.env" <<EOF
# Non-secret runtime settings. Secrets should NOT live in this file.
BIBLE_API_URL=https://labs.bible.org/api/?type=json&passage=
TRANSLATION_API_URL=https://bible-api.com/
DEFAULT_TRANSLATION=web
LOG_LEVEL=${log_level}
EOF
  chmod 0600 "${deploy_root}/.env"
fi

# docker compose needs BOT_TOKEN present even for `down` because the compose file uses
# `${BOT_TOKEN:?…}` interpolation. Export early so stop/start are both idempotent.
echo "Fetching bot token from Parameter Store: ${token_parameter}"
bot_token="$(
  aws ssm get-parameter \
    --region "${aws_region}" \
    --name "${token_parameter}" \
    --with-decryption \
    --query "Parameter.Value" \
    --output text
)"

if [[ -z "${bot_token}" || "${bot_token}" = "None" ]]; then
  echo "BOT_TOKEN parameter is empty or missing." >&2
  exit 1
fi

export BOT_TOKEN="${bot_token}"
export DEPLOY_ENVIRONMENT="${environment}"
export GIT_SHA="${git_sha:-unknown}"
export RELEASE_TAG="${release_tag}"
export DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Always-on #bot-logs in both canary + production. The bot's Discord log sink
# is guarded by batching + a circuit breaker (`js/services/devBotLogs.js`),
# so Discord posting failures won't crash the process.
export DEV_LOGGING_ENABLED="${DEV_LOGGING_ENABLED:-true}"

# Optional: help status embeds match GitHub Release timestamps even if the runtime can't read JSON.
build_time=""
if [[ -f "${artifact_root}/build/version.json" ]] && command -v python3 >/dev/null 2>&1; then
  build_time="$(
    python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('builtAt',''))" "${artifact_root}/build/version.json" 2>/dev/null || true
  )"
fi
if [[ -n "${build_time}" ]]; then
  export BUILD_TIME="${build_time}"
fi

app_next="${deploy_root}/app.next"
app_current="${deploy_root}/app"
app_prev="${deploy_root}/app.prev"

rollback_enabled="false"

rollback() {
  if [[ "${rollback_enabled}" != "true" ]]; then
    return
  fi

  echo "ERROR: deployment failed. Attempting rollback..." >&2

  local rollback_dir=""
  if [[ -f "${app_prev}/docker-compose.prod.yml" ]]; then
    rollback_dir="${app_prev}"
  elif [[ -f "${app_current}/docker-compose.prod.yml" ]]; then
    rollback_dir="${app_current}"
  fi

  if [[ -z "${rollback_dir}" ]]; then
    echo "Rollback not possible: no previous compose file found." >&2
    return
  fi

  # Ensure the fixed container name doesn't block rollback.
  if docker inspect "${container_name}" >/dev/null 2>&1; then
    docker rm -f "${container_name}" >/dev/null 2>&1 || true
  fi

  export DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if [[ -n "${previous_release_tag}" ]]; then
    export RELEASE_TAG="${previous_release_tag}"
    echo "Rolling back to previous release tag: ${previous_release_tag}" >&2
    compose_cmd "${rollback_dir}" up -d --remove-orphans || true
  else
    echo "No previous release tag recorded; rebuilding rollback image from source." >&2
    compose_cmd "${rollback_dir}" up -d --build --remove-orphans || true
  fi

  compose_cmd "${rollback_dir}" ps || true

  echo "Rollback attempt completed. Inspect container logs for details:"
  docker logs --tail 200 "${container_name}" 2>&1 || true
}

on_exit() {
  exit_code=$?
  if [[ "${exit_code}" -ne 0 ]]; then
    echo "Deploy failed with exit code ${exit_code}." >&2
    rollback || true
  fi
}

trap on_exit EXIT

rm -rf "${app_next}"
mkdir -p "${app_next}"

cp -a "${artifact_root}/." "${app_next}/"

# Keep the app directory clean of persistent paths. docker-compose.prod.yml mounts
# ../db and ../logs and reads ../.env from the deploy root.
rm -rf "${app_next}/db" "${app_next}/logs" "${app_next}/.env"

compose_file="${app_next}/docker-compose.prod.yml"
if [[ ! -f "${compose_file}" ]]; then
  echo "Missing docker-compose.prod.yml in artifact." >&2
  exit 1
fi

# Build the next image before stopping the current container. This keeps downtime minimal and
# avoids taking the bot offline if the build fails.
echo "Building next image for release ${release_tag} (no downtime)..."
compose_cmd "${app_next}" build

# Stop the running service (if any) before swapping code directories.
if [[ -f "${app_current}/docker-compose.prod.yml" ]]; then
  rollback_enabled="true"
  echo "Stopping existing service..."
  compose_cmd "${app_current}" down --remove-orphans || true
fi

# Extra safety: ensure the fixed container name doesn't block re-deploys if compose
# couldn't parse due to missing env vars in a previous run.
if docker inspect "${container_name}" >/dev/null 2>&1; then
  echo "Removing existing container ${container_name}..."
  docker rm -f "${container_name}" || true
fi

rm -rf "${app_prev}"
if [[ -d "${app_current}" ]]; then
  mv "${app_current}" "${app_prev}"
fi
mv "${app_next}" "${app_current}"

echo "Starting service..."
compose_cmd "${app_current}" up -d --remove-orphans
compose_cmd "${app_current}" ps

if ! docker inspect "${container_name}" >/dev/null 2>&1; then
  echo "Expected container ${container_name} not found after deploy." >&2
  exit 1
fi

echo "Waiting for Discord connect message..."
deadline=$((SECONDS + 150))
while (( SECONDS < deadline )); do
  running="$(docker inspect -f '{{.State.Running}}' "${container_name}" 2>/dev/null || true)"
  if [[ "${running}" != "true" ]]; then
    echo "Container is not running. Recent logs:" >&2
    docker logs --tail 200 "${container_name}" >&2 || true
    exit 1
  fi

  if docker logs --tail 300 "${container_name}" 2>&1 | grep -q "Logged in as"; then
    echo "Smoke test passed: bot logged in."
    break
  fi

  if docker logs --tail 300 "${container_name}" 2>&1 | grep -q "Bot failed to start"; then
    echo "Bot failed to start. Recent logs:" >&2
    docker logs --tail 200 "${container_name}" >&2 || true
    exit 1
  fi

  sleep 5
done

if (( SECONDS >= deadline )); then
  echo "Timed out waiting for 'Logged in as' in container logs." >&2
  docker logs --tail 200 "${container_name}" >&2 || true
  exit 1
fi

echo "Recording last successful release tag to ${release_tag_file}..."
printf '%s\n' "${release_tag}" > "${release_tag_file}"
chmod 0644 "${release_tag_file}" || true

echo "Pruning unused Docker images..."
# Since we tag images by release, explicitly remove older tags to avoid filling the disk.
keep_tags=("${release_tag}")
if [[ -n "${previous_release_tag}" ]]; then
  keep_tags+=("${previous_release_tag}")
fi

echo "Keeping docker images for tags: ${keep_tags[*]}"
while IFS= read -r tag; do
  if [[ -z "${tag}" || "${tag}" = "<none>" ]]; then
    continue
  fi

  keep="false"
  for keep_tag in "${keep_tags[@]}"; do
    if [[ "${tag}" = "${keep_tag}" ]]; then
      keep="true"
      break
    fi
  done

  if [[ "${keep}" = "true" ]]; then
    continue
  fi

  echo "Removing old image daily-bible-verse-bot:${tag}..."
  docker image rm -f "daily-bible-verse-bot:${tag}" >/dev/null 2>&1 || true
done < <(docker images --format '{{.Tag}}' daily-bible-verse-bot 2>/dev/null | sort -u)

docker image prune -f >/dev/null || true

echo "Deploy finished successfully."

