#!/bin/bash

# Colors
RED="\033[1;31m"
GREEN="\033[1;32m"
YELLOW="\033[1;33m"
BLUE="\033[1;34m"
CYAN="\033[1;36m"
RESET="\033[0m"

# Installation Message
echo -e "${BLUE}<..Installing Pingmonitor PingMaster..>${RESET}"

# Install Dependencies
termux-setup-storage
pkg install -y wget python
pip install tqdm ping3

# Download and Install PingMaster
wget --no-check-certificate 'https://docs.google.com/uc?export=download&id=1QIEj5B8DoG7EwQBN_Firsyknlt3wP7H-' -O pingmaster
chmod +x pingmaster
mv pingmaster $PREFIX/bin/pingmaster

# System Info
DEVICE_NAME=$(uname -o)
UPTIME=$(uptime -p)
STORAGE=$(df -h /data | awk 'NR==2 {print $4}')
IP_ADDR=$(curl -s ifconfig.me)

clear  # Clear screen before showing the dashboard

echo -e "${BLUE}==========================================${RESET}"
echo -e "${GREEN}    ✅ PINGMONITOR INSTALLATION SUCCESSFUL! ✅      ${RESET}"
echo -e "${BLUE}==========================================${RESET}"

echo -e "${YELLOW}📌 Device Info:${RESET}"
echo -e "🔹 Syste
