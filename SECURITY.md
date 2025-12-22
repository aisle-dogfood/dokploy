# Dokploy Security Policy

At Dokploy, security is a top priority. We appreciate the help of security researchers and the community in identifying and reporting vulnerabilities.

## How to Report a Vulnerability

If you have discovered a security vulnerability in Dokploy, we ask that you report it responsibly by following these guidelines:

1.  **Contact us:** Send an email to [contact@dokploy.com](mailto:contact@dokploy.com).
2.  **Provide clear details:** Include as much information as possible to help us understand and reproduce the vulnerability. This should include:
    *   A clear description of the vulnerability.
    *   Steps to reproduce the vulnerability.
    *   Any sample code, screenshots, or videos that might be helpful.
    *   The potential impact of the vulnerability.
3.  **Do not make the vulnerability public:** Please refrain from publicly disclosing the vulnerability until we have had the opportunity to investigate and address it. This is crucial for protecting our users.
4.  **Allow us time:** We will endeavor to acknowledge receipt of your report as soon as possible and keep you informed of our progress. The time to resolve the vulnerability may vary depending on its complexity and severity.

## What We Expect From You

*   Do not access user data or systems beyond what is necessary to demonstrate the vulnerability.
*   Do not perform denial-of-service (DoS) attacks, spamming, or social engineering.
*   Do not modify or destroy data that does not belong to you.

## Our Commitment

We are committed to working with you quickly and responsibly to address any legitimate security vulnerability.

## Security Best Practices

### Server Configuration

When configuring remote servers in Dokploy, follow these security best practices:

#### SSH User Configuration

**⚠️ CRITICAL: Never use 'root' user for SSH connections**

Using the 'root' user for remote server connections significantly increases security risks:
- **Increased Blast Radius**: If credentials are compromised, an attacker has complete system control
- **No Audit Trail**: Actions performed as root are harder to trace to individual users
- **Privilege Escalation**: Root access bypasses all privilege separation mechanisms

**Recommended Approach:**

1. **Create a dedicated non-root user** on your remote server:
   ```bash
   # On your remote server
   sudo adduser dokploy
   sudo usermod -aG sudo dokploy  # For Debian/Ubuntu
   # OR
   sudo usermod -aG wheel dokploy  # For RHEL/CentOS/Fedora
   ```

2. **Configure sudo privileges** without password for Docker commands (optional):
   ```bash
   sudo visudo
   # Add the following line:
   dokploy ALL=(ALL) NOPASSWD: /usr/bin/docker
   ```

3. **Use SSH key-only authentication**:
   - Always use SSH keys instead of passwords
   - Disable password authentication in `/etc/ssh/sshd_config`:
     ```
     PasswordAuthentication no
     PubkeyAuthentication yes
     PermitRootLogin no
     ```

4. **Configure Dokploy to use the non-root user**:
   - When creating a server in Dokploy, specify your non-root username (e.g., `dokploy`, `ubuntu`, `admin`)
   - The application will validate and warn against using 'root'

#### Additional Security Measures

- **Firewall Configuration**: Restrict SSH access to known IP addresses
- **SSH Port**: Consider changing the default SSH port (22) to a non-standard port
- **Fail2Ban**: Implement fail2ban to prevent brute-force attacks
- **Regular Updates**: Keep your server's operating system and packages up to date
- **Monitor Logs**: Regularly review SSH and system logs for suspicious activity

### Reporting Security Issues

If you discover a security vulnerability related to server configuration or any other aspect of Dokploy, please report it following the guidelines above.

Thank you for helping us keep Dokploy secure for everyone.
