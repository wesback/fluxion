# Cost Estimation and Optimization Guide

Detailed cost breakdown and optimization strategies for Fluxion AKS infrastructure.

## Monthly Cost Estimates (Sweden Central Region)

### Development Environment

| Service | Configuration | Monthly Cost |
|---------|--------------|--------------|
| **AKS Control Plane** | Free tier | $0 |
| **System Node Pool** | 2x Standard_D2s_v3 (24/7) | ~$96 |
| **User Node Pool** | 1-3x Standard_D4s_v3 (avg 2) | ~$96 |
| **Azure Container Registry** | Basic | $5 |
| **Log Analytics** | 5GB/month ingestion | ~$20 |
| **Key Vault** | Standard | ~$3 |
| **Storage** | Backup storage account | ~$5 |
| **Networking** | VNet, Public IP, NSG | ~$10 |
| **Azure Disk** | Premium SSD (50GB) | ~$10 |
| | |
| **Total Development** | | **~$245/month** |

**With optimization (8 hours/day, 5 days/week):**
- Stop cluster after hours: **~$90/month** savings
- **Optimized Total: ~$155/month**

### Staging Environment

| Service | Configuration | Monthly Cost |
|---------|--------------|--------------|
| **AKS Control Plane** | Free tier | $0 |
| **System Node Pool** | 2x Standard_D2s_v3 (24/7) | ~$96 |
| **User Node Pool** | 2-4x Standard_D4s_v3 (avg 3) | ~$144 |
| **Azure Container Registry** | Standard | $20 |
| **Log Analytics** | 10GB/month ingestion | ~$35 |
| **Key Vault** | Standard | ~$3 |
| **Storage** | Backup storage account | ~$8 |
| **Networking** | VNet, Public IP, NSG | ~$12 |
| **Azure Disk** | Premium SSD (100GB) | ~$20 |
| | |
| **Total Staging** | | **~$338/month** |

**With optimization (12 hours/day, 7 days/week):**
- Stop cluster after hours: **~$50/month** savings
- **Optimized Total: ~$288/month**

### Production Environment

| Service | Configuration | Monthly Cost |
|---------|--------------|--------------|
| **AKS Control Plane** | Standard tier with SLA | $73 |
| **System Node Pool** | 3x Standard_D2s_v3 (24/7) | ~$144 |
| **User Node Pool** | 2-6x Standard_D4s_v3 (avg 4) | ~$192 |
| **Azure Container Registry** | Premium with geo-replication | ~$670 |
| **Log Analytics** | 30GB/month ingestion | ~$75 |
| **Key Vault** | Standard | ~$3 |
| **Storage** | Backup storage account | ~$15 |
| **Networking** | VNet, Public IP, NSG, Private Link | ~$20 |
| **Azure Disk** | Premium SSD (200GB) | ~$40 |
| **Azure Policy** | Standard | ~$10 |
| **Defender for Containers** | Per node | ~$15 |
| | |
| **Total Production** | | **~$1,257/month** |

**With Reserved Instances (1-year commitment):**
- 30-40% savings on compute: **~$100/month** savings
- **Optimized Total: ~$1,157/month**

**With Reserved Instances (3-year commitment):**
- 50-60% savings on compute: **~$150/month** savings
- **Optimized Total: ~$1,107/month**

## Cost Breakdown by Category

### Compute Costs

**VM Pricing (Sweden Central, Pay-as-you-go):**

| VM Size | vCPUs | RAM | Monthly (24/7) | Hourly |
|---------|-------|-----|----------------|--------|
| Standard_D2s_v3 | 2 | 8GB | ~$96 | $0.096 |
| Standard_D4s_v3 | 4 | 16GB | ~$192 | $0.192 |
| Standard_D8s_v3 | 8 | 32GB | ~$384 | $0.384 |

**Reserved Instance Savings:**
- 1-year: 30-40% discount
- 3-year: 50-60% discount

**Spot Instance Pricing:**
- Up to 90% discount
- Use for dev/test workloads only
- Risk of eviction

### Storage Costs

**Azure Disk:**
| Type | Size | Monthly Cost |
|------|------|--------------|
| Standard HDD | 128GB | ~$2 |
| Standard SSD | 128GB | ~$6 |
| Premium SSD | 128GB | ~$20 |

**Azure Files:**
| Tier | Storage | Monthly Cost |
|------|---------|--------------|
| Standard | 100GB | ~$5 |
| Premium | 100GB | ~$13 |

