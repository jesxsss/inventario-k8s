# Sistema de Inventario Monocromo (Kubernetes + CircleCI + GCP Free Tier + Grafana)

## 1. Configuración previa antes de subir a GitHub
1. Reemplaza `TU_USUARIO_DOCKER` por tu usuario real en:
   - `k8s/02-backend.yaml`
   - `k8s/03-frontend.yaml`

## 2. Crear VM Gratuita (Always Free) en Google Cloud
Ejecuta en **GCP Cloud Shell**:
```bash
gcloud compute instances create k8s-inventory-node \
  --zone=us-central1-a \
  --machine-type=e2-micro \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-standard \
  --tags=k8s-web

gcloud compute firewall-rules create allow-inventory-grafana \
  --allow=tcp:30080,tcp:30300,tcp:6443 \
  --target-tags=k8s-web
```

## 3. Instalar Swap + Kubernetes (k3s) en la VM
```bash
gcloud compute ssh k8s-inventory-node --zone=us-central1-a

sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

curl -sfL https://get.k3s.io | sh -
sudo chmod 644 /etc/rancher/k3s/k3s.yaml
```

Obtener el `KUBECONFIG_BASE64` reemplazando `127.0.0.1` por la IP pública de tu VM:
```bash
PUBLIC_IP=$(curl -s ifconfig.me)
sed "s/127.0.0.1/$PUBLIC_IP/g" /etc/rancher/k3s/k3s.yaml | base64 -w 0
```

## 4. Variables de entorno en CircleCI
En **Project Settings > Environment Variables**:
- `DOCKER_USER`: Usuario de Docker Hub
- `DOCKER_PASS`: Token de acceso de Docker Hub
- `KUBECONFIG_BASE64`: Salida Base64 del paso anterior

## 5. Accesos y Grafana
- **App Inventario (B&W):** `http://<IP_PUBLICA_VM>:30080`
- **Grafana:** `http://<IP_PUBLICA_VM>:30300` (`admin` / `admin2026`)
  - Data Source Prometheus URL: `http://prometheus-service:9090`
  - Métricas PromQL:
    - `inventory_low_stock_items`
    - `sum by (event_type) (rate(inventory_events_total[5m])) * 60`
