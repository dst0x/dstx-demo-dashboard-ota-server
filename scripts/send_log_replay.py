#!/usr/bin/env python3
"""
Replay serial log file ke endpoint /api/serial/logs.
Usage:
    python3 send_log_replay.py [log_file] [--devid DEVID] [--url URL] [--token TOKEN] [--delay SECONDS]
"""

import re
import sys
import time
import argparse
import urllib.request
import urllib.error
import json

LOG_PATTERN = re.compile(
    r'^\[(\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2})\]\s+(INFO|WARN|WARNING|ERROR|DEBUG):\s+(.+)$'
)

LEVEL_MAP = {
    'INFO':    'info',
    'WARN':    'warn',
    'WARNING': 'warn',
    'ERROR':   'error',
    'DEBUG':   'debug',
}


def parse_lines(path):
    entries = []
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            line = line.rstrip('\n').rstrip('\r')
            m = LOG_PATTERN.match(line)
            if m:
                _, raw_level, message = m.groups()
                entries.append({
                    'level':   LEVEL_MAP.get(raw_level, 'info'),
                    'message': message,
                })
    return entries


def send_log(url, token, devid, level, message):
    payload = json.dumps({
        'devid':   devid,
        'level':   level,
        'message': message,
    }).encode('utf-8')

    req = urllib.request.Request(
        url,
        data=payload,
        method='POST',
        headers={
            'Content-Type': 'application/json',
            'X-Device-Token': token,
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, None
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        return e.code, body
    except Exception as e:
        return None, str(e)


def main():
    parser = argparse.ArgumentParser(description='Replay serial log file to OTA server')
    parser.add_argument('log_file', nargs='?', default='example.txt',
                        help='Path ke file log (default: example.txt)')
    parser.add_argument('--devid',  default='MTI-AWS2K26MT1',
                        help='Device ID (default: MTI-AWS2K26MT1)')
    parser.add_argument('--url',    default='http://localhost:3100/api/serial/logs',
                        help='Endpoint URL')
    parser.add_argument('--token',  default='f7077ffcce8745c4f9ba676b02959196270f69fab1b49e124173e71848b3cd96',
                        help='X-Device-Token')
    parser.add_argument('--delay',  type=float, default=0.05,
                        help='Jeda antar request dalam detik (default: 0.05)')
    args = parser.parse_args()

    entries = parse_lines(args.log_file)
    if not entries:
        print(f'Tidak ada baris log yang valid di "{args.log_file}"')
        sys.exit(1)

    print(f'Mengirim {len(entries)} baris log dari "{args.log_file}"')
    print(f'  devid : {args.devid}')
    print(f'  url   : {args.url}')
    print(f'  delay : {args.delay}s\n')

    ok = fail = 0
    for i, entry in enumerate(entries, 1):
        status, err = send_log(
            url=args.url,
            token=args.token,
            devid=args.devid,
            level=entry['level'],
            message=entry['message'],
        )

        if status == 202:
            ok += 1
            print(f'[{i:4d}/{len(entries)}] OK     {entry["level"].upper():5s}  {entry["message"][:80]}')
        else:
            fail += 1
            detail = err or ''
            print(f'[{i:4d}/{len(entries)}] GAGAL  {status}  {detail[:60]}  | {entry["message"][:60]}')

        time.sleep(args.delay)

    print(f'\nSelesai: {ok} berhasil, {fail} gagal dari total {len(entries)} baris.')


if __name__ == '__main__':
    main()
