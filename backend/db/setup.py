#!/usr/bin/env python3
"""Apply/check the schema using psql; never print a credential-bearing URL."""

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
from urllib.parse import parse_qs, unquote, urlsplit


DB_DIR = Path(__file__).resolve().parent
PROJECT_DIR = DB_DIR.parent.parent


def connection_environment(env_file: Path) -> dict[str, str]:
    values = {}
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.removeprefix('export ').split('=', 1)
        value = value.strip()
        if len(value) >= 2 and value[0] in ('"', "'") and value[-1] == value[0]:
            value = value[1:-1]
        values[key.strip()] = value
    raw = values.get('TIGER_DATA_CONNECTION_STRING') or values.get('DATABASE_URL')
    if not raw:
        raise ValueError('No database connection setting found in the environment file.')
    parsed = urlsplit(raw)
    if (parsed.scheme not in ('postgres', 'postgresql') or not parsed.hostname
            or not parsed.username or not parsed.password or not parsed.path.strip('/')):
        raise ValueError('Database connection setting is incomplete.')
    options = parse_qs(parsed.query)
    sslmode = options.get('sslmode', ['require'])[0]
    if sslmode not in ('require', 'verify-ca', 'verify-full'):
        raise ValueError('Use an SSL-enabled connection setting.')
    env = os.environ.copy()
    # Prevent ambient PostgreSQL options from redirecting this connection.
    for name in list(env):
        if name.startswith('PG'):
            env.pop(name)
    env.update(
        PGHOST=parsed.hostname,
        PGPORT=str(parsed.port or 5432),
        PGDATABASE=unquote(parsed.path.lstrip('/')),
        PGUSER=unquote(parsed.username),
        PGPASSWORD=unquote(parsed.password),
        PGSSLMODE=sslmode,
        PGCONNECT_TIMEOUT='10',
        PGAPPNAME='language-learning-db-setup',
    )
    if 'sslrootcert' in options:
        env['PGSSLROOTCERT'] = options['sslrootcert'][0]
    return env


def find_psql() -> str:
    found = shutil.which('psql')
    if found:
        return found
    for candidate in ('/opt/homebrew/opt/libpq/bin/psql',
                      '/usr/local/opt/libpq/bin/psql'):
        if Path(candidate).is_file():
            return candidate
    raise ValueError('psql is missing. Install the PostgreSQL client or add it to PATH.')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('check', 'apply', 'verify'))
    parser.add_argument('--env-file', type=Path, default=PROJECT_DIR / '.env')
    args = parser.parse_args()
    try:
        env = connection_environment(args.env_file)
        cmd = [find_psql(), '-X', '--no-password', '-v', 'ON_ERROR_STOP=1']
        if args.action == 'check':
            env['PGOPTIONS'] = '-c default_transaction_read_only=on'
            cmd += ['-c', "SELECT current_database(), current_setting('server_version'); "
                    "SELECT extname, extversion FROM pg_extension WHERE extname='timescaledb'; "
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema='public' ORDER BY table_name;"]
        elif args.action == 'apply':
            cmd += ['--single-transaction', '-f', str(DB_DIR / 'schema.sql')]
        else:
            # verify.sql controls its own transaction and rolls back all fixtures.
            cmd += ['-f', str(DB_DIR / 'verify.sql')]
        result = subprocess.run(cmd, env=env, text=True, capture_output=True, timeout=120)
        output = result.stdout + result.stderr
        for sensitive in (env['PGPASSWORD'], env['PGHOST'], env['PGUSER']):
            output = output.replace(sensitive, '[redacted]')
        print(output, end='')
        return result.returncode
    except subprocess.TimeoutExpired:
        print('Database operation timed out. Inspect server state before retrying.', file=sys.stderr)
    except (OSError, ValueError):
        # Do not echo parser/OS exception text that might contain connection values.
        print('Setup could not start. Check the environment file, SSL setting, and psql installation.',
              file=sys.stderr)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
