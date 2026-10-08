# iFleetPro Production Credential Rotation & Database Isolation Runbook

## Scope

This runbook rotates production database and deployment-webhook credentials, removes broad database exposure, creates a separate non-production database identity, and verifies rollback without committing any secret value.

**Live application checkout:** `/home/lightworld/webapps/ifleetpro`

## Safety rules

- Never paste credentials into shell history, source files, Git commits, issue comments, or chat logs.
- Generate credentials on the authorized server and write them directly to root/application-readable secret files or environment storage.
- Take a verified database backup before changing grants, passwords, firewall rules, or application environment configuration.
- Keep the old application process running until the replacement credentials have been tested from a separate shell.
- Do not remove the old DB identity until the application is healthy with the new identity.
- Do not close TCP/3306 until every legitimate external consumer has been identified or migrated.

## 1. Preflight

1. Record the current Git commit and application process status.
2. Confirm the live `.env` exists and is not tracked by Git. Do not print its values.
3. Confirm the database service is healthy.
4. Confirm the application homepage, login endpoint, trip list, and one authenticated read endpoint are healthy.
5. Record current firewall/database exposure without copying credentials into the runbook.

Suggested checks:

```bash
cd /home/lightworld/webapps/ifleetpro
git rev-parse HEAD
pm2 status
systemctl is-active mariadb || systemctl is-active mysql
curl -fsS -o /dev/null -w '%{http_code}\n' https://ifleetpro.lightworldtech.com/
```

## 2. Backup and rollback checkpoint

Create a timestamped database dump in a root/application backup directory with mode `0600`. Use an option file or interactive credential source so the password is not visible in the process list or shell history.

```bash
BACKUP_DIR=/home/lightworld/backups/ifleetpro
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 0700 "$BACKUP_DIR"
# Use the server's protected MariaDB option file / authenticated admin context.
mariadb-dump --single-transaction --routines --triggers ifleetpro_data > "$BACKUP_DIR/ifleetpro_data-$STAMP.sql"
chmod 0600 "$BACKUP_DIR/ifleetpro_data-$STAMP.sql"
test -s "$BACKUP_DIR/ifleetpro_data-$STAMP.sql"
```

Rollback checkpoint must include:

- current application commit;
- backup path and successful non-empty check;
- old DB identity name (not password);
- old webhook key ID/name (not secret);
- current firewall/grant policy summary.

## 3. Create replacement production DB identity

Create a new least-privilege application account from the local/admin MariaDB session. Generate the password on the server and keep it out of command history. Grant only the privileges the application requires on `ifleetpro_data`.

Target policy:

- application connects from localhost/private app host only;
- no broad host wildcard grant;
- no global privileges;
- no grant option;
- administrative access uses a separate admin identity.

Before changing the application, verify the new identity can connect to `ifleetpro_data` and can perform the application's required read/write operations.

## 4. Rotate application database configuration

1. Back up the current live `.env` as a root-readable `0600` file.
2. Update only `DATABASE_URL` to the replacement production identity.
3. Ensure `ALLOW_PRODUCTION_DB_IN_DEV` is absent/false in all non-production environments.
4. Restart only the iFleetPro application process.
5. Verify homepage/login plus authenticated trip read and a controlled reversible write.
6. Confirm logs show no authentication/permission failures.

Do not delete the old DB account yet.

## 5. Rotate deployment webhook credential

1. Generate a new high-entropy webhook secret on the authorized server.
2. Update the local webhook receiver configuration without printing the secret.
3. Update the matching GitHub webhook secret through the authorized GitHub settings workflow.
4. Restart/reload the webhook receiver.
5. Send one signed test delivery and confirm it is accepted.
6. Confirm a request signed with the superseded secret is rejected.

Never store the webhook secret in this repository.

## 6. Create isolated non-production database

Create a separate database and least-privilege identity for development/staging, for example:

- database: `ifleetpro_staging` / `ifleetpro_dev`;
- identity: dedicated non-production app user;
- no access to `ifleetpro_data`;
- reachable only from the intended local/private source.

Configure local/staging `.env` with the non-production URL. Verify the Phase 0 database guard refuses the known production target in non-production mode unless the explicit break-glass variable is supplied.

## 7. Restrict database network exposure

After inventorying legitimate consumers:

1. Replace broad `%` grants with localhost/private-source-specific grants.
2. Prefer MariaDB bound to loopback/private interface when the application is local.
3. Remove public TCP/3306 from firewalld if no approved external consumer requires it.
4. If an external admin path is required, use an allowlisted private/VPN/SSH-tunnel path rather than world-open access.
5. Re-check MariaDB listeners and firewall rules after reload.

## 8. Retire superseded credentials

Only after production and non-production checks pass:

1. revoke/drop the old application DB identity or old password;
2. verify the old DB credential can no longer authenticate;
3. verify the old webhook secret is rejected;
4. remove obsolete protected backup `.env` files once the rollback window closes;
5. retain the database dump per backup policy.

## 9. Verification checklist

Production:

- homepage and login healthy;
- authenticated trip list works;
- controlled create/update path works;
- background/scheduler jobs show no DB permission errors;
- deployment webhook accepts only the new signature;
- old DB credential fails;
- public TCP/3306 is closed or explicitly justified/allowlisted.

Non-production:

- connects to a separate DB name/identity;
- cannot connect to production with its own grants;
- `ALLOW_PRODUCTION_DB_IN_DEV` is false/absent by default;
- test/lint/build/security scan remain green.

## 10. Rollback

If the new DB identity causes application failure before the old identity is retired:

1. restore the protected pre-rotation `.env`;
2. restart only iFleetPro;
3. verify health;
4. keep the database dump untouched;
5. investigate the missing privilege before attempting rotation again.

If firewall/grant tightening blocks a legitimate consumer, restore only the minimum required source-specific access; do not restore world-open database exposure.

If webhook rotation fails, restore the prior webhook receiver configuration and matching GitHub secret only until a corrected rotation can be performed, then invalidate the superseded secret again.

## Audit record

Record timestamps, operator identity, non-secret credential key/account names, backup path, verification results, and any rollback action in the operational audit log. Never record credential values.
