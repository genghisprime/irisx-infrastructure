#!/bin/bash
# Direct test of Postfix mail server
# Sends email via command line to test deliverability

MAIL_SERVER="54.85.183.55"
TO_EMAIL="rrodkey@me.com"
FROM_EMAIL="noreply@tazzi.com"
SUBJECT="IRISX Mail Server Test - $(date +%Y-%m-%d_%H:%M:%S)"

echo "=== Testing IRISX Mail Server Deliverability ==="
echo "Mail Server: mail-va.tazzi.com ($MAIL_SERVER)"
echo "To: $TO_EMAIL"
echo "From: $FROM_EMAIL"
echo ""

# SSH to mail server and send email
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@$MAIL_SERVER << 'ENDSSH'
# Create email content
cat > /tmp/test-email.txt << 'EOF'
Subject: IRISX Mail Server Deliverability Test
From: noreply@tazzi.com
To: rrodkey@me.com
Content-Type: text/html; charset=UTF-8

<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2c3e50; color: white; padding: 20px; text-align: center; }
        .content { background: #f4f4f4; padding: 20px; margin-top: 20px; }
        .info { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #3498db; }
        .success { color: #27ae60; font-weight: bold; }
        .footer { margin-top: 20px; padding: 20px; text-align: center; font-size: 12px; color: #7f8c8d; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ IRISX Mail Server Test</h1>
            <p>Deliverability Verification</p>
        </div>

        <div class="content">
            <p class="success">If you're reading this, the email was successfully delivered!</p>

            <div class="info">
                <h3>Test Details:</h3>
                <ul>
                    <li><strong>Mail Server:</strong> mail-va.tazzi.com (Virginia)</li>
                    <li><strong>Server IP:</strong> 54.85.183.55</li>
                    <li><strong>Port:</strong> 587 (STARTTLS)</li>
                    <li><strong>Timestamp:</strong> $(date)</li>
                    <li><strong>Hostname:</strong> $(hostname)</li>
                </ul>
            </div>

            <div class="info">
                <h3>Email Authentication:</h3>
                <p>This email should have passed:</p>
                <ul>
                    <li>✓ SPF (Sender Policy Framework)</li>
                    <li>✓ DKIM (DomainKeys Identified Mail)</li>
                    <li>✓ DMARC (Domain-based Message Authentication)</li>
                    <li>✓ TLS/SSL Encryption</li>
                </ul>
            </div>

            <div class="info">
                <h3>Check Email Headers:</h3>
                <p>To verify authentication:</p>
                <ol>
                    <li>Open this email in your mail client</li>
                    <li>View "Show Original" or "View Headers"</li>
                    <li>Look for: <code>spf=pass</code>, <code>dkim=pass</code>, <code>dmarc=pass</code></li>
                </ol>
            </div>
        </div>

        <div class="footer">
            <p>Sent from IRISX Self-Hosted Mail Server</p>
            <p>Powered by Postfix + OpenDKIM + Let's Encrypt</p>
        </div>
    </div>
</body>
</html>
EOF

echo "=== Sending test email via Postfix ==="
sudo sendmail -t < /tmp/test-email.txt

echo ""
echo "=== Email sent! Checking mail queue ==="
sleep 2
mailq

echo ""
echo "=== Recent Postfix logs (last 20 lines) ==="
sudo tail -20 /var/log/mail.log

echo ""
echo "=== Checking for send status ==="
sudo grep "$(date '+%b %e %H:%M')" /var/log/mail.log | grep "rrodkey@me.com" | tail -5

ENDSSH

echo ""
echo "=== Test Complete ==="
echo "Check rrodkey@me.com inbox for the test email"
echo "It should arrive within 1-2 minutes if deliverability is working"
echo ""
echo "If email bounces, check:"
echo "1. Mail server logs above for bounce reason"
echo "2. SPF/DKIM/DMARC records: dig TXT tazzi.com +short"
echo "3. Reverse DNS: dig -x 54.85.183.55 +short"
