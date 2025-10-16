#!/bin/bash
#
# LLM Test App - Secure VM Setup Script
#
# This script automates the secure deployment of the LLM Test App on a VM
# It creates a dedicated service account and sets up proper permissions
#
# Usage: sudo bash setup-vm.sh
#
# What it does:
# 1. Creates llmtest service account (if doesn't exist)
# 2. Sets up /opt/llm-test-app with proper ownership
# 3. Installs Node.js dependencies
# 4. Sets up .env file with secure permissions
# 5. Installs systemd service for auto-start
# 6. Provides next steps for NGINX and OAuth configuration

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}LLM Test App - Secure VM Setup${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}ERROR: This script must be run as root${NC}"
    echo "Please run: sudo bash setup-vm.sh"
    exit 1
fi

# Check if we're in the app directory
if [ ! -f "server.js" ] || [ ! -f "package.json" ]; then
    echo -e "${RED}ERROR: This script must be run from the app directory${NC}"
    echo "Expected files: server.js, package.json"
    echo ""
    echo "Please cd to /opt/llm-test-app first, then run this script"
    exit 1
fi

APP_DIR="/opt/llm-test-app"
SERVICE_USER="llmtest"
SERVICE_FILE="llm-test.service"

echo -e "${YELLOW}Step 1: Creating service account...${NC}"

# Create service account if it doesn't exist
if id "$SERVICE_USER" &>/dev/null; then
    echo -e "${GREEN}✓ Service account '$SERVICE_USER' already exists${NC}"
else
    useradd --system --no-create-home --shell /bin/false "$SERVICE_USER"
    echo -e "${GREEN}✓ Created service account '$SERVICE_USER'${NC}"
fi

echo ""
echo -e "${YELLOW}Step 2: Setting up application directory...${NC}"

# Ensure we're in the right directory
if [ "$PWD" != "$APP_DIR" ]; then
    if [ -d "$APP_DIR" ]; then
        cd "$APP_DIR"
        echo -e "${GREEN}✓ Changed to $APP_DIR${NC}"
    else
        echo -e "${RED}ERROR: $APP_DIR does not exist${NC}"
        echo "Please clone the repository first:"
        echo "  sudo git clone https://github.com/sagearbor/test-llm-apis.git $APP_DIR"
        exit 1
    fi
fi

# Set ownership
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
echo -e "${GREEN}✓ Set ownership to $SERVICE_USER${NC}"

echo ""
echo -e "${YELLOW}Step 3: Installing Node.js dependencies...${NC}"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Running npm install..."
    npm install
    chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/node_modules"
    echo -e "${GREEN}✓ Installed dependencies${NC}"
else
    echo -e "${GREEN}✓ Dependencies already installed${NC}"
fi

echo ""
echo -e "${YELLOW}Step 4: Setting up .env file...${NC}"

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${GREEN}✓ Created .env from .env.example${NC}"
        echo -e "${YELLOW}⚠ IMPORTANT: You must edit .env with your credentials!${NC}"
        echo "  Run: sudo nano $APP_DIR/.env"
    else
        echo -e "${RED}ERROR: .env.example not found${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

# Secure .env file permissions
chown "$SERVICE_USER:$SERVICE_USER" .env
chmod 600 .env
echo -e "${GREEN}✓ Secured .env file permissions (600)${NC}"

echo ""
echo -e "${YELLOW}Step 5: Installing systemd service...${NC}"

if [ -f "$SERVICE_FILE" ]; then
    cp "$SERVICE_FILE" /etc/systemd/system/
    systemctl daemon-reload
    echo -e "${GREEN}✓ Installed systemd service${NC}"
else
    echo -e "${RED}ERROR: $SERVICE_FILE not found in current directory${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "1. Edit environment variables:"
echo "   ${GREEN}sudo nano $APP_DIR/.env${NC}"
echo "   - Add your Azure OpenAI credentials"
echo "   - Generate SESSION_SECRET: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
echo ""
echo "2. Test the application:"
echo "   ${GREEN}sudo -u $SERVICE_USER NODE_ENV=production node $APP_DIR/server.js${NC}"
echo "   Press Ctrl+C to stop after testing"
echo ""
echo "3. Enable and start the service:"
echo "   ${GREEN}sudo systemctl enable llm-test${NC}"
echo "   ${GREEN}sudo systemctl start llm-test${NC}"
echo "   ${GREEN}sudo systemctl status llm-test${NC}"
echo ""
echo "4. Configure NGINX (see docs/VM_DEPLOYMENT.md):"
echo "   - Set up SSL certificates"
echo "   - Configure port 3060 proxy"
echo "   - Enable security headers"
echo ""
echo "5. Configure firewall:"
echo "   ${GREEN}sudo ufw allow 3060/tcp${NC}"
echo ""
echo "6. Set up OAuth (see docs/VM_DEPLOYMENT.md):"
echo "   - Register app in Azure AD"
echo "   - Update .env with OAuth credentials"
echo "   - Set ENABLE_OAUTH=true"
echo ""
echo -e "${YELLOW}Logs:${NC}"
echo "   ${GREEN}sudo journalctl -u llm-test -f${NC}"
echo ""
echo -e "${YELLOW}Full documentation:${NC}"
echo "   docs/VM_DEPLOYMENT.md"
echo "   docs/SECURITY_CHECKLIST.md"
echo ""
