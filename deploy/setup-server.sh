#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu server (Oracle Cloud ARM or AMD Micro).
# Adds swap, installs Docker, opens HTTP/HTTPS in the local firewall and
# fetches the Tordroid Plus deploy files. Safe to re-run.
#
#   curl -fsSL https://raw.githubusercontent.com/1tordroid/pikpak-plus/main/deploy/setup-server.sh | sudo bash
set -euo pipefail

SWAP_SIZE="${SWAP_SIZE:-4G}"
APP_DIR="${APP_DIR:-/opt/tordroid-plus}"
REPO_RAW="https://raw.githubusercontent.com/1tordroid/pikpak-plus/main"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

echo "==> Swap (${SWAP_SIZE})"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l "$SWAP_SIZE" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -q vm.swappiness=10
echo 'vm.swappiness=10' > /etc/sysctl.d/99-tordroid-swap.conf

echo "==> Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
SUDO_USER_NAME="${SUDO_USER:-ubuntu}"
id "$SUDO_USER_NAME" >/dev/null 2>&1 && usermod -aG docker "$SUDO_USER_NAME"

echo "==> Firewall (Oracle Ubuntu images block everything but SSH via iptables)"
for port in 80 443; do
  if ! iptables -C INPUT -m state --state NEW -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    # Insert just above the image's catch-all REJECT rule (or append if none)
    reject_line=$(iptables -L INPUT -n --line-numbers | awk '/REJECT/ {print $1; exit}')
    if [ -n "$reject_line" ]; then
      iptables -I INPUT "$reject_line" -m state --state NEW -p tcp --dport "$port" -j ACCEPT
    else
      iptables -A INPUT -m state --state NEW -p tcp --dport "$port" -j ACCEPT
    fi
  fi
done
if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save
fi

echo "==> Deploy files in ${APP_DIR}"
mkdir -p "$APP_DIR"
curl -fsSL "$REPO_RAW/docker-compose.prod.yml" -o "$APP_DIR/docker-compose.yml"
[ -f "$APP_DIR/.env" ] || curl -fsSL "$REPO_RAW/example.env" -o "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"
chown -R "$SUDO_USER_NAME":"$SUDO_USER_NAME" "$APP_DIR" 2>/dev/null || true

echo
echo "Done. Next: fill in $APP_DIR/.env, then:"
echo "  cd $APP_DIR && docker compose pull && docker compose up -d"
