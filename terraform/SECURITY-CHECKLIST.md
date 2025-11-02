# Fluxion AKS Security Checklist

Comprehensive security checklist for production AKS deployment.

## Pre-Deployment Security

### Azure Configuration

- [ ] **Azure AD RBAC enabled** (`enable_azure_ad_rbac = true`)
- [ ] **Managed identities used** (no service principals with passwords)
- [ ] **Private cluster enabled** for production (`enable_private_cluster = true`)
- [ ] **Appropriate Azure subscriptions** and resource group permissions configured
- [ ] **Network security groups** configured appropriately
- [ ] **Least privilege access** for all identities

### Terraform Security

- [ ] **Backend state encrypted** in Azure Storage
- [ ] **Backend storage access restricted** (no public access)
- [ ] **State versioning enabled** for rollback capability
- [ ] **Terraform variables** not containing secrets in version control
- [ ] **Sensitive outputs** marked as sensitive

## Cluster Security

### Network Security

- [ ] **Network policies enabled** (Calico configured)
- [ ] **Private cluster** for production workloads
- [ ] **Authorized IP ranges** configured (if public cluster)
- [ ] **Network segmentation** between node pools
- [ ] **NSGs configured** on subnets
- [ ] **Service CIDR** doesn't overlap with VNet

### Authentication & Authorization

- [ ] **Azure AD integration** enabled
- [ ] **RBAC enabled** on cluster
- [ ] **Kubernetes RBAC roles** defined for teams
- [ ] **No anonymous access** to API server
- [ ] **Admin credentials** secured and rotated
- [ ] **Service account tokens** have expiration

### Pod Security

- [ ] **Pod Security Standards** implemented
  - Restricted for production namespaces
  - Baseline for system namespaces
- [ ] **Security contexts** defined for all pods
- [ ] **Non-root users** for application containers
- [ ] **Read-only root filesystems** where possible
- [ ] **No privileged containers** (except system)
- [ ] **Resource limits** set on all pods

### Secret Management

- [ ] **Key Vault integration** enabled
- [ ] **CSI driver** installed and configured
- [ ] **Application secrets** stored in Key Vault
- [ ] **No secrets in ConfigMaps** or environment variables
- [ ] **Secrets encrypted at rest** in etcd
- [ ] **Secret rotation** policy defined

### Container Registry

- [ ] **ACR admin disabled** (`acr_admin_enabled = false`)
- [ ] **Managed identity** used for ACR pull
- [ ] **Image scanning** enabled (Defender for Containers)
- [ ] **Vulnerability scanning** in CI/CD pipeline
- [ ] **Signed images** (Azure Container Registry trust)
- [ ] **Private endpoints** for ACR (production)

## Monitoring & Logging

### Azure Monitor

- [ ] **Container Insights enabled** (`enable_oms_agent = true`)
- [ ] **Log Analytics workspace** configured
- [ ] **Diagnostic settings** enabled for AKS
- [ ] **Metric alerts** configured
- [ ] **Log retention** set appropriately (90 days for production)

### Audit Logging

- [ ] **Kubernetes audit logs** enabled and collected
- [ ] **Azure Activity logs** configured
- [ ] **Log queries** for security events created
- [ ] **Security alerts** configured in Azure Security Center

### OpenTelemetry

- [ ] **Tracing configured** for application
- [ ] **Metrics exported** to monitoring backend
- [ ] **Distributed tracing** across services

## Compliance & Governance

### Azure Policy

- [ ] **Azure Policy for AKS** enabled (production)
- [ ] **Policy assignments** reviewed and tested
- [ ] **Compliance reporting** configured
- [ ] **Policy exceptions** documented

### Defender for Cloud

- [ ] **Defender for Containers** enabled
- [ ] **Defender for Key Vault** enabled
- [ ] **Security recommendations** reviewed
- [ ] **Vulnerabilities remediated**

### Compliance Standards

- [ ] **CIS Kubernetes Benchmark** assessed
- [ ] **Regulatory requirements** identified (SOC 2, HIPAA, etc.)
- [ ] **Compliance reports** generated
- [ ] **Audit trail** maintained

## Backup & Disaster Recovery

### Backup Strategy

- [ ] **Velero installed** for cluster backups
- [ ] **Backup schedule** configured
- [ ] **Backup storage** secured
- [ ] **Backup encryption** enabled
- [ ] **PostgreSQL backups** configured
- [ ] **Backup testing** performed regularly

### Disaster Recovery

- [ ] **Recovery procedures** documented
- [ ] **RTO/RPO defined** and tested
- [ ] **Multi-region** strategy defined (if needed)
- [ ] **Terraform state** backed up
- [ ] **Runbooks created** for common failures

## Network Security

### Ingress Security

