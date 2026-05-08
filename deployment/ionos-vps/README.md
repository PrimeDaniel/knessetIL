# IONOS VPS Deployment Guide

This folder contains the configuration files to deploy the full KnessetTrack stack onto a single IONOS VPS (Ubuntu/Debian).

## 1. Provision the Server
SSH into your fresh IONOS VPS and run the setup script to install Node.js, Python, PostgreSQL, Redis, Nginx, and PM2.

```bash
# Copy the script to the server and make it executable
chmod +x deployment/ionos-vps/setup.sh
./deployment/ionos-vps/setup.sh
```

## 2. Build the Application
After dependencies are installed, you need to build the frontend and install python dependencies.

```bash
# 1. Frontend
pnpm install
pnpm build

# 2. Backend
cd apps/api
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ../..
```

## 3. Update Configurations
Before starting, update your domain name in the config files:
1. Edit `deployment/ionos-vps/ecosystem.config.js` and replace `yourdomain.com`.
2. Edit `deployment/ionos-vps/nginx.conf` and replace `yourdomain.com`.

## 4. Start the Application with PM2
Copy the PM2 configuration to the root of the project and start the services.

```bash
cp deployment/ionos-vps/ecosystem.config.js ./
pm2 start ecosystem.config.js
pm2 save
pm2 startup # Run the command PM2 gives you to enable it on boot
```

## 5. Configure Nginx
Copy the Nginx configuration to the correct system folder and restart Nginx.

```bash
sudo cp deployment/ionos-vps/nginx.conf /etc/nginx/sites-available/knessetil
sudo ln -s /etc/nginx/sites-available/knessetil /etc/nginx/sites-enabled/
# Remove the default nginx config if it exists
sudo rm /etc/nginx/sites-enabled/default
sudo systemctl restart nginx
```

## 6. Secure with SSL (Let's Encrypt)
Finally, install an SSL certificate using Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Your app is now live!
