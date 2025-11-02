# Post-Deployment Validation Steps

Complete validation checklist after deploying AKS infrastructure.

## 1. Verify Infrastructure Deployment

### Terraform Outputs

```bash
cd terraform
terraform output
```

**Expected outputs:**
- ✅ Resource group name
- ✅ Cluster name and FQDN
- ✅ ACR login server
- ✅ Ingress public IP
- ✅ Log Analytics workspace ID
- ✅ Key Vault URI

### Azure Resources

Verify all resources were created:

```bash
# Resource group
az group show --name $(terraform output -raw resource_group_name)

# AKS cluster
az aks show \
  --resource-group $(terraform output -raw resource_group_name) \
  --name $(terraform output -raw cluster_name)

# ACR
az acr show --name $(terraform output -raw acr_name)

# Log Analytics
az monitor log-analytics workspace show \
  --resource-group $(terraform output -raw resource_group_name) \
  --workspace-name $(terraform output -raw log_analytics_workspace_name)

# Key Vault
az keyvault show \
  --name $(terraform output -raw cluster_name)-kv
```

## 2. Verify Kubernetes Cluster

### Configure kubectl

```bash
./scripts/configure-access.sh <environment>
```

### Check Cluster Info

```bash
kubectl cluster-info
kubectl version
```

**Expected output:**
- ✅ Kubernetes master running at cluster FQDN
- ✅ CoreDNS running
- ✅ Client and server versions match expected Kubernetes version

### Check Nodes

```bash
kubectl get nodes -o wide
```

**Verify:**
- ✅ All nodes are in "Ready" status
- ✅ Correct number of nodes (system + user node pools)
- ✅ Correct node sizes
- ✅ Kubernetes version matches configuration

**Detailed node information:**
```bash
kubectl describe nodes
```

### Check Node Pools

```bash
az aks nodepool list \
  --resource-group $(terraform output -raw resource_group_name) \
  --cluster-name $(terraform output -raw cluster_name) \
  --output table
```

**Verify:**
- ✅ System node pool exists with correct count
- ✅ User node pool exists with autoscaling enabled
- ✅ Correct VM sizes

## 3. Verify System Components

### Check System Pods

```bash
kubectl get pods -n kube-system
```

**All pods should be Running:**
- ✅ coredns-*
- ✅ metrics-server-*
- ✅ konnectivity-agent-*
- ✅ cloud-node-manager-*
- ✅ csi-azuredisk-node-*
- ✅ csi-azurefile-node-*

If OMS agent enabled:
- ✅ omsagent-*
- ✅ omsagent-rs-*

If Key Vault CSI driver enabled:
- ✅ secrets-store-csi-driver-*
- ✅ secrets-store-provider-azure-*

### Check System Services

```bash
kubectl get svc -n kube-system
```

**Verify:**
- ✅ kube-dns ClusterIP service
- ✅ metrics-server ClusterIP service

## 4. Verify Networking

### Check Network Plugin

```bash
kubectl get pods -n kube-system | grep azure-cni
```

### Test DNS Resolution

```bash
kubectl run test-dns --image=busybox:1.28 --rm -it --restart=Never -- nslookup kubernetes.default
```

**Expected output:**
- ✅ DNS resolution successful
- ✅ Returns ClusterIP of kubernetes service

### Check Network Policies

```bash
kubectl get networkpolicies -A
```

### Verify Public IP

```bash
# Get ingress public IP from Terraform
terraform output ingress_public_ip

# Verify it exists in Azure
az network public-ip show \
  --resource-group $(terraform output -raw node_resource_group) \
  --name $(terraform output -raw cluster_name)-ingress-pip
```

## 5. Verify Ingress Controller

If ingress-nginx was installed:

