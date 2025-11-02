# Fluxion AKS Infrastructure Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Internet / External Users                        │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   │ HTTPS
                                   │
┌──────────────────────────────────▼──────────────────────────────────────┐
│                           Azure Public IP                                │
│                     (Static IP for Ingress)                             │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────────┐
│                        Azure Load Balancer                               │
│                         (Standard SKU)                                   │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   Virtual Network (VNet)     │
                    │   CIDR: 10.X.0.0/16         │
                    └──────────────┬──────────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
┌───────────▼─────────┐ ┌─────────▼─────────┐ ┌─────────▼─────────┐
│ Node Subnet         │ │ Pod Subnet        │ │ Private Link      │
│ 10.X.1.0/24        │ │ 10.X.2.0/23      │ │ (Optional)        │
│ + NSG              │ │ + Delegation      │ └───────────────────┘
└─────────┬───────────┘ └───────────────────┘
          │
          │
┌─────────▼────────────────────────────────────────────────────────────────┐
│                    AKS Cluster (Managed Kubernetes)                       │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Control Plane (Managed by Azure)              │   │
│  │  • API Server                                                     │   │
│  │  • Scheduler                                                      │   │
│  │  • Controller Manager                                             │   │
│  │  • etcd                                                          │   │
│  │  • Cloud Controller Manager                                       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      System Node Pool                             │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                          │   │
│  │  │ Node 1  │  │ Node 2  │  │ Node 3  │                          │   │
│  │  │ D2s_v3  │  │ D2s_v3  │  │ D2s_v3  │                          │   │
│  │  └─────────┘  └─────────┘  └─────────┘                          │   │
│  │  • kube-system pods                                               │   │
│  │  • CoreDNS                                                        │   │
│  │  • OMS Agent                                                      │   │
│  │  • CSI Drivers                                                    │   │
│  │  • Calico (Network Policy)                                        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                       User Node Pool                              │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │   │
│  │  │ Node 1  │  │ Node 2  │  │ Node 3  │  │ Node 4  │            │   │
│  │  │ D4s_v3  │  │ D4s_v3  │  │ D4s_v3  │  │ D4s_v3  │            │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │   │
│  │  • Application pods (Fluxion API)                                 │   │
│  │  • PostgreSQL StatefulSet                                         │   │
│  │  • Autoscaling (2-6 nodes)                                        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Ingress Controller                             │   │
│  │  • nginx-ingress (LoadBalancer Service)                           │   │
│  │  • Routes traffic to services                                     │   │
│  │  • TLS termination                                                │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    cert-manager                                   │   │
│  │  • Automated certificate management                               │   │
│  │  • Let's Encrypt integration                                      │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
           │                    │                    │
           │                    │                    │
           ▼                    ▼                    ▼
┌────────────────────┐  ┌──────────────────┐  ┌────────────────────┐
│ Azure Container    │  │ Log Analytics    │  │ Key Vault          │
│ Registry (ACR)     │  │ Workspace        │  │                    │
│                    │  │                  │  │ • Secrets          │
│ • Docker images    │  │ • Container logs │  │ • CSI Driver       │
│ • Managed identity │  │ • Metrics        │  │ • Access policies  │
│ • Geo-replication  │  │ • Diagnostics    │  │                    │
└────────────────────┘  └──────────────────┘  └────────────────────┘

┌────────────────────┐  ┌──────────────────┐  ┌────────────────────┐
│ Storage Account    │  │ Azure Monitor    │  │ Azure Policy       │
│ (Backups)          │  │                  │  │ (Optional)         │
│                    │  │ • Alerts         │  │                    │
│ • Velero backups   │  │ • Dashboards     │  │ • Compliance       │
│ • Blob versioning  │  │ • Metrics        │  │ • Governance       │
└────────────────────┘  └──────────────────┘  └────────────────────┘
```

## Network Flow Diagram

```
External Request Flow:
─────────────────────

1. User/Client
   │
   └─► Internet
       │
       └─► Public IP (Azure Load Balancer)
           │
           └─► VNet (10.X.0.0/16)
               │
               └─► Node Subnet (10.X.1.0/24)
                   │
                   └─► Ingress Controller Pod
                       │
                       └─► Application Service
                           │
                           └─► Application Pod (10.X.2.0/23)
                               │
                               └─► PostgreSQL StatefulSet
```

## Detailed Component Architecture

### 1. Networking Layer

```
┌─────────────────────────────────────────────────────────────┐
│                     Virtual Network                         │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Node Subnet (10.X.1.0/24)                          │    │
│  │ • AKS Nodes (VMs)                                  │    │
│  │ • Associated NSG                                    │    │
│  │ • Service Endpoints                                 │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Pod Subnet (10.X.2.0/23)                           │    │
│  │ • Pod IPs (Azure CNI)                              │    │
│  │ • Delegated to AKS                                 │    │
│  │ • Direct routing                                    │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  Network Policy: Calico                                      │
│  • Pod-to-pod traffic control                               │
│  • Namespace isolation                                       │
│  • Ingress/Egress rules                                      │
└─────────────────────────────────────────────────────────────┘
```

### 2. AKS Cluster Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AKS Cluster Identity                      │
│  • System Assigned Managed Identity                          │
│  • Kubelet Identity (for ACR pull)                          │
│  • Key Vault Secrets Provider Identity                       │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ Manages
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Node Resource Group                       │
│  (MC_fluxion-{env}-rg_{cluster}_{region})                  │
│                                                              │
│  • Node VMs and disks                                        │
│  • Load balancer                                             │
│  • Route tables                                              │
│  • Network interfaces                                        │
│  • NSGs                                                      │
└─────────────────────────────────────────────────────────────┘
```

