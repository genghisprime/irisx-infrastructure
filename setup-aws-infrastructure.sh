#!/bin/bash

# IRISX AWS Infrastructure Setup Script
# Sets up lean infrastructure in us-east-1 (Virginia)
# Cost: ~$40/mo

set -e  # Exit on error

# Configuration
export AWS_PROFILE=irisx-virginia
export AWS_REGION=us-east-1

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  IRISX AWS Infrastructure Setup${NC}"
echo -e "${BLUE}  Region: us-east-1 (Virginia)${NC}"
echo -e "${BLUE}  Cost: ~\$40/mo${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# VPC ID (already created)
VPC_ID="vpc-0bab7828e5ffb7fa5"
echo -e "${GREEN}✓${NC} VPC already created: ${VPC_ID}"

# Enable DNS hostnames for VPC
echo -e "${YELLOW}→${NC} Enabling DNS hostnames for VPC..."
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-hostnames
echo -e "${GREEN}✓${NC} DNS hostnames enabled"

# Create Internet Gateway
echo -e "${YELLOW}→${NC} Creating Internet Gateway..."
IGW_ID=$(aws ec2 create-internet-gateway \
  --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=irisx-prod-igw},{Key=Project,Value=IRISX},{Key=Environment,Value=prod}]' \
  --query 'InternetGateway.InternetGatewayId' \
  --output text)
echo -e "${GREEN}✓${NC} Internet Gateway created: ${IGW_ID}"

# Attach IGW to VPC
echo -e "${YELLOW}→${NC} Attaching Internet Gateway to VPC..."
aws ec2 attach-internet-gateway --vpc-id $VPC_ID --internet-gateway-id $IGW_ID
echo -e "${GREEN}✓${NC} Internet Gateway attached"

# Create Subnets
echo -e "${YELLOW}→${NC} Creating subnets..."

# Public Subnet 1a
PUBLIC_SUBNET_1A=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.1.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=irisx-prod-subnet-public-1a},{Key=Project,Value=IRISX},{Key=Environment,Value=prod},{Key=Type,Value=public}]' \
  --query 'Subnet.SubnetId' \
  --output text)
echo -e "${GREEN}✓${NC} Public Subnet 1a created: ${PUBLIC_SUBNET_1A}"

# Public Subnet 1b
PUBLIC_SUBNET_1B=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.2.0/24 \
  --availability-zone us-east-1b \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=irisx-prod-subnet-public-1b},{Key=Project,Value=IRISX},{Key=Environment,Value=prod},{Key=Type,Value=public}]' \
  --query 'Subnet.SubnetId' \
  --output text)
echo -e "${GREEN}✓${NC} Public Subnet 1b created: ${PUBLIC_SUBNET_1B}"

# Database Subnet 1a
DB_SUBNET_1A=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.11.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=irisx-prod-subnet-database-1a},{Key=Project,Value=IRISX},{Key=Environment,Value=prod},{Key=Type,Value=database}]' \
  --query 'Subnet.SubnetId' \
  --output text)
echo -e "${GREEN}✓${NC} Database Subnet 1a created: ${DB_SUBNET_1A}"

# Database Subnet 1b
DB_SUBNET_1B=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.12.0/24 \
  --availability-zone us-east-1b \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=irisx-prod-subnet-database-1b},{Key=Project,Value=IRISX},{Key=Environment,Value=prod},{Key=Type,Value=database}]' \
  --query 'Subnet.SubnetId' \
  --output text)
echo -e "${GREEN}✓${NC} Database Subnet 1b created: ${DB_SUBNET_1B}"

# Enable auto-assign public IP for public subnets
aws ec2 modify-subnet-attribute --subnet-id $PUBLIC_SUBNET_1A --map-public-ip-on-launch
aws ec2 modify-subnet-attribute --subnet-id $PUBLIC_SUBNET_1B --map-public-ip-on-launch
echo -e "${GREEN}✓${NC} Auto-assign public IP enabled for public subnets"

# Create Route Table for Public Subnets
echo -e "${YELLOW}→${NC} Creating route table..."
PUBLIC_RT=$(aws ec2 create-route-table \
  --vpc-id $VPC_ID \
  --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=irisx-prod-rt-public},{Key=Project,Value=IRISX},{Key=Environment,Value=prod}]' \
  --query 'RouteTable.RouteTableId' \
  --output text)
echo -e "${GREEN}✓${NC} Public route table created: ${PUBLIC_RT}"

# Add route to Internet Gateway
aws ec2 create-route --route-table-id $PUBLIC_RT --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID
echo -e "${GREEN}✓${NC} Route to Internet Gateway added"

# Associate route table with public subnets
aws ec2 associate-route-table --subnet-id $PUBLIC_SUBNET_1A --route-table-id $PUBLIC_RT
aws ec2 associate-route-table --subnet-id $PUBLIC_SUBNET_1B --route-table-id $PUBLIC_RT
echo -e "${GREEN}✓${NC} Route table associated with public subnets"

# Create Security Groups
echo -e "${YELLOW}→${NC} Creating security groups..."

