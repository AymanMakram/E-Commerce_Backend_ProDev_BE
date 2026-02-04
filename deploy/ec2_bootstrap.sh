#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/<branch>/deploy/ec2_bootstrap.sh | bash
# Or copy this file to the server and run:
#   bash deploy/ec2_bootstrap.sh

sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg lsb-release git

# Install Docker Engine
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow running docker without sudo
sudo usermod -aG docker $USER

echo "Docker installed. You may need to log out/in for group changes to apply."

# Optional: basic firewall
if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow OpenSSH
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw --force enable
fi

echo "Done. Next: clone repo and run docker compose up --build -d"
