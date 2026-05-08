#!/bin/bash
# KnessetIL VPS Setup Script (Ubuntu/Debian)
# This script installs all necessary dependencies for a Next.js + FastAPI stack.

# Exit on error
set -e

echo "🚀 Starting VPS Provisioning for KnessetIL..."

# 1. Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# 2. Install PostgreSQL and Redis
echo "🗄️ Installing PostgreSQL and Redis..."
sudo apt install -y postgresql postgresql-contrib redis-server

# 3. Install Python 3.11+ and venv
echo "🐍 Installing Python..."
sudo apt install -y python3 python3-pip python3-venv

# 4. Install Node.js (v20) and pnpm
echo "🟢 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pnpm

# 5. Install Nginx
echo "🌐 Installing Nginx..."
sudo apt install -y nginx

# 6. Install PM2 globally
echo "⚙️ Installing PM2..."
sudo npm install -g pm2

# 7. Setup PostgreSQL Database and User
echo "🐘 Setting up PostgreSQL..."
sudo -u postgres psql -c "CREATE DATABASE knessetil;" || true
sudo -u postgres psql -c "CREATE USER knesset WITH PASSWORD 'knesset';" || true
sudo -u postgres psql -c "ALTER ROLE knesset SET client_encoding TO 'utf8';" || true
sudo -u postgres psql -c "ALTER ROLE knesset SET default_transaction_isolation TO 'read committed';" || true
sudo -u postgres psql -c "ALTER ROLE knesset SET timezone TO 'UTC';" || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE knessetil TO knesset;" || true
# Note: For production, you should change these credentials!

echo "✅ Provisioning complete! Please see README.md for the next deployment steps."
