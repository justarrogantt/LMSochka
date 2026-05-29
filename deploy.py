"""
Deploy LMSochka to 103.246.144.199
"""
import paramiko
import os
import sys

# Force UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

HOST = "103.246.144.199"
PORT = 22
USER = "root"
PASSWORD = "St3J_t_VnewhstA"
DEPLOY_DIR = "/opt/LMS"
BACKEND_PORT = 8002

# Local project root (two levels up from this script)
LOCAL_ROOT = os.path.dirname(os.path.abspath(__file__))


def run(client, cmd, timeout=120):
    short = cmd.strip()[:80]
    print(f"\n>>> {short}{'...' if len(cmd.strip()) > 80 else ''}")
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if out.strip():
        print(out.strip())
    if err.strip():
        print("[stderr]", err.strip())
    return out + err


def upload_dir(sftp, local_dir, remote_dir, skip=None):
    """Recursively upload a directory via SFTP, skipping specified folders."""
    skip = skip or []
    try:
        sftp.mkdir(remote_dir)
    except OSError:
        pass

    for item in os.listdir(local_dir):
        if item in skip or item.startswith('.'):
            continue
        local_path = os.path.join(local_dir, item)
        remote_path = f"{remote_dir}/{item}"

        if os.path.isdir(local_path):
            upload_dir(sftp, local_path, remote_path, skip)
        else:
            try:
                sftp.put(local_path, remote_path)
            except Exception as e:
                print(f"  skip {remote_path}: {e}")


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {HOST}...")
    client.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=15)
    print("Connected.\n")

    # 1. Create directory structure
    run(client, f"mkdir -p {DEPLOY_DIR}/backend {DEPLOY_DIR}/frontend")

    # 2. Upload backend via SFTP (skip .venv, __pycache__)
    print("\n=== Uploading backend... ===")
    sftp = client.open_sftp()
    backend_local = os.path.join(LOCAL_ROOT, "backend")
    upload_dir(sftp, backend_local, f"{DEPLOY_DIR}/backend",
               skip=[".venv", "__pycache__", ".pytest_cache", "lms.db"])
    print("Backend uploaded.")

    # 3. Upload frontend source (skip node_modules, dist)
    print("\n=== Uploading frontend... ===")
    frontend_local = os.path.join(LOCAL_ROOT, "frontend")
    upload_dir(sftp, frontend_local, f"{DEPLOY_DIR}/frontend",
               skip=["node_modules", "dist", ".cache"])
    print("Frontend uploaded.")
    sftp.close()

    # 4. Backend .env
    run(client, f"""
cd {DEPLOY_DIR}/backend
[ -f .env ] || cp .env.example .env
SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
sed -i "s|^SECRET_KEY=.*|SECRET_KEY=$SECRET|" .env
""")

    # 5. Install uv if missing
    run(client, "which uv || curl -LsSf https://astral.sh/uv/install.sh | sh", timeout=60)

    # 6. Backend dependencies
    run(client, f"cd {DEPLOY_DIR}/backend && ~/.local/bin/uv sync 2>&1", timeout=300)

    # 7. Systemd service
    service = "\n".join([
        "[Unit]",
        "Description=LMS Backend",
        "After=network.target",
        "",
        "[Service]",
        f"WorkingDirectory={DEPLOY_DIR}/backend",
        f"ExecStart=/root/.local/bin/uv run uvicorn app.main:app --host 127.0.0.1 --port {BACKEND_PORT}",
        "Restart=always",
        "RestartSec=5",
        f"EnvironmentFile={DEPLOY_DIR}/backend/.env",
        "",
        "[Install]",
        "WantedBy=multi-user.target",
    ])
    run(client, f"printf '%s\\n' {chr(39)}{service}{chr(39)} > /etc/systemd/system/lms-backend.service")
    run(client, "systemctl daemon-reload && systemctl enable lms-backend && systemctl restart lms-backend")

    import time; time.sleep(3)
    run(client, "systemctl status lms-backend --no-pager -l | head -20")

    # 8. Frontend build
    run(client, f"cd {DEPLOY_DIR}/frontend && npm ci 2>&1 | tail -5", timeout=300)
    run(client, f"cd {DEPLOY_DIR}/frontend && npm run build 2>&1 | tail -10", timeout=180)

    # 9. Nginx config
    nginx_conf = "\n".join([
        "server {",
        "    listen 8080;",
        f"    root {DEPLOY_DIR}/frontend/dist;",
        "    index index.html;",
        "    location / {",
        "        try_files $uri $uri/ /index.html;",
        "    }",
        "    location /api {",
        f"        proxy_pass http://127.0.0.1:{BACKEND_PORT};",
        "        proxy_set_header Host $host;",
        "        proxy_set_header X-Real-IP $remote_addr;",
        "    }",
        "}",
    ])
    run(client, f"printf '%s\\n' {chr(39)}{nginx_conf}{chr(39)} > /etc/nginx/sites-available/lms")
    run(client, "ln -sf /etc/nginx/sites-available/lms /etc/nginx/sites-enabled/lms")
    run(client, "nginx -t 2>&1 && systemctl reload nginx")

    # 10. Final check
    print("\n=== DONE ===")
    run(client, f"curl -s http://127.0.0.1:{BACKEND_PORT}/ 2>&1 | head -c 100")
    run(client, "systemctl is-active lms-backend && echo 'Backend: running'")
    run(client, "systemctl is-active nginx && echo 'Nginx: running'")
    print(f"\nSite: http://{HOST}:8080")

    client.close()


if __name__ == "__main__":
    main()
