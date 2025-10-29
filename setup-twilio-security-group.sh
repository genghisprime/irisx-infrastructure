#!/bin/bash

# FreeSWITCH Twilio Security Group Configuration
# This script adds Twilio IP ranges to the FreeSWITCH security group

SECURITY_GROUP_ID="sg-04b30cdb93a2e0a94"
REGION="us-east-1"

echo "Configuring security group $SECURITY_GROUP_ID for Twilio integration..."

# Twilio SIP Signaling - TCP port 5060 (Virginia - primary)
echo "Adding Twilio SIP TCP signaling rules..."
aws ec2 authorize-security-group-ingress --region $REGION \
  --group-id $SECURITY_GROUP_ID \
  --protocol tcp --port 5060 --cidr 54.172.60.0/30 \
  --description "Twilio SIP TCP - Virginia" 2>/dev/null || echo "  Virginia TCP rule may already exist"

aws ec2 authorize-security-group-ingress --region $REGION \
  --group-id $SECURITY_GROUP_ID \
  --protocol tcp --port 5060 --cidr 54.244.51.0/30 \
  --description "Twilio SIP TCP - Oregon" 2>/dev/null || echo "  Oregon TCP rule may already exist"

# Twilio SIP Signaling - UDP port 5060 (Virginia - primary)
echo "Adding Twilio SIP UDP signaling rules..."
aws ec2 authorize-security-group-ingress --region $REGION \
  --group-id $SECURITY_GROUP_ID \
  --protocol udp --port 5060 --cidr 54.172.60.0/30 \
  --description "Twilio SIP UDP - Virginia" 2>/dev/null || echo "  Virginia UDP rule may already exist"

aws ec2 authorize-security-group-ingress --region $REGION \
  --group-id $SECURITY_GROUP_ID \
  --protocol udp --port 5060 --cidr 54.244.51.0/30 \
  --description "Twilio SIP UDP - Oregon" 2>/dev/null || echo "  Oregon UDP rule may already exist"

# Twilio Media (RTP) - UDP ports 10000-60000 (Global range)
echo "Adding Twilio RTP media rules..."
aws ec2 authorize-security-group-ingress --region $REGION \
  --group-id $SECURITY_GROUP_ID \
  --protocol udp --port 10000-60000 --cidr 168.86.128.0/18 \
  --description "Twilio RTP Media - Global" 2>/dev/null || echo "  Media rule may already exist"

echo ""
echo "✅ Security group configuration complete!"
echo ""
echo "Next steps:"
echo "1. Configure your Twilio SIP Trunk to point to: 54.160.220.243"
echo "2. Use port 5060 (UDP recommended)"
echo "3. Test connectivity with FreeSWITCH"
