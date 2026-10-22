"""Stop the browser suite when the Python packages it builds fixtures with are not the pinned ones.

tests/e2e/requirements.txt pins each package exactly (CI installs those). A machine that already had an older
copy, such as a Pillow below 13.0.0 with its published security advisories, would otherwise build the fixtures
with it without saying so. Usage: python3 check_requirements.py [requirements.txt]. Exit 2 lists what differs."""
import re
import sys
from importlib.metadata import PackageNotFoundError, version

path = sys.argv[1] if len(sys.argv) > 1 else 'requirements.txt'
bad = []
for line in open(path, encoding='utf-8'):
    m = re.match(r'^\s*([A-Za-z0-9_.\-]+)==([^\s#;]+)', line)
    if not m:
        continue
    name, want = m.groups()
    try:
        have = version(name)
    except PackageNotFoundError:
        have = None
    if have != want:
        bad.append(f'{name}: pinned {want}, installed {have or "none"}')
if bad:
    print('The browser suite needs the pinned fixture packages:\n  ' + '\n  '.join(bad)
          + f'\nInstall them with: python3 -m pip install -r {path}', file=sys.stderr)
    sys.exit(2)