**Storage Account (Backup):**
- LRS (Locally Redundant): ~$0.02/GB
- GRS (Geo Redundant): ~$0.05/GB

### Registry Costs

**Azure Container Registry:**
| SKU | Storage | Webhooks | Geo-replication | Monthly Cost |
|-----|---------|----------|-----------------|--------------|
| Basic | 10GB | 2 | No | $5 |
| Standard | 100GB | 10 | No | $20 |
| Premium | 500GB | 500 | Yes | $670 |

### Networking Costs

**Data Transfer:**
- Inbound: Free
- Outbound (first 5GB): Free
- Outbound (5-10TB): $0.087/GB
- Inter-region: $0.02/GB

**Other Networking:**
- Public IP: ~$3/month
- Load Balancer: ~$18/month
- VNet peering: $0.01/GB

### Monitoring Costs

**Log Analytics:**
- First 5GB/day: Free
- Additional: $2.30/GB
- Data retention (>31 days): $0.12/GB/month

**Azure Monitor:**
- Metrics: First 10 metrics free, then $0.10/metric
- Log queries: Pay per GB scanned

### Additional Costs

**Azure Policy:**
- Free: 20 assessments per subscription
- Standard: $5/resource/month after free tier

**Defender for Cloud:**
- Free tier: Basic recommendations
- Standard tier: $15/node/month for Containers

## Cost Optimization Strategies

### 1. Right-Size Your Resources

**Analyze actual usage:**
```bash
# Check node resource usage
kubectl top nodes

# Check pod resource usage
kubectl top pods -A

# Azure metrics
az monitor metrics list \
  --resource $(terraform output -raw cluster_id) \
  --metric "node_cpu_usage_percentage,node_memory_working_set_percentage"
```

**Recommendations:**
- Start small and scale up based on actual needs
- Use autoscaling to match demand
- Review metrics monthly and adjust

### 2. Use Reserved Instances for Production

**Savings:**
- 1-year: 30-40% discount
- 3-year: 50-60% discount

**Purchase Reserved Instances:**
```bash
az reservations reservation-order list
az reservations reservation-order purchase
```

**Best for:**
- Production workloads with predictable load
- Baseline capacity (not for autoscaled nodes)

### 3. Implement Cluster Auto-Stop for Dev/Staging

**Stop cluster after hours:**
```bash
# Stop cluster (keeps configuration, releases compute)
az aks stop \
  --resource-group fluxion-dev-rg \
  --name fluxion-dev-aks

# Start cluster
az aks start \
  --resource-group fluxion-dev-rg \
  --name fluxion-dev-aks
```

**Automation with Azure Automation:**
```bash
# Create runbook to stop/start on schedule
# Schedule: Mon-Fri 6PM stop, 8AM start
# Savings: ~60% on compute costs
```

**Estimated savings for dev environment:**
- 8 hours/day, 5 days/week: **~$90/month** (37% savings)
- 12 hours/day, 7 days/week: **~$50/month** (20% savings)

### 4. Use Spot Instances for Non-Critical Workloads

**Configure spot node pool:**
```hcl
resource "azurerm_kubernetes_cluster_node_pool" "spot" {
  name                  = "spot"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.main.id
  vm_size               = "Standard_D4s_v3"
  priority              = "Spot"
  eviction_policy       = "Delete"
  spot_max_price        = -1  # Pay up to regular price
  
  enable_auto_scaling = true
  min_count           = 0
  max_count           = 5
  
  node_labels = {
    "kubernetes.azure.com/scalesetpriority" = "spot"
  }
  
  node_taints = [
    "kubernetes.azure.com/scalesetpriority=spot:NoSchedule"
  ]
}
```

**Use for:**
- Batch processing
- CI/CD workloads
- Development/testing
- Stateless applications

**Savings:** Up to 90% on compute

### 5. Optimize Log Analytics

**Reduce ingestion:**
```bash
# Configure data collection rules
az monitor data-collection-rule create \
  --name limit-logs \
  --resource-group $(terraform output -raw resource_group_name) \
  --location $(terraform output -raw resource_group_location)
```

**Strategies:**
- Filter unnecessary logs at collection
- Use shorter retention for dev/staging
- Archive old logs to storage (cheaper)
- Use Azure Monitor alerts instead of log queries

**Savings:** ~$20-50/month by reducing ingestion by 50%

### 6. Use Basic ACR for Dev

**Development doesn't need:**
- Geo-replication
- High throughput
- Advanced security features

**Switch to Basic SKU for dev:**
- Savings: **$15/month** per environment