```

## 5. Verify Kubernetes Infrastructure Components

> **Note:** These components are installed via the bootstrap script (`./scripts/install-k8s-components.sh`),
> not by Terraform. Run the script before proceeding with these verification steps.

### Verify ingress-nginx

```bash
kubectl get pods -n ingress-nginx
kubectl get svc -n ingress-nginx
```

**Verify:**
- ✅ ingress-nginx-controller pod(s) running
- ✅ LoadBalancer service has EXTERNAL-IP
- ✅ EXTERNAL-IP matches Terraform public IP output

**Test ingress controller:**
```bash
curl http://$(terraform output -raw ingress_public_ip)
```

**Expected:** HTTP 404 (controller is running, no routes defined yet)

### Verify cert-manager

```bash
kubectl get pods -n cert-manager
kubectl get crds | grep cert-manager
```

**Verify:**
- ✅ cert-manager pod running
- ✅ cert-manager-webhook pod running
- ✅ cert-manager-cainjector pod running
- ✅ CRDs installed (certificates, issuers, etc.)

### Verify ArgoCD

```bash
kubectl get pods -n argocd
kubectl get svc -n argocd
```

**Verify:**
- ✅ argocd-server pod running
- ✅ argocd-repo-server pod running
- ✅ argocd-application-controller pod running
- ✅ argocd-redis pod running

**Test ArgoCD access:**
```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Open https://localhost:8080 in browser
```

## 6. Verify Azure Container Registry Integration

### Test ACR Authentication

```bash
./scripts/acr-login.sh <environment>
```

**Verify:**
- ✅ ingress-nginx-controller pod(s) running
- ✅ LoadBalancer service has EXTERNAL-IP
- ✅ EXTERNAL-IP matches Terraform public IP output

**Test ingress controller:**
```bash
curl http://$(terraform output -raw ingress_public_ip)
```

**Expected:** HTTP 404 (controller is running, no routes defined yet)

## 6. Verify cert-manager

If cert-manager was installed:

```bash
kubectl get pods -n cert-manager
kubectl get crds | grep cert-manager
```

**Verify:**
- ✅ cert-manager pod running
- ✅ cert-manager-webhook pod running
- ✅ cert-manager-cainjector pod running
- ✅ CRDs installed (certificates, issuers, etc.)

## 7. Verify Azure Container Registry Integration

### Test ACR Authentication

```bash
./scripts/acr-login.sh <environment>
```

**Expected:**
- ✅ Login successful

### Verify AKS Can Pull from ACR

```bash
# Check role assignment
az role assignment list \
  --scope $(terraform output -raw acr_id) \
  --query "[?roleDefinitionName=='AcrPull']"
```

**Test by deploying a pod from ACR:**

```bash
# Tag and push a test image
docker pull hello-world:latest
docker tag hello-world:latest $(terraform output -raw acr_login_server)/hello-world:test
docker push $(terraform output -raw acr_login_server)/hello-world:test

# Deploy test pod
kubectl run test-acr \
  --image=$(terraform output -raw acr_login_server)/hello-world:test \
  --restart=Never

# Check pod status
kubectl get pod test-acr
kubectl describe pod test-acr

# Cleanup
kubectl delete pod test-acr
az acr repository delete \
  --name $(terraform output -raw acr_name) \
  --image hello-world:test --yes
```

## 8. Verify Monitoring and Logging

### Check Container Insights

```bash
# Verify OMS agent is running
kubectl get pods -n kube-system | grep omsagent

# Check logs are flowing
az monitor log-analytics query \
  --workspace $(terraform output -raw log_analytics_workspace_id) \
  --analytics-query "ContainerLog | top 10 by TimeGenerated"
```

### Check Diagnostic Settings

```bash
az monitor diagnostic-settings list \
  --resource $(terraform output -raw cluster_id)
```

**Verify:**
- ✅ Diagnostic settings enabled
- ✅ Logs sent to Log Analytics workspace

### Test Metrics Collection

```bash
# Check metrics are available
kubectl top nodes
kubectl top pods -A
```

## 9. Verify Key Vault Integration

If Key Vault CSI driver enabled:

```bash
# Check CSI driver pods
kubectl get pods -n kube-system | grep secrets-store

# Create test secret in Key Vault
az keyvault secret set \
  --vault-name $(terraform output -raw cluster_name)-kv \
  --name test-secret \
  --value "test-value"

# Create SecretProviderClass to test
cat <<EOF | kubectl apply -f -
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: test-secret-provider
  namespace: default
spec:
  provider: azure
  parameters:
    keyvaultName: $(terraform output -raw cluster_name)-kv
    objects: |
      array:
        - |
          objectName: test-secret
          objectType: secret
    tenantId: $(az account show --query tenantId -o tsv)
EOF

# Deploy test pod
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: test-keyvault
  namespace: default
spec:
  containers:
  - name: test
    image: nginx:alpine
    volumeMounts:
    - name: secrets
      mountPath: "/mnt/secrets"
      readOnly: true
  volumes:
  - name: secrets
    csi:
      driver: secrets-store.csi.k8s.io
      readOnly: true
      volumeAttributes:
        secretProviderClass: "test-secret-provider"
EOF

# Wait for pod to be ready
kubectl wait --for=condition=Ready pod/test-keyvault --timeout=60s

# Verify secret was mounted
kubectl exec test-keyvault -- cat /mnt/secrets/test-secret

# Cleanup
kubectl delete pod test-keyvault
kubectl delete secretproviderclass test-secret-provider
az keyvault secret delete \
  --vault-name $(terraform output -raw cluster_name)-kv \
  --name test-secret
```

## 10. Verify Security Configuration

### Check RBAC

```bash
# Verify Azure AD RBAC is enabled
az aks show \
  --resource-group $(terraform output -raw resource_group_name) \
  --name $(terraform output -raw cluster_name) \
  --query "aadProfile"