# API/FreeSWITCH Security Group
API_SG=$(aws ec2 create-security-group \
  --group-name irisx-prod-sg-api \
  --description "IRISX API and FreeSWITCH server" \
  --vpc-id $VPC_ID \
  --tag-specifications 'ResourceType=security-group,Tags=[{Key=Name,Value=irisx-prod-sg-api},{Key=Project,Value=IRISX},{Key=Environment,Value=prod}]' \
  --query 'GroupId' \
  --output text)
echo -e "${GREEN}✓${NC} API Security Group created: ${API_SG}"

# Add rules to API Security Group
aws ec2 authorize-security-group-ingress --group-id $API_SG --protocol tcp --port 22 --cidr 0.0.0.0/0  # SSH
aws ec2 authorize-security-group-ingress --group-id $API_SG --protocol tcp --port 80 --cidr 0.0.0.0/0  # HTTP
aws ec2 authorize-security-group-ingress --group-id $API_SG --protocol tcp --port 443 --cidr 0.0.0.0/0  # HTTPS
aws ec2 authorize-security-group-ingress --group-id $API_SG --protocol tcp --port 5060 --cidr 0.0.0.0/0  # SIP TCP
aws ec2 authorize-security-group-ingress --group-id $API_SG --protocol udp --port 5060 --cidr 0.0.0.0/0  # SIP UDP
aws ec2 authorize-security-group-ingress --group-id $API_SG --protocol udp --port 16384-32768 --cidr 0.0.0.0/0  # RTP
echo -e "${GREEN}✓${NC} API Security Group rules added"

# Database Security Group
DB_SG=$(aws ec2 create-security-group \
  --group-name irisx-prod-sg-database \
  --description "IRISX PostgreSQL database" \
  --vpc-id $VPC_ID \
  --tag-specifications 'ResourceType=security-group,Tags=[{Key=Name,Value=irisx-prod-sg-database},{Key=Project,Value=IRISX},{Key=Environment,Value=prod}]' \
  --query 'GroupId' \
  --output text)
echo -e "${GREEN}✓${NC} Database Security Group created: ${DB_SG}"

# Allow PostgreSQL from API SG
aws ec2 authorize-security-group-ingress --group-id $DB_SG --protocol tcp --port 5432 --source-group $API_SG
echo -e "${GREEN}✓${NC} Database Security Group rules added"

# Cache Security Group
CACHE_SG=$(aws ec2 create-security-group \
  --group-name irisx-prod-sg-cache \
  --description "IRISX Redis cache" \
  --vpc-id $VPC_ID \
  --tag-specifications 'ResourceType=security-group,Tags=[{Key=Name,Value=irisx-prod-sg-cache},{Key=Project,Value=IRISX},{Key=Environment,Value=prod}]' \
  --query 'GroupId' \
  --output text)
echo -e "${GREEN}✓${NC} Cache Security Group created: ${CACHE_SG}"

# Allow Redis from API SG
aws ec2 authorize-security-group-ingress --group-id $CACHE_SG --protocol tcp --port 6379 --source-group $API_SG
echo -e "${GREEN}✓${NC} Cache Security Group rules added"

# Create DB Subnet Group
echo -e "${YELLOW}→${NC} Creating RDS subnet group..."
aws rds create-db-subnet-group \
  --db-subnet-group-name irisx-prod-db-subnet-group \
  --db-subnet-group-description "IRISX database subnet group" \
  --subnet-ids $DB_SUBNET_1A $DB_SUBNET_1B \
  --tags Key=Name,Value=irisx-prod-db-subnet-group Key=Project,Value=IRISX Key=Environment,Value=prod
echo -e "${GREEN}✓${NC} RDS subnet group created"

# Create ElastiCache Subnet Group
echo -e "${YELLOW}→${NC} Creating ElastiCache subnet group..."
aws elasticache create-cache-subnet-group \
  --cache-subnet-group-name irisx-prod-cache-subnet-group \
  --cache-subnet-group-description "IRISX cache subnet group" \
  --subnet-ids $DB_SUBNET_1A $DB_SUBNET_1B \
  --tags Key=Name,Value=irisx-prod-cache-subnet-group Key=Project,Value=IRISX Key=Environment,Value=prod
echo -e "${GREEN}✓${NC} ElastiCache subnet group created"

# Save configuration to file
echo -e "${YELLOW}→${NC} Saving configuration..."
cat > aws-infrastructure-ids.txt <<EOF
# IRISX AWS Infrastructure IDs
# Created: $(date)
# Region: us-east-1

VPC_ID=$VPC_ID
IGW_ID=$IGW_ID
PUBLIC_SUBNET_1A=$PUBLIC_SUBNET_1A
PUBLIC_SUBNET_1B=$PUBLIC_SUBNET_1B
DB_SUBNET_1A=$DB_SUBNET_1A
DB_SUBNET_1B=$DB_SUBNET_1B
PUBLIC_RT=$PUBLIC_RT
API_SG=$API_SG
DB_SG=$DB_SG
CACHE_SG=$CACHE_SG
EOF

echo -e "${GREEN}✓${NC} Configuration saved to aws-infrastructure-ids.txt"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ Network infrastructure created!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Create RDS PostgreSQL instance"
echo "2. Create ElastiCache Redis cluster"
echo "3. Launch EC2 instance"
echo "4. Create S3 bucket"
echo "5. Set up AWS Budgets"
echo ""
echo "Run: cat aws-infrastructure-ids.txt to see all resource IDs"
