#!/usr/bin/env python3
"""Wait for the run-#46 release deploys (Render + Vercel x2) on commit 16dc206,
then run the public release-verify matrix. Exits 0 only if ALL green."""
import json, subprocess, time, urllib.request

SHA = "16dc206"
T = {}
for line in open('/home/ubuntu/.hermes/profiles/koralink/.deploy-tokens'):
    if '=' in line and not line.startswith('#'):
        k, _, v = line.strip().partition('='); T[k] = v

def render_status():
    req = urllib.request.Request(
        f"https://api.render.com/v1/services/{T['RENDER_SERVICE_ID']}/deploys?limit=1",
        headers={'Authorization': f"Bearer {T['RENDER_API_KEY']}"})
    d = json.load(urllib.request.urlopen(req, timeout=30))[0]
    d = d.get('deploy', d)
    return d['status'], str(d.get('commit', {}).get('id', '?'))[:7]

def vercel_ready(project_name):
    # Resolve project ID by name (no stored IDs needed), then latest prod deploy
    req = urllib.request.Request(
        f"https://api.vercel.com/v9/projects/{project_name}",
        headers={'Authorization': f"Bearer {T['VERCEL_TEAM_TOKEN']}"})
    pid = json.load(urllib.request.urlopen(req, timeout=30))['id']
    req = urllib.request.Request(
        f"https://api.vercel.com/v6/deployments?projectId={pid}&target=production&limit=1",
        headers={'Authorization': f"Bearer {T['VERCEL_TEAM_TOKEN']}"})
    ds = json.load(urllib.request.urlopen(req, timeout=30))['deployments']
    if not ds:
        return 'none', '?'
    d = ds[0]
    return d.get('readyState', '?'), str(d.get('meta', {}).get('githubCommitSha', '?'))[:7]

deadline = time.time() + 1500  # 25 min
render_ok = vercel_ok = False
while time.time() < deadline:
    rs, rc = render_status()
    v1s, v1c = vercel_ready('kora-link-player-pwa')
    v2s, v2c = vercel_ready('kora-link-admin')
    print(f"[{time.strftime('%H:%M:%S')}] render={rs}({rc}) pwa={v1s}({v1c}) admin={v2s}({v2c})", flush=True)
    render_ok = rs == 'live' and rc == SHA
    vercel_ok = v1s == 'READY' and v1c == SHA and v2s == 'READY' and v2c == SHA
    if render_ok and vercel_ok:
        break
    if rs in ('build_failed', 'deploy_failed', 'canceled') or 'ERROR' in (v1s, v2s):
        print("PLATFORM DEPLOY FAILED", flush=True)
        time.sleep(60)
    time.sleep(30)

print(f"render_ok={render_ok} vercel_ok={vercel_ok}", flush=True)
if not (render_ok and vercel_ok):
    raise SystemExit(2)

print("── release-verify matrix ──", flush=True)
r = subprocess.run(['bash', 'scripts/release-verify.sh',
                    'https://koralink-api.onrender.com/api/v1',
                    'https://kora-link-player-pwa.vercel.app',
                    'https://kora-link-admin.vercel.app'],
                   capture_output=True, text=True, timeout=300)
print(r.stdout, flush=True)
if r.returncode != 0:
    print(r.stderr, flush=True)
raise SystemExit(r.returncode)