```

### Check Network Policies

```bash
# Verify Calico is installed
kubectl get pods -n kube-system | grep calico
```

### Check Pod Security

```bash
# Check for security contexts
kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.securityContext}{"\n"}{end}' | head -n 20
```

## 11. Verify Storage Classes

```bash
kubectl get storageclass
```

**Expected storage classes:**
- ✅ azurefile (Azure Files)
- ✅ azurefile-premium
- ✅ azurefile-csi
- ✅ azurefile-csi-premium
- ✅ default (Azure Disk)
- ✅ managed-premium

**Test storage:**
```bash
# Create PVC
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: test-pvc
  namespace: default
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
  storageClassName: default
EOF

# Check PVC is bound
kubectl get pvc test-pvc

# Cleanup
kubectl delete pvc test-pvc
```

## 12. Performance Tests

### Test Node Scaling

If user node pool has autoscaling:

```bash
# Deploy test workload
kubectl create deployment test-scale --image=nginx:alpine --replicas=20

# Watch nodes scale up
kubectl get nodes -w

# Check horizontal pod autoscaler
kubectl get hpa

# Cleanup
kubectl delete deployment test-scale
```

### Test Network Performance

```bash
# Deploy iperf3 server
kubectl create deployment iperf3-server --image=networkstatic/iperf3 -- -s

# Expose service
kubectl expose deployment iperf3-server --port=5201

# Get server pod IP
SERVER_IP=$(kubectl get pod -l app=iperf3-server -o jsonpath='{.items[0].status.podIP}')

# Run client test
kubectl run iperf3-client --rm -it --image=networkstatic/iperf3 -- -c $SERVER_IP

# Cleanup
kubectl delete deployment iperf3-server
kubectl delete svc iperf3-server
```

## 13. Integration Tests

### Deploy Sample Application

```bash
# Deploy a simple app
kubectl create deployment test-app --image=nginx:alpine --replicas=2
kubectl expose deployment test-app --port=80 --type=LoadBalancer

# Wait for external IP
kubectl get svc test-app -w

# Test access
curl http://$(kubectl get svc test-app -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Cleanup
kubectl delete deployment test-app
kubectl delete svc test-app
```

### Test Ingress

If ingress-nginx is installed:

```bash
# Create ingress
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: test-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
  - http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: test-app
            port:
              number: 80
EOF

# Deploy backend
kubectl create deployment test-app --image=nginx:alpine
kubectl expose deployment test-app --port=80

# Test
curl http://$(terraform output -raw ingress_public_ip)

# Cleanup
kubectl delete ingress test-ingress
kubectl delete deployment test-app
kubectl delete svc test-app
```

## 14. Documentation Verification

- [ ] **Terraform outputs documented** in team wiki
- [ ] **Access procedures documented** for team
- [ ] **Monitoring dashboards created** and shared
- [ ] **Alert contacts configured**
- [ ] **Backup procedures documented**
- [ ] **Disaster recovery plan created**

## 15. Handoff Checklist

- [ ] All validation tests passed
- [ ] Monitoring configured and verified
- [ ] Alerts tested
- [ ] Documentation complete
- [ ] Team trained on access procedures
- [ ] Backup/restore tested
- [ ] Security scan completed
- [ ] Cost tracking configured

## Common Issues and Solutions

### Issue: Nodes not ready

**Solution:**
```bash
kubectl describe node <node-name>
kubectl logs -n kube-system <problematic-pod>
```

### Issue: Ingress controller not getting IP

**Solution:**
```bash
# Check service events
kubectl describe svc -n ingress-nginx ingress-nginx-controller

# Verify public IP exists
az network public-ip show --ids $(terraform output -raw ingress_public_ip_id)
```

### Issue: ACR authentication fails

**Solution:**
```bash
# Verify role assignment
az role assignment create \
  --assignee-object-id $(az aks show -g <rg> -n <cluster> --query identityProfile.kubeletidentity.objectId -o tsv) \
  --role AcrPull \
  --scope $(terraform output -raw acr_id)
```

## Next Steps

After validation:

1. ✅ Deploy Fluxion application (see [../deploy/README.md](../deploy/README.md))
2. ✅ Configure monitoring dashboards
3. ✅ Set up alerting rules
4. ✅ Configure backup schedule
5. ✅ Update DNS records (if applicable)
6. ✅ Configure TLS certificates
7. ✅ Load test application
8. ✅ Document runbooks

## Support

If validation fails, check:
- [Troubleshooting Guide](README.md#troubleshooting)
- [Azure AKS Documentation](https://docs.microsoft.com/en-us/azure/aks/)
- [GitHub Issues](https://github.com/wesback/fluxion/issues)
