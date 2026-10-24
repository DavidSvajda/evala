"""Deploy the tested public image using the project's authenticated Azure CLI."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
PRIVATE = ROOT / '.local-data' / 'deployment'


def public_image(reference):
    match = re.fullmatch(r'ghcr\.io/([a-z0-9_.-]+/[a-z0-9_.-]+):([a-zA-Z0-9_.-]+)', reference)
    if not match:
        raise ValueError('Expected a tagged public GHCR image')
    repository, tag = match.groups()
    query = urllib.parse.urlencode({'service': 'ghcr.io', 'scope': f'repository:{repository}:pull'})
    with urllib.request.urlopen(f'https://ghcr.io/token?{query}', timeout=30) as response:
        bearer = json.load(response)['token']
    request = urllib.request.Request(f'https://ghcr.io/v2/{repository}/manifests/{tag}', headers={
        'Authorization': f'Bearer {bearer}',
        'Accept': 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        content = response.read()
        digest = response.headers.get('Docker-Content-Digest', '')
    if digest != 'sha256:' + hashlib.sha256(content).hexdigest():
        raise ValueError('Registry manifest digest mismatch')
    return f'ghcr.io/{repository}@{digest}'


def cli(*args):
    env = dict(os.environ, AZURE_CONFIG_DIR=str(ROOT / '.local-data' / 'azure'), AZURE_CORE_COLLECT_TELEMETRY='no')
    result = subprocess.run([sys.executable, '-m', 'azure.cli', *args, '--only-show-errors'],
                            env=env, text=True, capture_output=True)
    if result.returncode:
        message = result.stderr
        for name in ['api-token.txt', 'account-storage-connection.txt']:
            token_file = PRIVATE / name
            if token_file.exists():
                message = message.replace(token_file.read_text().strip(), '[REDACTED]')
        raise RuntimeError(message)
    return result.stdout.strip()


def configuration(environment_id, image, token, location, google_client_id='', storage_connection=''):
    result = {
        'location': location,
        'properties': {
            'environmentId': environment_id,
            'workloadProfileName': 'Consumption',
            'configuration': {
                'activeRevisionsMode': 'Single',
                'secrets': [{'name': 'api-token', 'value': token}],
                'ingress': {'external': True, 'targetPort': 8080, 'transport': 'auto',
                            'allowInsecure': False, 'traffic': [{'latestRevision': True, 'weight': 100}]},
            },
            'template': {
                'containers': [{
                    'name': 'evala', 'image': image, 'resources': {'cpu': 2, 'memory': '4Gi'},
                    'env': [
                        {'name': 'API_TOKEN', 'secretRef': 'api-token'},
                        {'name': 'HOST', 'value': '0.0.0.0'},
                        {'name': 'PORT', 'value': '8080'},
                        {'name': 'ENGINE_THREADS', 'value': '2'},
                        {'name': 'ENGINE_CONCURRENCY', 'value': '1'},
                        {'name': 'ALLOW_EXTENSION_ORIGINS', 'value': 'true'},
                        {'name': 'PUBLIC_REPORTS', 'value': 'true'},
                        {'name': 'PUBLIC_ENGINE_SECONDS', 'value': '1800'},
                    ],
                    'probes': [
                        {'type': 'Startup', 'tcpSocket': {'port': 8080}, 'periodSeconds': 2,
                         'timeoutSeconds': 2, 'failureThreshold': 60},
                        {'type': 'Readiness', 'tcpSocket': {'port': 8080}, 'periodSeconds': 10,
                         'timeoutSeconds': 2, 'failureThreshold': 3},
                    ],
                }],
                'scale': {'minReplicas': 0, 'maxReplicas': 1,
                          'rules': [{'name': 'http', 'http': {'metadata': {'concurrentRequests': '1'}}}]},
            },
        },
    }
    env = result['properties']['template']['containers'][0]['env']
    if google_client_id:
        env.append({'name': 'GOOGLE_CLIENT_ID', 'value': google_client_id})
    if storage_connection:
        result['properties']['configuration']['secrets'].append({'name': 'account-storage', 'value': storage_connection})
        env.append({'name': 'ACCOUNT_STORAGE_CONNECTION_STRING', 'secretRef': 'account-storage'})
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', default='ghcr.io/davidsvajda/evala:server')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    account = json.loads(cli('account', 'show', '--output', 'json'))
    if account['id'] != 'eee9e445-b08a-4d02-b1f6-955e67492164':
        raise ValueError('Select the authorized Azure for Students subscription first')
    environment = json.loads(cli('containerapp', 'env', 'show', '--name', 'evala-env',
                                 '--resource-group', 'evala-chess', '--output', 'json'))
    location = re.sub(r'[^a-z0-9]', '', environment['location'].lower())
    if location != 'germanywestcentral':
        raise ValueError('Unexpected deployment region')
    image = public_image(args.image)
    client_file = PRIVATE / 'google-client-id.txt'
    google_client_id = client_file.read_text().strip() if client_file.exists() else ''
    if google_client_id and not re.fullmatch(r'[A-Za-z0-9_-]+\.apps\.googleusercontent\.com', google_client_id):
        raise ValueError('Invalid Google web client ID')
    storage_file = PRIVATE / 'account-storage-connection.txt'
    storage_connection = storage_file.read_text().strip() if storage_file.exists() else ''
    print(json.dumps({'subscription': account['name'], 'image': image, 'region': location,
                      'cpu': 2, 'memory': '4Gi', 'replicas': '0-1', 'logs': 'no Log Analytics',
                      'googleSignIn': bool(google_client_id), 'persistentAccounts': bool(storage_connection)}, ensure_ascii=False))
    if not args.apply:
        return
    PRIVATE.mkdir(parents=True, exist_ok=True)
    token_file = PRIVATE / 'api-token.txt'
    if not token_file.exists():
        token_file.write_text(secrets.token_hex(32), encoding='utf8')
        token_file.chmod(0o600)
    token = token_file.read_text().strip()
    if not re.fullmatch(r'[0-9a-f]{64}', token):
        raise ValueError('Invalid local API token file')
    config_file = PRIVATE / 'containerapp.json'
    config_file.write_text(json.dumps(configuration(environment['id'], image, token, location, google_client_id, storage_connection)), encoding='utf8')
    config_file.chmod(0o600)
    # Listing metadata avoids treating an authorization failure as "not found".
    existing = json.loads(cli('containerapp', 'list', '--resource-group', 'evala-chess', '--output', 'json'))
    operation = 'update' if any(app['name'] == 'evala' for app in existing) else 'create'
    hostname = cli('containerapp', operation, '--name', 'evala', '--resource-group', 'evala-chess',
                   '--yaml', str(config_file), '--query', 'properties.configuration.ingress.fqdn', '--output', 'tsv')
    receipt = {'url': 'https://' + hostname, 'image': image, 'resourceGroup': 'evala-chess',
               'app': 'evala', 'region': location, 'cpu': 2, 'memory': '4Gi', 'minReplicas': 0, 'maxReplicas': 1}
    (PRIVATE / 'deployment.json').write_text(json.dumps(receipt, indent=2), encoding='utf8')
    print(json.dumps(receipt))
    print('API token saved locally in .local-data/deployment/api-token.txt (not printed).')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