- [ ] **TLS/SSL enabled** on ingress
- [ ] **cert-manager configured** for certificate management
- [ ] **Let's Encrypt** or internal CA configured
- [ ] **HSTS headers** configured
- [ ] **Rate limiting** enabled
- [ ] **WAF configured** (Application Gateway WAF if using)

### Service Mesh (Optional)

- [ ] **Service mesh evaluated** (Istio, Linkerd)
- [ ] **mTLS between services** configured
- [ ] **Traffic policies** defined

## Application Security

### Image Security

- [ ] **Base images** from trusted sources
- [ ] **Minimal base images** used (distroless, alpine)
- [ ] **No secrets in images**
- [ ] **Image vulnerabilities** scanned in CI/CD
- [ ] **Regular image updates** scheduled

### Runtime Security

- [ ] **AppArmor/Seccomp** profiles applied
- [ ] **Runtime security scanning** enabled
- [ ] **Behavioral analysis** configured (optional)
- [ ] **Intrusion detection** system evaluated

## Access Control

### Azure Access

- [ ] **Just-in-time access** configured (PIM)
- [ ] **MFA enforced** for all users
- [ ] **Conditional access** policies applied
- [ ] **Break-glass accounts** secured
- [ ] **Regular access reviews** scheduled

### Kubernetes Access

- [ ] **kubeconfig secured** and not shared
- [ ] **Certificate-based auth** rotated regularly
- [ ] **kubectl access audited**
- [ ] **ServiceAccount RBAC** minimized
- [ ] **Third-party tool access** restricted

## Data Protection

### Encryption

- [ ] **Encryption at rest** enabled (Azure Disk Encryption)
- [ ] **Encryption in transit** enforced (TLS)
- [ ] **Database encryption** enabled (PostgreSQL)
- [ ] **Key management** documented
- [ ] **Key rotation** automated

### Data Classification

- [ ] **Sensitive data identified**
- [ ] **Data retention policies** defined
- [ ] **PII handling** compliant with regulations
- [ ] **Data loss prevention** measures implemented

## Incident Response

### Preparation

- [ ] **Security incident response plan** documented
- [ ] **On-call rotation** defined
- [ ] **Communication channels** established
- [ ] **Escalation procedures** documented
- [ ] **Security contacts** up to date

### Detection

- [ ] **Security monitoring** alerts configured
- [ ] **Anomaly detection** enabled
- [ ] **Log correlation** configured
- [ ] **Threat intelligence** integrated

### Response

- [ ] **Incident playbooks** created
- [ ] **Forensics tools** available
- [ ] **Isolation procedures** documented
- [ ] **Recovery procedures** tested

## Regular Security Tasks

### Daily

- [ ] Monitor security alerts
- [ ] Review failed authentication attempts
- [ ] Check for unusual activity

### Weekly

- [ ] Review access logs
- [ ] Check for new CVEs affecting cluster
- [ ] Verify backup completion

### Monthly

- [ ] Review and update RBAC policies
- [ ] Audit user access
- [ ] Patch cluster nodes
- [ ] Review security configurations

### Quarterly

- [ ] Conduct security assessment
- [ ] Update disaster recovery plan
- [ ] Test backup restoration
- [ ] Review and update security policies
- [ ] Penetration testing (if applicable)

### Annually

- [ ] Full security audit
- [ ] Compliance certification renewal
- [ ] Security training for team
- [ ] Review incident response procedures

## Security Tools

### Recommended Tools

- **Scanning**: Trivy, Snyk, Aqua Security
- **Policy**: OPA/Gatekeeper, Kyverno
- **Runtime Security**: Falco, Sysdig
- **Network**: Calico, Cilium
- **Secrets**: External Secrets Operator, Sealed Secrets
- **Monitoring**: Prometheus, Grafana
- **SIEM**: Azure Sentinel

## Verification Commands

### Check Pod Security

```bash
kubectl get psp  # Pod Security Policies (deprecated)
kubectl get pss  # Pod Security Standards
kubectl auth can-i --list --as=system:serviceaccount:default:default
```

### Check Network Policies

```bash
kubectl get networkpolicies -A
kubectl describe networkpolicy -n <namespace>
```

### Check RBAC

```bash
kubectl get clusterroles
kubectl get clusterrolebindings
kubectl get roles -A
kubectl get rolebindings -A
```

### Check Secrets

```bash
kubectl get secrets -A
kubectl get secretproviderclass -A  # CSI driver
```

### Check Azure Security

```bash
az security assessment list
az policy state list --resource-group <rg>
az defender assessment list
```

## References

- [AKS Security Best Practices](https://learn.microsoft.com/en-us/azure/aks/security-best-practices)
- [CIS Kubernetes Benchmark](https://www.cisecurity.org/benchmark/kubernetes)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [Azure Security Baseline for AKS](https://learn.microsoft.com/en-us/security/benchmark/azure/baselines/aks-security-baseline)