### 3. Storage Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Storage Classes                          │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Azure Disk (default)                               │    │
│  │ • Premium SSD                                      │    │
│  │ • ReadWriteOnce                                    │    │
│  │ • For databases, stateful apps                     │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Azure Files                                        │    │
│  │ • Standard/Premium                                 │    │
│  │ • ReadWriteMany                                    │    │
│  │ • For shared storage                               │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 4. Monitoring Stack

```
┌─────────────────────────────────────────────────────────────┐
│                   Monitoring & Logging                       │
│                                                              │
│  AKS Cluster                                                 │
│      │                                                        │
│      ├─► Container Insights (OMS Agent)                     │
│      │   └─► Log Analytics Workspace                        │
│      │       • Container logs                                │
│      │       • Performance data                              │
│      │       • Inventory data                                │
│      │                                                        │
│      ├─► Diagnostic Settings                                 │
│      │   └─► Log Analytics                                   │
│      │       • Control plane logs                            │
│      │       • Audit logs                                    │
│      │       • Metrics                                       │
│      │                                                        │
│      └─► Application (Fluxion)                              │
│          └─► OpenTelemetry                                   │
│              • OTLP Collector                                │
│              • Traces                                         │
│              • Metrics                                        │
│              • Custom instrumentation                         │
└─────────────────────────────────────────────────────────────┘
```

### 5. Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Security Layers                          │
│                                                              │
│  Layer 1: Network Security                                   │
│  • NSGs on subnets                                          │
│  • Network policies (Calico)                                │
│  • Private cluster option                                    │
│                                                              │
│  Layer 2: Identity & Access                                  │
│  • Azure AD RBAC                                            │
│  • Managed identities                                        │
│  • Kubernetes RBAC                                           │
│                                                              │
│  Layer 3: Secret Management                                  │
│  • Azure Key Vault                                          │
│  • CSI Secrets Store driver                                 │
│  • No secrets in code/images                                │
│                                                              │
│  Layer 4: Container Security                                 │
│  • Image scanning (ACR)                                     │
│  • Pod security standards                                    │
│  • Security contexts                                         │
│                                                              │
│  Layer 5: Monitoring & Compliance                            │
│  • Audit logging                                            │
│  • Azure Policy                                             │
│  • Defender for Containers                                   │
└─────────────────────────────────────────────────────────────┘
```

## Resource Relationships

```
Resource Group
│
├─► Virtual Network
│   ├─► Node Subnet
│   ├─► Pod Subnet
│   └─► NSGs
│
├─► AKS Cluster
│   ├─► System Node Pool (depends on: Node Subnet)
│   ├─► User Node Pool (depends on: Node Subnet, Pod Subnet)
│   └─► Managed Identity
│
├─► Container Registry
│   └─► Role Assignment (AKS → ACR)
│
├─► Log Analytics Workspace
│   └─► Diagnostic Settings (AKS → Log Analytics)
│
├─► Key Vault
│   ├─► Access Policy (Current User)
│   └─► Access Policy (AKS Secrets Provider)
│
├─► Storage Account (Backups)
│   └─► Blob Container
│
└─► Public IP
    └─► Ingress Controller (via Load Balancer)
```

## Terraform Module Dependencies

```
main.tf
│
├─► azurerm_resource_group
│
├─► module.networking (depends on: resource_group)
│   ├─► azurerm_virtual_network
│   ├─► azurerm_subnet (nodes)
│   ├─► azurerm_subnet (pods)
│   ├─► azurerm_network_security_group
│   └─► azurerm_public_ip
│
├─► module.acr (depends on: resource_group)
│   ├─► azurerm_container_registry
│   └─► azurerm_storage_account (backups)
│
├─► module.monitoring (depends on: resource_group, aks)
│   ├─► azurerm_log_analytics_workspace
│   ├─► azurerm_monitor_diagnostic_setting
│   └─► azurerm_key_vault
│
├─► module.aks (depends on: resource_group, networking, acr, monitoring)
│   ├─► azurerm_kubernetes_cluster
│   ├─► azurerm_kubernetes_cluster_node_pool
│   ├─► azurerm_role_assignment (ACR pull)
│   └─► azurerm_role_assignment (Network contributor)
│
└─► outputs (cluster credentials, endpoints, etc.)

Note: Kubernetes infrastructure components (ingress-nginx, cert-manager, ArgoCD)
      are installed via post-deployment script, not Terraform.
