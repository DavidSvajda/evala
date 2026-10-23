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
        'Accept': 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
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
        token_file = PRIVATE / 'api-token.txt'
        if token_file.exists():
            message = message.replace(token_file.read_text().strip(), '[REDACTED]')
        raise RuntimeError(message)
    return result.stdout.strip()


def configuration(environment_id, image, token, location):
    return {
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
                    ],
                    'probes': [
                        {'type': 'Startup', 'tcpSocket': {'port': 8080}, 'periodSeconds': 2,
                         'timeoutSeconds': 2, 'failureThreshold': 60},
                        {'type': 'Readiness', 'tcpSocket': {'port': 8080}, 'periodSeconds': 10,
                         'timeoutSeconds': 2, 'failureThreshold': 3},
                    ],
                }],
                'scale': {'minReplicas': 0, 'maxReplicas': 1, 'cooldownPeriod': 60,
                          'rules': [{'name': 'http', 'http': {'metadata': {'concurrentRequests': '1'}}}]},
            },
        },
    }


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
    print(json.dumps({'subscription': account['name'], 'image': image, 'region': location,
                      'cpu': 2, 'memory': '4Gi', 'replicas': '0–1', 'logs': 'no Log Analytics'}, ensure_ascii=False))
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
    config_file.write_text(json.dumps(configuration(environment['id'], image, token, location)), encoding='utf8')
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