### 7. Optimize Storage

**Strategies:**
- Use Standard SSD instead of Premium where possible
- Set appropriate backup retention
- Clean up old images from ACR
- Use lifecycle policies for storage accounts

**ACR image cleanup:**
```bash
# Delete images older than 90 days
az acr run --cmd "acr purge --filter 'myrepo:.*' --ago 90d" \
  --registry $(terraform output -raw acr_name) /dev/null
```

### 8. Share Resources Across Environments

**Consider:**
- Single ACR for all environments (with namespaces)
- Shared Log Analytics workspace
- Shared Key Vault (with access policies)

**Savings:** ~$50-100/month

**Trade-offs:**
- Less isolation between environments
- More complex access control

### 9. Enable Azure Hybrid Benefit

If you have Windows Server licenses with Software Assurance:
- Apply licenses to Windows nodes
- Savings: Up to 40% on Windows VMs

### 10. Monitor and Analyze Costs

**Azure Cost Management:**
```bash
# View costs
az consumption usage list \
  --start-date 2024-01-01 \
  --end-date 2024-01-31

# Set budget alerts
az consumption budget create \
  --budget-name fluxion-monthly \
  --amount 1500 \
  --time-grain Monthly \
  --time-period start=2024-01-01
```

**Tools:**
- Azure Cost Management + Billing
- Azure Advisor recommendations
- Kubecost for Kubernetes-specific costs

## Total Cost of Ownership (TCO)

### 3-Year TCO Comparison

**Development (with optimization):**
- Monthly: $155
- Annual: $1,860
- 3-Year: **$5,580**

**Staging (with optimization):**
- Monthly: $288
- Annual: $3,456
- 3-Year: **$10,368**

**Production (with 3-year RIs):**
- Monthly: $1,107
- Annual: $13,284
- 3-Year: **$39,852**

**Total 3-Year TCO: ~$55,800**

### Additional Costs to Consider

**Team costs:**
- DevOps engineer time for management: $X/year
- Training and certification: $X/year

**Third-party tools:**
- Monitoring (Datadog, New Relic): $X/month
- Security scanning: $X/month
- Backup solutions (Velero): Free (OSS)

**Support:**
- Azure Support plan: $29-1,000+/month
- Incident response: Variable

## Cost Allocation and Chargeback

### Tagging Strategy

```hcl
tags = {
  Environment = "production"
  CostCenter  = "engineering"
  Project     = "fluxion"
  Owner       = "devops-team"
  Application = "package-tracking"
}
```

### Cost Reports

```bash
# Costs by tag
az consumption usage list \
  --start-date 2024-01-01 \
  --end-date 2024-01-31 \
  --query "[?tags.Project=='fluxion']"
```

## Budget Recommendations

**Development:**
- Set monthly budget: $200
- Alert at 80%: $160
- Alert at 100%: $200

**Staging:**
- Set monthly budget: $350
- Alert at 80%: $280
- Alert at 100%: $350

**Production:**
- Set monthly budget: $1,500
- Alert at 80%: $1,200
- Alert at 100%: $1,500
- Alert at 120%: $1,800 (overage)

## Cost Optimization Checklist

- [ ] Right-size VMs based on actual usage
- [ ] Purchase Reserved Instances for production
- [ ] Implement auto-stop for dev/staging
- [ ] Use Spot instances for appropriate workloads
- [ ] Optimize Log Analytics ingestion
- [ ] Use appropriate ACR SKU per environment
- [ ] Set up budget alerts
- [ ] Review costs monthly
- [ ] Clean up unused resources
- [ ] Enable Azure Hybrid Benefit (if applicable)
- [ ] Configure resource tags for cost allocation
- [ ] Document cost optimization decisions

## Monitoring Costs Over Time

**Monthly review:**
1. Check Azure Cost Management dashboard
2. Compare actual vs. budget
3. Review anomaly alerts
4. Analyze cost trends
5. Identify optimization opportunities

**Quarterly review:**
1. Assess Reserved Instance utilization
2. Review node pool sizing
3. Evaluate environment needs
4. Update budgets if needed
5. Implement new optimizations

## References

- [Azure Pricing Calculator](https://azure.microsoft.com/pricing/calculator/)
- [AKS Pricing](https://azure.microsoft.com/pricing/details/kubernetes-service/)
- [Azure Cost Management Documentation](https://docs.microsoft.com/azure/cost-management-billing/)
- [Kubecost for Kubernetes](https://www.kubecost.com/)