```

## Data Flow Diagrams

### 1. Application Deployment Flow

```
Developer
   │
   │ 1. Build image
   ├──────────────► Container Registry (ACR)
   │                      │
   │                      │ 2. Store image
   │                      ▼
   │                [Image Repository]
   │
   │ 3. Update manifest
   ├──────────────► Git Repository
   │                      │
   │                      │ 4. Detect change
   │                      ▼
   │                   ArgoCD
   │                      │
   │                      │ 5. Pull manifest
   │                      │ 6. Pull image (via managed identity)
   │                      ▼
   └──────────────► AKS Cluster
                          │
                          │ 7. Deploy
                          ▼
                    Application Pod
```

### 2. Request Handling Flow

```
User Request
   │
   ├─► Public IP
   │      │
   │      ├─► Load Balancer
   │      │      │
   │      │      ├─► Node Subnet
   │      │      │      │
   │      │      │      ├─► Ingress Controller Pod
   │      │      │      │      │
   │      │      │      │      ├─► Service
   │      │      │      │      │      │
   │      │      │      │      │      ├─► Application Pod (Pod Subnet)
   │      │      │      │      │      │      │
   │      │      │      │      │      │      ├─► PostgreSQL Pod
   │      │      │      │      │      │      │      │
   │      │      │      │      │      │      │      └─► Persistent Volume
   │      │      │      │      │      │      │
   │      │      │      │      │      │      ├─► Log Analytics
   │      │      │      │      │      │      │
   │      │      │      │      │      │      └─► Key Vault (secrets)
   │      │      │      │      │      │
   │      │      │      │      │      └─► Response
   │      │      │      │      │
   │      │      │      │      └─► User
```

### 3. Logging & Monitoring Flow

```
AKS Cluster
   │
   ├─► Container Logs
   │      │
   │      └─► OMS Agent
   │             │
   │             └─► Log Analytics Workspace
   │                    │
   │                    └─► Azure Monitor
   │                           │
   │                           └─► Alerts / Dashboards
   │
   ├─► Control Plane Logs
   │      │
   │      └─► Diagnostic Settings
   │             │
   │             └─► Log Analytics Workspace
   │
   └─► Application Traces
          │
          └─► OTLP Collector
                 │
                 └─► Backend (Jaeger/Tempo/etc.)
```

## Scalability Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Horizontal Scaling                          │
│                                                              │
│  User Node Pool                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Min: 2 nodes ──────► Auto Scale ──────► Max: 6 nodes│  │
│  └──────────────────────────────────────────────────────┘  │
│          │                                      ▲            │
│          │                                      │            │
│          │ Triggers based on:                  │            │
│          └─► CPU > 75%  ─────────────────────► │            │
│          └─► Memory > 75% ────────────────────► │            │
│          └─► Custom metrics ───────────────────► │            │
│                                                              │
│  Application Pods (HPA)                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Min: 2 replicas ──► Auto Scale ──► Max: 10 replicas │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Disaster Recovery Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Primary Region (Sweden Central)                  │
│                                                              │
│  AKS Cluster                                                 │
│  ┌─────────────────────────────────────────────────┐        │
│  │ • Application Workloads                         │        │
│  │ • PostgreSQL with persistent storage            │        │
│  └─────────────────────────────────────────────────┘        │
│                          │                                    │
│                          │ Continuous Backup                  │
│                          ▼                                    │
│  ┌─────────────────────────────────────────────────┐        │
│  │ Velero Backup                                   │        │
│  │ • Cluster state                                 │        │
│  │ • Application configs                           │        │
│  │ • Persistent volumes                            │        │
│  └─────────────────────────────────────────────────┘        │
│                          │                                    │
│                          │ Store backups                      │
│                          ▼                                    │
│  ┌─────────────────────────────────────────────────┐        │
│  │ Azure Storage (GRS)                             │        │
│  │ • Geo-replicated to secondary region            │        │
│  └─────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ Replicated to
                          ▼
┌─────────────────────────────────────────────────────────────┐
│         Secondary Region (Germany West Central) - DR Site    │
│                                                              │
│  • Terraform configs (identical)                             │
│  • Infrastructure ready to provision                         │
│  • Restore from backup on failover                          │
└─────────────────────────────────────────────────────────────┘
```

## High Availability Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Availability Zones                        │
│                                                              │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  │
│  │   Zone 1      │  │   Zone 2      │  │   Zone 3      │  │
│  │               │  │               │  │               │  │
│  │ System Nodes  │  │ System Nodes  │  │ System Nodes  │  │
│  │ User Nodes    │  │ User Nodes    │  │ User Nodes    │  │
│  │               │  │               │  │               │  │
│  └───────────────┘  └───────────────┘  └───────────────┘  │
│                                                              │
│  Load Balancer distributes across zones                      │
│  • Zone-redundant public IP                                  │
│  • Health checks on each node                               │
│  • Automatic failover                                        │
└─────────────────────────────────────────────────────────────┘
```

## References

- [Azure AKS Architecture](https://docs.microsoft.com/en-us/azure/architecture/reference-architectures/containers/aks/baseline-aks)
- [Terraform AzureRM Provider](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs)
- [Kubernetes Architecture](https://kubernetes.io/docs/concepts/architecture/)
