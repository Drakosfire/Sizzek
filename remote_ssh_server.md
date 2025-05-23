# Remote Development with Tailscale and Systemd Resilience

This guide walks through how to keep your home Ubuntu AI server accessible via Tailscale, ensure that Tailscale recovers if it fails, and how to use SSH to develop from a remote, underpowered laptop.

---

## 🔧 Part 1: Ensuring Tailscale Auto-Restarts with systemd

### Step 1: Clean Up Old Overrides

If you had issues editing the override before, delete the broken config:

```bash
sudo rm -rf /etc/systemd/system/tailscaled.service.d
```

Then recreate the override directory:

```bash
sudo mkdir -p /etc/systemd/system/tailscaled.service.d
```

### Step 2: Create a Clean Override File

```bash
sudo nano /etc/systemd/system/tailscaled.service.d/override.conf
```

Paste the following:

```ini
[Service]
Restart=always
RestartSec=10
```

Save and exit:
- `Ctrl + O` → Enter
- `Ctrl + X`

### Step 3: Apply the New Systemd Settings

```bash
sudo systemctl daemon-reexec
sudo systemctl daemon-reload
sudo systemctl restart tailscaled
```

### Step 4: Verify the Override

```bash
systemctl show tailscaled | grep Restart
```

You should see:

```
Restart=always
RestartUSec=10s
```

This ensures that Tailscale restarts automatically if it fails or disconnects.

---

## 🛜 Part 2: SSH Into Your Home Server via Tailscale

### Prerequisites

- Tailscale must be installed and running on both devices.
- Your home server must have SSH (`sshd`) running.

### Get the IP or hostname

On your phone or remote machine with Tailscale installed:

```bash
tailscale status
```

Look for the `100.x.x.x` IP of your home server, or the `.ts.net` hostname.

### SSH Command Example

```bash
ssh your-username@100.x.x.x
# OR
ssh your-username@your-machine-name.tailnet-name.ts.net
```

### Optional: Enable Tailscale SSH (Simplified login without public keys)

```bash
sudo tailscale up --ssh
```

Then on your remote machine:

```bash
tailscale ssh your-username@your-machine-name
```

---

## 💻 Part 3: Coding Remotely From an Underpowered Laptop

Here are several ways to comfortably write and run code on your powerful home machine from a lightweight laptop:

### Option 1: Remote SSH with VS Code

- Install [Visual Studio Code](https://code.visualstudio.com/)
- Install the **Remote - SSH** extension
- Add this to your `~/.ssh/config` on your laptop:

```ssh
Host home-server
    HostName 100.x.x.x
    User your-username
```

Then from VS Code:
- `F1` → `Remote-SSH: Connect to Host` → `home-server`
- You can browse files, run code, and even use Jupyter on the server.

### Option 2: Use `tmux` or `screen` to Keep Sessions Alive

SSH in and run:

```bash
tmux
```

This gives you a persistent terminal session. You can disconnect and reconnect later without losing your work.

To resume:

```bash
tmux attach
```

### Option 3: Mount Remote Files with SSHFS

Install SSHFS on your laptop:

```bash
sudo apt install sshfs
mkdir ~/remote-server
sshfs your-username@100.x.x.x:/home/your-username ~/remote-server
```

Now you can open and edit remote files as if they were local.

### Option 4: Use Jupyter Lab or VS Code Server

Set up a remote web-based dev environment:

- Install JupyterLab or VS Code Server on the home machine.
- Use SSH port forwarding:

```bash
ssh -L 8888:localhost:8888 your-username@100.x.x.x
```

Then visit `http://localhost:8888` on your laptop browser.

---

## 🔒 Security Best Practices

- Consider using SSH keys instead of passwords.
- Use Tailscale ACLs to restrict access.
- Regularly check for open ports and unnecessary services.
- Enable unattended upgrades on your server:

```bash
sudo apt install unattended-upgrades
```

---

## ✅ Summary

- Use `systemd` to keep Tailscale running.
- SSH into your home server via Tailscale from anywhere.
- Use tools like VS Code Remote, `tmux`, or SSHFS for an ideal dev setup.
