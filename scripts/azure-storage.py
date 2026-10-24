"""Provision only Evala's private LRS account store. Dry run unless --apply is set."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('evala_deploy', ROOT / 'scripts' / 'azure-deploy.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    account = json.loads(deploy.cli('account', 'show', '--output', 'json'))
    if account['id'] != 'eee9e445-b08a-4d02-b1f6-955e67492164':
        raise ValueError('Unexpected subscription')
    name = 'evalachess' + hashlib.sha256(account['id'].encode()).hexdigest()[:10]
    existing = json.loads(deploy.cli('storage', 'account', 'list', '--resource-group', 'evala-chess', '--output', 'json'))
    found = next((item for item in existing if item['name'] == name), None)
    print(json.dumps({'storageAccount': name, 'resourceGroup': 'evala-chess', 'region': 'germanywestcentral', 'sku': 'Standard_LRS', 'publicBlobAccess': False, 'exists': bool(found), 'apply': args.apply}))
    if not args.apply:
        return
    if not found:
        deploy.cli('storage', 'account', 'create', '--name', name, '--resource-group', 'evala-chess', '--location', 'germanywestcentral', '--sku', 'Standard_LRS', '--kind', 'StorageV2', '--https-only', 'true', '--allow-blob-public-access', 'false', '--min-tls-version', 'TLS1_2', '--output', 'none')
    connection = json.loads(deploy.cli('storage', 'account', 'show-connection-string', '--name', name, '--resource-group', 'evala-chess', '--output', 'json'))['connectionString']
    private = ROOT / '.local-data' / 'deployment'
    private.mkdir(parents=True, exist_ok=True)
    target = private / 'account-storage-connection.txt'
    target.write_text(connection, encoding='utf8')
    target.chmod(0o600)
    (private / 'account-storage.json').write_text(json.dumps({'name': name, 'resourceGroup': 'evala-chess', 'container': 'evala-accounts', 'sku': 'Standard_LRS'}, indent=2), encoding='utf8')
    print('Private account storage is ready. Connection string saved locally, never printed.')

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
