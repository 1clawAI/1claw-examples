#!/usr/bin/env bash
# Create minimal IAM user + S3 bucket for execution-intents real-s3 / real-aws-sdk smokes.
# Requires an AWS profile with iam:* and s3:CreateBucket (e.g. admin). Does NOT commit secrets.
#
# Usage:
#   AWS_PROFILE=your-admin-profile ./setup-aws-exec-test.sh
#   ./setup-aws-exec-test.sh --write-env   # append EXEC_S3_* / EXEC_AWS_* to .env (mode 0600)
#
# Policy: sts:GetCallerIdentity + s3:ListBucket/HeadBucket/GetObject on the dedicated bucket only.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ONECLAW_ENV_FILE:-$ROOT/.env}"
WRITE_ENV=0
if [[ "${1:-}" == "--write-env" ]]; then
  WRITE_ENV=1
fi

PROFILE="${AWS_PROFILE:-default}"
REGION="${AWS_REGION:-us-east-1}"
IAM_USER="${EXEC_TEST_IAM_USER:-1claw-exec-intents-test}"
RANDOM_SUFFIX="$(openssl rand -hex 4)"
BUCKET="${EXEC_S3_BUCKET:-1claw-exec-test-${RANDOM_SUFFIX}}"

echo "Using AWS profile: $PROFILE region: $REGION"
aws sts get-caller-identity --profile "$PROFILE" >/dev/null

echo "Creating bucket s3://${BUCKET} ..."
if aws s3api head-bucket --bucket "$BUCKET" --profile "$PROFILE" 2>/dev/null; then
  echo "Bucket already exists, reusing."
else
  if [[ "$REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$BUCKET" --profile "$PROFILE"
  else
    aws s3api create-bucket --bucket "$BUCKET" --profile "$PROFILE" \
      --create-bucket-configuration "LocationConstraint=$REGION"
  fi
fi

POLICY_NAME="${IAM_USER}-exec-smoke-policy"
POLICY_DOC="$(mktemp)"
cat > "$POLICY_DOC" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "StsGetCallerIdentity",
      "Effect": "Allow",
      "Action": ["sts:GetCallerIdentity"],
      "Resource": "*"
    },
    {
      "Sid": "S3ListTestBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:HeadBucket"],
      "Resource": "arn:aws:s3:::${BUCKET}"
    },
    {
      "Sid": "S3GetTestObjects",
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::${BUCKET}/*"
    }
  ]
}
EOF

if ! aws iam get-user --user-name "$IAM_USER" --profile "$PROFILE" >/dev/null 2>&1; then
  echo "Creating IAM user $IAM_USER ..."
  aws iam create-user --user-name "$IAM_USER" --profile "$PROFILE" >/dev/null
else
  echo "IAM user $IAM_USER already exists."
fi

POLICY_ARN="arn:aws:iam::$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text):policy/${POLICY_NAME}"
if ! aws iam get-policy --policy-arn "$POLICY_ARN" --profile "$PROFILE" >/dev/null 2>&1; then
  aws iam create-policy --policy-name "$POLICY_NAME" --policy-document "file://${POLICY_DOC}" --profile "$PROFILE" >/dev/null
else
  echo "Updating inline policy document on managed policy $POLICY_NAME ..."
  VERSION=$(aws iam create-policy-version --policy-arn "$POLICY_ARN" \
    --policy-document "file://${POLICY_DOC}" --set-as-default --profile "$PROFILE" \
    --query 'PolicyVersion.VersionId' --output text)
  echo "Policy version: $VERSION"
fi

aws iam attach-user-policy --user-name "$IAM_USER" --policy-arn "$POLICY_ARN" --profile "$PROFILE" 2>/dev/null || true

KEY_JSON="$(aws iam create-access-key --user-name "$IAM_USER" --profile "$PROFILE" --output json)"
ACCESS_KEY_ID="$(echo "$KEY_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['AccessKey']['AccessKeyId'])")"
SECRET_ACCESS_KEY="$(echo "$KEY_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['AccessKey']['SecretAccessKey'])")"
rm -f "$POLICY_DOC"

echo ""
echo "Created / updated:"
echo "  S3 bucket: $BUCKET"
echo "  IAM user:  $IAM_USER"
echo "  IAM policy: $POLICY_NAME (ListBucket, GetObject, HeadBucket on test bucket + sts:GetCallerIdentity)"
echo ""
echo "Set in examples/execution-intents/.env:"
echo "  EXEC_S3_ACCESS_KEY_ID=<access key>"
echo "  EXEC_S3_SECRET_ACCESS_KEY=<secret>"
echo "  EXEC_S3_BUCKET=$BUCKET"
echo "  EXEC_S3_REGION=$REGION"
echo "  EXEC_AWS_ACCESS_KEY_ID=<same as S3>"
echo "  EXEC_AWS_SECRET_ACCESS_KEY=<same as S3>"
echo "  EXEC_AWS_REGION=$REGION"

if [[ "$WRITE_ENV" -eq 1 ]]; then
  touch "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  upsert() {
    local key="$1" val="$2"
    if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
      python3 - <<PY
import re, pathlib
p = pathlib.Path("$ENV_FILE")
text = p.read_text()
key = "$key"
val = """$val"""
text = re.sub(rf'^{re.escape(key)}=.*$', f'{key}={val}', text, flags=re.M)
p.write_text(text)
PY
    else
      printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
    fi
  }
  upsert EXEC_S3_ACCESS_KEY_ID "$ACCESS_KEY_ID"
  upsert EXEC_S3_SECRET_ACCESS_KEY "$SECRET_ACCESS_KEY"
  upsert EXEC_S3_BUCKET "$BUCKET"
  upsert EXEC_S3_REGION "$REGION"
  upsert EXEC_AWS_ACCESS_KEY_ID "$ACCESS_KEY_ID"
  upsert EXEC_AWS_SECRET_ACCESS_KEY "$SECRET_ACCESS_KEY"
  upsert EXEC_AWS_REGION "$REGION"
  echo "Wrote credentials to $ENV_FILE (not printed)."
fi
